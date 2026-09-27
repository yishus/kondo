import { Suspense, useState } from "react";
import { Await } from "react-router";

import { attachmentUrl, isImageAttachment } from "../attachments";
import type { TripCard } from "../card-order";
import type { PlacePhotoResponse } from "../place-photo.server";

function coverClassName() {
  return "block h-28 w-full object-cover";
}

function GooglePlaceCover({ card, photo }: { card: TripCard; photo: PlacePhotoResponse["photo"] }) {
  const [failed, setFailed] = useState(false);
  if (!photo || failed) return null;
  return (
    <a
      href={photo.googleMapsUri}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-tr-[9px] bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={`Open the source photo for ${card.title} on Google Maps`}
    >
      <img src={photo.imageUrl} alt={`${card.title} from Google Maps`} className={coverClassName()} loading="lazy" onError={() => setFailed(true)} />
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
  return card.googlePhoto ? (
    <Suspense fallback={<div className="h-px w-full" />}>
      <Await resolve={card.googlePhoto} errorElement={null}>
        {(photo: PlacePhotoResponse["photo"]) => <GooglePlaceCover key={photo?.imageUrl} card={card} photo={photo} />}
      </Await>
    </Suspense>
  ) : null;
}
