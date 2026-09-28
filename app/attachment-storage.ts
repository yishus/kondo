export const attachmentKey = (cardId: string, id: string) => `cards/${cardId}/${id}`;
export const hikePreviewKey = (cardId: string, id: string) => `${attachmentKey(cardId, id)}/preview-v1.svg`;
export const attachmentStorageKeys = (cardId: string, id: string) => [attachmentKey(cardId, id), hikePreviewKey(cardId, id)];

// Attachment IDs are immutable. Keep private files in the browser for a day;
// cookies partition cached responses when the signed-in session changes.
export const PRIVATE_ATTACHMENT_CACHE = "private, max-age=86400, immutable";
