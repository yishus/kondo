import { useEffect, useRef, useState } from "react";

import { attachmentUrl, isImageAttachment } from "../attachments";
import type { TripCard } from "../card-order";
import type { PlacePhotoResponse } from "../place-photo.server";

function coverClassName() {
  return "block h-28 w-full object-cover";
}

function GooglePlaceCover({ card }: { card: TripCard }) {
  const [photo, setPhoto] = useState(card.googlePhoto ?? null);
  const [failed, setFailed] = useState(false);
  const attempted = useRef(false);
  const placeholder = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);

  async function refresh() {
    if (attempted.current) return;
    attempted.current = true;
    const request = new AbortController();
    controller.current = request;
    try {
      // A direct resource POST keeps this recovery local to the cover, avoiding
      // a full board revalidation for each expired image.
      const response = await fetch(`/trips/${encodeURIComponent(card.tripId)}/cards/${encodeURIComponent(card.id)}/place-photo`, {
        method: "POST",
        body: new URLSearchParams({ placeId: card.googlePlaceId!, failedImageUrl: photo?.imageUrl ?? "" }),
        signal: request.signal,
      });
      const result = await response.json() as PlacePhotoResponse;
      if (!request.signal.aborted && response.ok && result.photo) {
        setPhoto(result.photo);
        setFailed(false);
      }
    } catch {
      // Leave the cover empty; retry at most once per mounted cover.
    }
  }

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    // Older cards have no saved URL. Populate it once when the cover is near
    // the viewport; subsequent page loads use the database value.
    const element = placeholder.current;
    if (card.googlePhoto || !element) return;
    if (typeof IntersectionObserver === "undefined") { void refresh(); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { observer.disconnect(); void refresh(); }
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!photo || failed) return <div ref={placeholder} className="h-px w-full" />;
  return (
    <a
      href={photo.googleMapsUri}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-tr-[9px] bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={`Open the source photo for ${card.title} on Google Maps`}
    >
      <img key={photo.imageUrl} src={photo.imageUrl} alt={`${card.title} from Google Maps`} className={coverClassName()} loading="lazy" onError={() => { setFailed(true); void refresh(); }} />
      <span className="absolute right-1.5 bottom-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:underline" translate="no">Google Maps ↗</span>
    </a>
  );
}

export function CardCover({ card }: { card: TripCard }) {
  if (card.type !== "location") return null;
  const uploadedCover = card.attachments.find((attachment) =>
    attachment.id === card.coverAttachmentId && isImageAttachment(attachment.contentType),
  );
  if (uploadedCover) {
    const url = attachmentUrl(card.tripId, card.id, uploadedCover.id);
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-tr-[9px] bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={`Open cover image for ${card.title}`}>
        <img src={url} alt={`${card.title} cover`} className={coverClassName()} loading="lazy" />
      </a>
    );
  }
  return card.googlePlaceId
    ? <GooglePlaceCover key={`${card.id}:${card.googlePlaceId}:${card.googlePhoto?.imageUrl ?? ""}`} card={card} />
    : null;
}
