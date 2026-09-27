import { and, asc, eq } from "drizzle-orm";
import { data } from "react-router";
import { v7 as uuidv7 } from "uuid";
import type { Database } from "./db.server";
import { accommodationDocuments, accommodationPlaces, accommodations, trips } from "./db/schema";
import { readAccommodation } from "./accommodations";
import { readCardLocation } from "./card-location";
import { MAX_ATTACHMENT_SIZE } from "./attachments";

export const documentKey = (accommodationId: string, id: string) => `accommodations/${accommodationId}/${id}`;
const fail = (error: string, status = 400) => data({ ok: false as const, error }, { status });
const success = () => ({ ok: true as const, error: null });

export async function loadAccommodations(db: Database, tripId: string) {
  const places = await db.select().from(accommodationPlaces).where(eq(accommodationPlaces.tripId, tripId)).orderBy(asc(accommodationPlaces.id));
  const rows = await db.select({ accommodation: accommodations, document: accommodationDocuments }).from(accommodations)
    .innerJoin(accommodationPlaces, eq(accommodationPlaces.id, accommodations.placeId))
    .leftJoin(accommodationDocuments, eq(accommodationDocuments.accommodationId, accommodations.id))
    .where(eq(accommodationPlaces.tripId, tripId)).orderBy(asc(accommodations.id));
  return { places: places.map((place) => ({ ...place, candidates: rows.filter((row) => row.accommodation.placeId === place.id).map((row) => ({ ...row.accommodation, document: row.document })) })) };
}

export async function accommodationAction(db: Database, bucket: R2Bucket, tripId: string, request: Request) {
  if (Number(request.headers.get("Content-Length")) > 11 * 1024 * 1024) return fail("Choose a PDF of 10 MB or smaller.", 413);
  const [trip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return fail("That trip no longer exists.", 404);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("The form could not be read. Please try again."); }
  const get = (key: string) => typeof form.get(key) === "string" ? (form.get(key) as string).trim() : "";
  const intent = get("intent");
  const name = get("name");
  if (intent === "add-place") {
    if (!name || name.length > 200) return fail("Enter a city, area, or region (up to 200 characters).");
    await db.insert(accommodationPlaces).values({ id: uuidv7(), tripId, name });
    return success();
  }
  const placeId = get("placeId");
  const [place] = await db.select().from(accommodationPlaces).where(and(eq(accommodationPlaces.id, placeId), eq(accommodationPlaces.tripId, tripId))).limit(1);
  if (!place) return fail("That place no longer exists on this trip.", 404);
  if (intent === "rename-place") {
    if (!name || name.length > 200) return fail("Enter a city, area, or region (up to 200 characters).");
    await db.update(accommodationPlaces).set({ name }).where(eq(accommodationPlaces.id, place.id));
    return success();
  }
  if (intent === "delete-place") {
    const docs = await db.select({ document: accommodationDocuments }).from(accommodationDocuments).innerJoin(accommodations, eq(accommodations.id, accommodationDocuments.accommodationId)).where(eq(accommodations.placeId, place.id));
    await db.delete(accommodationPlaces).where(eq(accommodationPlaces.id, place.id));
    if (docs.length) await bucket.delete(docs.map(({ document }) => documentKey(document.accommodationId, document.id))).catch(() => console.error("Could not clean up accommodation documents"));
    return success();
  }
  if (!["add-candidate", "save-candidate", "delete-candidate"].includes(intent)) return fail("Unknown accommodation action.");
  const id = intent === "add-candidate" ? uuidv7() : get("accommodationId");
  const [current] = await db.select().from(accommodations).where(and(eq(accommodations.id, id), eq(accommodations.placeId, place.id))).limit(1);
  if (intent !== "add-candidate" && !current) return fail("That accommodation no longer exists.", 404);
  const [existingDocument] = await db.select().from(accommodationDocuments).where(eq(accommodationDocuments.accommodationId, id)).limit(1);
  if (intent === "delete-candidate") {
    await db.delete(accommodations).where(eq(accommodations.id, id));
    if (existingDocument) await bucket.delete(documentKey(id, existingDocument.id)).catch(() => console.error("Could not clean up accommodation document"));
    return success();
  }
  const parsed = readAccommodation(form);
  if (parsed.error) return fail(parsed.error);
  const location = readCardLocation(form, current);
  if (!location.ok) return fail(location.error);
  const fields = form.getAll("document").filter((field) => typeof field === "string" ? field !== "" : field.name || field.size);
  if (fields.length > 1 || fields.some((field) => typeof field === "string")) return fail("Choose one booking confirmation PDF.");
  const file = fields[0] as File | undefined;
  if (file) {
    if (!/\.pdf$/i.test(file.name) || !file.size || file.size > MAX_ATTACHMENT_SIZE) return fail("Choose a non-empty PDF of 10 MB or smaller.");
    if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-") return fail("The selected file is not a valid PDF.");
  }
  const removeDocument = form.get("removeDocument") === "on" || !!file;
  const upload = file ? {
    id: uuidv7(), accommodationId: id, size: file.size,
    filename: Array.from(file.name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "")).slice(0, 200).join("") || "booking.pdf",
  } : null;
  const values = { ...parsed.value!, googlePlaceId: location.location.googlePlaceId, googleMapsQuery: location.location.googleMapsQuery };
  try {
    if (file && upload) await bucket.put(documentKey(id, upload.id), file.stream(), { httpMetadata: { contentType: "application/pdf" } });
    await db.batch([
      intent === "add-candidate" ? db.insert(accommodations).values({ ...values, id, placeId }) : db.update(accommodations).set(values).where(and(eq(accommodations.id, id), eq(accommodations.placeId, placeId))),
      ...(removeDocument ? [db.delete(accommodationDocuments).where(eq(accommodationDocuments.accommodationId, id))] : []),
      ...(upload ? [db.insert(accommodationDocuments).values(upload)] : []),
    ]);
  } catch {
    if (upload) await bucket.delete(documentKey(id, upload.id)).catch(() => console.error("Could not clean up failed booking upload"));
    return fail("Could not save this accommodation. Please try again.", 500);
  }
  if (removeDocument && existingDocument) await bucket.delete(documentKey(id, existingDocument.id)).catch(() => console.error("Could not clean up replaced booking document"));
  return success();
}
