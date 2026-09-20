import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { data } from "react-router";
import { v7 as uuidv7 } from "uuid";

import { attachmentFileError, MAX_ATTACHMENTS } from "./attachments";
import type { Database } from "./db.server";
import { cardAttachments } from "./db/schema";

export const attachmentKey = (cardId: string, id: string) => `cards/${cardId}/${id}`;

export async function saveCardWithAttachments(
  db: Database,
  bucket: R2Bucket,
  cardId: string,
  form: FormData,
  mutation: (coverAttachmentId: string | null) => BatchItem<"sqlite"> | BatchItem<"sqlite">[],
  options: { allowCover: boolean; currentCoverAttachmentId?: string | null },
) {
  const fail = (error: string, status = 400) => data({ ok: false as const, error }, { status });
  const fields = form.getAll("attachments");
  if (fields.some((field) => typeof field === "string" && field !== "")) return fail("Choose JPG or PDF files only.");
  // An unselected input is an unnamed File or an empty string, depending on
  // the runtime's multipart parser. Neither represents an upload.
  const files = fields.filter((field): field is File => typeof field !== "string")
    .filter((file) => file.name || file.size);
  const existing = await db.select().from(cardAttachments).where(eq(cardAttachments.cardId, cardId));
  const removedIds = [...new Set(form.getAll("removeAttachmentId"))];
  if (removedIds.some((id) => typeof id !== "string" || !existing.some((item) => item.id === id))) {
    return fail("That attachment no longer exists on this card. Reopen the card and try again.");
  }
  if (existing.length - removedIds.length + files.length > MAX_ATTACHMENTS) {
    return fail(`A card can have up to ${MAX_ATTACHMENTS} attachments.`);
  }
  const uploads = [];
  for (const file of files) {
    const error = attachmentFileError(file);
    if (error) return fail(error);
    const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const pdf = /\.pdf$/i.test(file.name);
    const valid = pdf
      ? new TextDecoder().decode(signature) === "%PDF-"
      : signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    if (!valid) return fail(`“${file.name}” is not a valid ${pdf ? "PDF" : "JPG"} file.`);
    uploads.push({
      file, id: uuidv7(), cardId,
      filename: Array.from(file.name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "")).slice(0, 200).join("") || (pdf ? "attachment.pdf" : "attachment.jpg"),
      contentType: pdf ? "application/pdf" : "image/jpeg", size: file.size,
    });
  }

  let coverAttachmentId: string | null = null;
  if (options.allowCover) {
    const coverField = form.get("coverAttachment");
    if (coverField !== null && typeof coverField !== "string") {
      return fail("Choose a valid JPG cover image.");
    }
    const coverChoice = typeof coverField === "string"
      ? coverField
      : options.currentCoverAttachmentId
        ? `existing:${options.currentCoverAttachmentId}`
        : "";
    if (coverChoice.startsWith("existing:")) {
      const id = coverChoice.slice("existing:".length);
      const attachment = existing.find((item) => item.id === id);
      if (!attachment || attachment.contentType !== "image/jpeg") {
        return fail("Choose a valid JPG cover image.");
      }
      if (!removedIds.includes(id)) coverAttachmentId = id;
    } else if (coverChoice.startsWith("upload:")) {
      const index = Number(coverChoice.slice("upload:".length));
      const upload = Number.isInteger(index) ? uploads[index] : undefined;
      if (!upload || upload.contentType !== "image/jpeg") {
        return fail("Choose a valid JPG cover image.");
      }
      coverAttachmentId = upload.id;
    } else if (coverChoice) {
      return fail("Choose a valid JPG cover image.");
    }
  }

  const uploadedKeys: string[] = [];
  try {
    for (const upload of uploads) {
      const key = attachmentKey(cardId, upload.id);
      uploadedKeys.push(key);
      await bucket.put(key, upload.file.stream(), { httpMetadata: { contentType: upload.contentType } });
    }
    // Card edits and attachment metadata commit together. Failed saves clean up
    // new blobs and keep all previously saved attachments intact.
    const mutations = mutation(coverAttachmentId);
    const [firstMutation, ...remainingMutations] = Array.isArray(mutations) ? mutations : [mutations];
    if (!firstMutation) throw new Error("A card save requires at least one database mutation.");
    await db.batch([
      firstMutation,
      ...remainingMutations,
      ...uploads.map(({ file, ...metadata }) => db.insert(cardAttachments).values(metadata)),
      ...(removedIds.length ? [db.delete(cardAttachments).where(and(
        eq(cardAttachments.cardId, cardId), inArray(cardAttachments.id, removedIds as string[]),
      ))] : []),
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
    await bucket.delete((removedIds as string[]).map((id) => attachmentKey(cardId, id)))
      .catch(() => console.error("Could not clean up removed attachments"));
  }
  return { ok: true as const, error: null };
}
