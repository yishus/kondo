export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const MAX_TRIP_FILES_PER_UPLOAD = 5;

export function isImageAttachment(contentType: string): boolean {
  return contentType === "image/jpeg" || contentType === "image/png";
}

export function attachmentFileError(file: File): string | null {
  if (!/\.(jpe?g|png|pdf)$/i.test(file.name)) return "Choose JPG, PNG or PDF files only.";
  if (!file.size) return "Empty files cannot be attached.";
  if (file.size > MAX_ATTACHMENT_SIZE) return "Each attachment must be 10 MB or smaller.";
  return null;
}

export function attachmentUrl(tripId: string, cardId: string, attachmentId: string) {
  return `/trips/${encodeURIComponent(tripId)}/cards/${encodeURIComponent(cardId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function tripAttachmentUrl(tripId: string, attachmentId: string) {
  return `/trips/${encodeURIComponent(tripId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
