import { and, eq } from "drizzle-orm";
import { data } from "react-router";
import { v7 as uuidv7 } from "uuid";
import { attachmentFileError, MAX_TRIP_FILES_PER_UPLOAD } from "./attachments";
import { tripAttachmentKey } from "./attachment-storage";
import type { Database } from "./db.server";
import { tripAttachments } from "./db/schema";

const fail = (error: string, status = 400) => data({ ok: false as const, error }, { status });

export async function uploadTripAttachments(db: Database, bucket: R2Bucket, tripId: string, form: FormData) {
  const fields = form.getAll("attachments");
  if (fields.some((field) => typeof field === "string" && field !== "")) return fail("Choose JPG, PNG or PDF files only.");
  const files = fields.filter((field): field is File => typeof field !== "string").filter((file) => file.name || file.size);
  if (!files.length) return fail("Choose at least one file to upload.");
  if (files.length > MAX_TRIP_FILES_PER_UPLOAD) return fail(`Upload up to ${MAX_TRIP_FILES_PER_UPLOAD} files at a time.`);

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
      file, id: uuidv7(), tripId,
      filename: Array.from(file.name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "")).slice(0, 200).join("") || (pdf ? "attachment.pdf" : png ? "attachment.png" : "attachment.jpg"),
      contentType: pdf ? "application/pdf" : png ? "image/png" : "image/jpeg", size: file.size,
    });
  }

  const uploadedKeys: string[] = [];
  try {
    for (const upload of uploads) {
      const key = tripAttachmentKey(tripId, upload.id);
      uploadedKeys.push(key);
      await bucket.put(key, upload.file.stream(), { httpMetadata: { contentType: upload.contentType } });
    }
    const [first, ...rest] = uploads.map(({ file, ...metadata }) => db.insert(tripAttachments).values(metadata));
    await db.batch([first!, ...rest]);
  } catch {
    if (uploadedKeys.length) await bucket.delete(uploadedKeys).catch(() => console.error("Could not clean up failed trip file uploads"));
    return fail("Could not upload your files. Please try again.", 500);
  }
  return { ok: true as const, error: null };
}

export async function removeTripAttachment(db: Database, bucket: R2Bucket, tripId: string, attachmentId: string) {
  const removed = await db.delete(tripAttachments)
    .where(and(eq(tripAttachments.tripId, tripId), eq(tripAttachments.id, attachmentId)))
    .returning({ id: tripAttachments.id });
  if (!removed.length) return fail("That file no longer exists.", 404);
  // Once metadata is removed, the file is inaccessible even if blob cleanup fails.
  await bucket.delete(tripAttachmentKey(tripId, attachmentId))
    .catch(() => console.error("Could not clean up removed trip file"));
  return { ok: true as const, error: null };
}
