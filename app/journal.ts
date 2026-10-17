export const MAX_JOURNAL_IMAGES = 5;
export const MAX_JOURNAL_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_JOURNAL_BODY = 10_000;
export const JOURNAL_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function journalImageError(file: Pick<File, "name" | "size" | "type">) {
  if (!JOURNAL_IMAGE_TYPES.includes(file.type)) return `“${file.name}”: choose a JPG, PNG, WebP or GIF image.`;
  if (!file.size || file.size > MAX_JOURNAL_IMAGE_BYTES) return `“${file.name}”: images must be between 1 byte and 10 MB.`;
  return null;
}

export function journalImageSignature(type: string, bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes);
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (type === "image/webp") return text.startsWith("RIFF") && text.slice(8, 12) === "WEBP";
  if (type === "image/gif") return text.startsWith("GIF87a") || text.startsWith("GIF89a");
  return false;
}

export const journalImageKey = (tripId: string, entryId: string, imageId: string) => `trips/${tripId}/journal/${entryId}/${imageId}`;
export const journalImageUrl = (tripId: string, entryId: string, imageId: string) => `/trips/${encodeURIComponent(tripId)}/live/journal/${encodeURIComponent(entryId)}/images/${encodeURIComponent(imageId)}`;
