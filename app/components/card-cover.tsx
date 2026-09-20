import { useEffect, useRef, useState } from "react";

import { attachmentUrl } from "../attachments";
import type { TripCard } from "../card-order";
import type { PlacePhotoResponse } from "../place-photo.server";

function coverClassName() {
  return "block h-28 w-full object-cover";
}

function GooglePlaceCover({ card }: { card: TripCard }) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [photo, setPhoto] = useState<PlacePhotoResponse["photo"]>(null);

  useEffect(() => {
    const element = triggerRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    const controller = new AbortController();
    setPhoto(null);
    void fetch(`/trips/${encodeURIComponent(card.tripId)}/cards/${encodeURIComponent(card.id)}/place-photo`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as PlacePhotoResponse;
      if (!controller.signal.aborted) setPhoto(result.photo);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [card.googlePlaceId, card.id, card.tripId, shouldLoad]);

  return (
    <div ref={triggerRef} className={photo ? "" : "h-px w-full"}>
      {photo && (
        <a
          href={photo.googleMapsUri}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-tr-[9px] bg-[#ebecf0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4]"
          aria-label={`Open the source photo for ${card.title} on Google Maps`}
        >
          <img src={photo.imageUrl} alt={`${card.title} from Google Maps`} className={coverClassName()} loading="lazy" onError={() => setPhoto(null)} />
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:underline" translate="no">Google Maps ↗</span>
        </a>
      )}
    </div>
  );
}

export function CardCover({ card }: { card: TripCard }) {
  if (card.type !== "location") return null;
  const uploadedCover = card.attachments.find((attachment) =>
    attachment.id === card.coverAttachmentId && attachment.contentType === "image/jpeg",
  );
  if (uploadedCover) {
    const url = attachmentUrl(card.tripId, card.id, uploadedCover.id);
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-tr-[9px] bg-[#ebecf0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4]" aria-label={`Open cover image for ${card.title}`}>
        <img src={url} alt={`${card.title} cover`} className={coverClassName()} loading="lazy" />
      </a>
    );
  }
  return card.googlePlaceId ? <GooglePlaceCover card={card} /> : null;
}
