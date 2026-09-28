import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { data } from "react-router";
import { v7 as uuidv7 } from "uuid";

import { attachmentFileError, isImageAttachment, MAX_ATTACHMENTS } from "./attachments";
import type { Database } from "./db.server";
import { cardAttachments, cards } from "./db/schema";
import { GPX_CONTENT_TYPE, gpxFileError, parseGpx, type HikeTrack } from "./hike-gpx";
import { attachmentKey, attachmentStorageKeys, hikePreviewKey } from "./attachment-storage";
import { saveHikePreview } from "./hike-preview.server";

export { attachmentKey } from "./attachment-storage";

export async function saveCardWithAttachments(
  db: Database,
  bucket: R2Bucket,
  cardId: string,
  form: FormData,
  mutation: (coverAttachmentId: string | null) => BatchItem<"sqlite"> | BatchItem<"sqlite">[],
  options: { allowCover: boolean; currentCoverAttachmentId?: string | null; allowGpx?: boolean; previewReferer?: string },
) {
  const fail = (error: string, status = 400) => data({ ok: false as const, error }, { status });
  const fields = form.getAll("attachments");
  if (fields.some((field) => typeof field === "string" && field !== "")) return fail("Choose JPG, PNG or PDF files only.");
  // An unselected input is an unnamed File or an empty string, depending on
  // the runtime's multipart parser. Neither represents an upload.
  const files = fields.filter((field): field is File => typeof field !== "string")
    .filter((file) => file.name || file.size);
  const existing = await db.select().from(cardAttachments).where(eq(cardAttachments.cardId, cardId));
  const removedIds = [...new Set(form.getAll("removeAttachmentId"))];
  if (removedIds.some((id) => typeof id !== "string" || !existing.some((item) => item.id === id && item.contentType !== GPX_CONTENT_TYPE))) {
    return fail("That attachment no longer exists on this card. Reopen the card and try again.");
  }
  if (existing.filter((item) => item.contentType !== GPX_CONTENT_TYPE).length - removedIds.length + files.length > MAX_ATTACHMENTS) {
    return fail(`A card can have up to ${MAX_ATTACHMENTS} attachments.`);
  }

  const uploads = [];
  for (const file of files) {
    const error = attachmentFileError(file);
    if (error) return fail(error);
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const pdf = /\.pdf$/i.test(file.name);
    const png = /\.png$/i.test(file.name);
    const valid = pdf
      ? new TextDecoder().decode(signature.slice(0, 5)) === "%PDF-"
      : png
        ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => signature[index] === byte)
        : signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    if (!valid) return fail(`“${file.name}” is not a valid ${pdf ? "PDF" : png ? "PNG" : "JPG"} file.`);
    uploads.push({
      file, id: uuidv7(), cardId,
      filename: Array.from(file.name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "")).slice(0, 200).join("") || (pdf ? "attachment.pdf" : png ? "attachment.png" : "attachment.jpg"),
      contentType: pdf ? "application/pdf" : png ? "image/png" : "image/jpeg", size: file.size,
    });
  }

  const gpxFields = form.getAll("gpx").filter((field) => typeof field === "string" ? field !== "" : field.name || field.size);
  const removeGpx = form.get("removeGpx") === "1";
  if ((gpxFields.length || removeGpx) && !options.allowGpx) return fail("GPX files can only be uploaded to hike cards.");
  if (gpxFields.length > 1 || gpxFields.some((field) => typeof field === "string")) return fail("Choose one GPX file.");
  const gpxFile = gpxFields[0] as File | undefined;
  let track: HikeTrack | undefined;
  if (gpxFile) {
    const error = gpxFileError(gpxFile);
    if (error) return fail(error);
    try {
      track = parseGpx(await gpxFile.text());
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Could not read the GPX file.");
    }
    uploads.push({
      file: gpxFile, id: uuidv7(), cardId,
      filename: Array.from(gpxFile.name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "")).slice(0, 200).join("") || "hike.gpx",
      contentType: GPX_CONTENT_TYPE, size: gpxFile.size,
    });
  }
  if (gpxFile || removeGpx) removedIds.push(...existing.filter((item) => item.contentType === GPX_CONTENT_TYPE).map((item) => item.id));

  let coverAttachmentId: string | null = null;
  if (options.allowCover) {
    const coverField = form.get("coverAttachment");
    if (coverField !== null && typeof coverField !== "string") {
      return fail("Choose a valid JPG or PNG cover image.");
    }
    const coverChoice = typeof coverField === "string"
      ? coverField
      : options.currentCoverAttachmentId
        ? `existing:${options.currentCoverAttachmentId}`
        : "";
    if (coverChoice.startsWith("existing:")) {
      const id = coverChoice.slice("existing:".length);
      const attachment = existing.find((item) => item.id === id);
      if (!attachment || !isImageAttachment(attachment.contentType)) {
        return fail("Choose a valid JPG or PNG cover image.");
      }
      if (!removedIds.includes(id)) coverAttachmentId = id;
    } else if (coverChoice.startsWith("upload:")) {
      const index = Number(coverChoice.slice("upload:".length));
      const upload = Number.isInteger(index) ? uploads[index] : undefined;
      if (!upload || !isImageAttachment(upload.contentType)) {
        return fail("Choose a valid JPG or PNG cover image.");
      }
      coverAttachmentId = upload.id;
    } else if (coverChoice) {
      return fail("Choose a valid JPG or PNG cover image.");
    }
  }

  const uploadedKeys: string[] = [];
  try {
    for (const upload of uploads) {
      const key = attachmentKey(cardId, upload.id);
      uploadedKeys.push(key);
      await bucket.put(key, upload.file.stream(), { httpMetadata: { contentType: upload.contentType } });
      if (upload.contentType === GPX_CONTENT_TYPE && track && options.previewReferer) {
        uploadedKeys.push(hikePreviewKey(cardId, upload.id));
        // A temporary tile outage must not prevent saving the hike. A missing
        // preview is retried when a user first views its thumbnail.
        await saveHikePreview(bucket, cardId, upload.id, track, options.previewReferer)
          .catch(() => console.error("Could not generate hike preview; it will be retried on display"));
      }
    }
    // Card edits and attachment metadata commit together. Failed saves clean up
    // new blobs and keep all previously saved attachments intact.
    const mutations = mutation(coverAttachmentId);
    const [firstMutation, ...remainingMutations] = Array.isArray(mutations) ? mutations : [mutations];
    if (!firstMutation) throw new Error("A card save requires at least one database mutation.");
    await db.batch([
      firstMutation,
      ...remainingMutations,
      ...(gpxFile || removeGpx ? [db.update(cards).set({
        hikeDistanceKm: track?.hikeDistanceKm ?? null,
        hikeElevationGainM: track?.hikeElevationGainM ?? null,
      }).where(eq(cards.id, cardId))] : []),
      ...(removedIds.length ? [db.delete(cardAttachments).where(and(
        eq(cardAttachments.cardId, cardId), inArray(cardAttachments.id, removedIds as string[]),
      ))] : []),
      ...uploads.map(({ file, ...metadata }) => db.insert(cardAttachments).values(metadata)),
    ]);
  } catch (error) {
    console.error("Could not save card and attachments", error);
    if (uploadedKeys.length) {
      await bucket.delete(uploadedKeys).catch(() => console.error("Could not clean up failed attachment uploads"));
    }
    return fail("Could not save this card and its attachments. Please try again.", 500);
  }
  if (removedIds.length) {
    // Metadata is already removed, so files are no longer accessible if blob
    // cleanup temporarily fails. Do not report a committed save as a failure.
    await bucket.delete((removedIds as string[]).flatMap((id) => attachmentStorageKeys(cardId, id)))
      .catch(() => console.error("Could not clean up removed attachments"));
  }
  return { ok: true as const, error: null };
}
