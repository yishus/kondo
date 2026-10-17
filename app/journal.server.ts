import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import { data } from "react-router";
import type { Database } from "./db.server";
import { journalEntries, journalImages } from "./db/schema";
import { journalImageError, journalImageKey, journalImageSignature, MAX_JOURNAL_BODY, MAX_JOURNAL_IMAGE_BYTES, MAX_JOURNAL_IMAGES } from "./journal";
import { readTimezone } from "./timezones";

// Reuse this predicate for both the feed and direct image requests.
export const journalVisibilityCondition = (userId: string) => or(eq(journalEntries.visibility, "public"), eq(journalEntries.userId, userId));
export const visibleJournalEntries = (tripId: string, userId: string) => and(
  eq(journalEntries.tripId, tripId),
  journalVisibilityCondition(userId),
);

export async function loadJournal(db: Database, tripId: string, userId: string, cursor: string | null) {
  const [beforeDate, beforeId] = cursor?.split("|") ?? [];
  const before = beforeDate && beforeId ? or(lt(journalEntries.createdAt, beforeDate),
    and(eq(journalEntries.createdAt, beforeDate), lt(journalEntries.id, beforeId))) : undefined;
  const rows = await db.query.journalEntries.findMany({
    where: and(visibleJournalEntries(tripId, userId), before),
    orderBy: [desc(journalEntries.createdAt), desc(journalEntries.id)], limit: 31,
    with: { author: { columns: { name: true } }, images: { orderBy: (image) => asc(image.position) } },
  });
  const page = rows.slice(0, 30);
  const last = page.at(-1);
  return {
    entries: page.map(({ author, ...entry }) => ({ ...entry, author: author.name })),
    nextCursor: rows.length > 30 && last ? `${last.createdAt}|${last.id}` : null,
  };
}

const fail = (error: string, status = 400) => data({ ok: false as const, error }, { status, headers: { "Cache-Control": "private, no-store" } });

async function readJournalForm(request: Request) {
  const max = MAX_JOURNAL_IMAGES * MAX_JOURNAL_IMAGE_BYTES + 128_000;
  if (Number(request.headers.get("Content-Length")) > max) throw new Error("Upload up to five images, each under 10 MB.");
  if (!request.body) throw new Error("Add a note or an image.");
  let length = 0;
  // Bound the stream before parsing without keeping a second complete body in
  // memory. Five camera images can otherwise exceed a Worker's memory budget.
  const bounded = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      length += chunk.byteLength;
      if (length > max) throw new Error("Upload up to five images, each under 10 MB.");
      controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(bounded, { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData();
  } catch {
    throw new Error(length > max ? "Upload up to five images, each under 10 MB." : "Could not read this entry. Please try again.");
  }
}

export async function addJournalEntry(db: Database, bucket: R2Bucket, tripId: string, userId: string, request: Request) {
  if (request.method !== "POST") return fail("Method not allowed.", 405);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return fail("Please add journal entries from this app.", 403);
  let form: FormData;
  try { form = await readJournalForm(request); } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not read this entry.");
  }
  const body = form.get("body");
  const visibility = form.get("visibility");
  if (typeof body !== "string" || body.length > MAX_JOURNAL_BODY) return fail(`Keep your note under ${MAX_JOURNAL_BODY.toLocaleString()} characters.`);
  if (visibility !== "private" && visibility !== "public") return fail("Choose private or public visibility.");
  const timezone = readTimezone(form.get("timezone"));
  if (!timezone.ok) return fail(timezone.error);
  const fields = form.getAll("images");
  if (fields.some((field) => typeof field === "string" && field !== "")) return fail("Choose image files only.");
  const files = fields.filter((field): field is File => typeof field !== "string").filter((file) => file.size || file.name);
  if (files.length > MAX_JOURNAL_IMAGES) return fail("Add up to five images per entry.");
  if (!body.trim() && !files.length) return fail("Add a note or at least one image.");
  for (const file of files) {
    const error = journalImageError(file);
    if (error) return fail(error);
    if (!journalImageSignature(file.type, new Uint8Array(await file.slice(0, 12).arrayBuffer()))) return fail(`“${file.name}” is not a valid image.`);
  }
  const entryId = crypto.randomUUID();
  const images = files.map((file, position) => ({
    id: crypto.randomUUID(), entryId, position, size: file.size, contentType: file.type,
    filename: Array.from(file.name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "")).slice(0, 200).join("") || "image",
  }));
  const uploaded: string[] = [];
  try {
    for (const [index, image] of images.entries()) {
      const key = journalImageKey(tripId, entryId, image.id);
      uploaded.push(key);
      await bucket.put(key, files[index].stream(), { httpMetadata: { contentType: image.contentType } });
    }
    // The timestamp is assigned by the server after upload; users cannot backdate entries.
    const entry = db.insert(journalEntries).values({ id: entryId, tripId, userId, body: body.trim(), visibility, createdAt: new Date().toISOString(), timezone: timezone.timezone || "UTC" });
    if (images.length) await db.batch([entry, db.insert(journalImages).values(images)]);
    else await entry;
  } catch {
    if (uploaded.length) await bucket.delete(uploaded).catch(() => console.error("Could not clean up failed journal uploads"));
    return fail("Could not save your entry. Your draft is still here; please try again.", 500);
  }
  return data({ ok: true as const, error: null, savedId: entryId }, { headers: { "Cache-Control": "private, no-store" } });
}
