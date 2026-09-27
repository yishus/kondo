import type { TripColumn } from "./card-order";
import { isImageAttachment } from "./attachments";
import { getPlacePhoto, type PlacePhotoResponse } from "./place-photo.server";

// Stream photos from already-authorized cards: no per-card D1 reads. Duplicate
// places share a lookup, and at most four Google requests run concurrently.
export function streamTripPhotos(columns: TripColumn[], apiKey: string | undefined, requestSignal: AbortSignal): TripColumn[] {
  if (!apiKey?.trim()) return columns;
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(8000)]);
  const photos = new Map<string, Promise<PlacePhotoResponse["photo"]>>();
  const queue: (() => Promise<void>)[] = [];
  const result = columns.map((column) => ({
    ...column,
    cards: column.cards.map((card) => {
      const uploadedCover = card.attachments.some((attachment) =>
        attachment.id === card.coverAttachmentId && isImageAttachment(attachment.contentType));
      if (card.type !== "location" || !card.googlePlaceId || uploadedCover) return card;
      const placeId = card.googlePlaceId;
      let googlePhoto = photos.get(placeId);
      if (!googlePhoto) {
        googlePhoto = new Promise((resolve) => {
          queue.push(async () => {
            if (signal.aborted) { resolve(null); return; }
            const result = await getPlacePhoto(placeId, apiKey, signal);
            resolve(result.body.photo);
          });
        });
        photos.set(placeId, googlePhoto);
      }
      return { ...card, googlePhoto };
    }),
  }));
  async function work() {
    let next;
    while ((next = queue.shift())) await next();
  }
  for (let i = 0; i < 4; i++) void work();
  return result;
}
