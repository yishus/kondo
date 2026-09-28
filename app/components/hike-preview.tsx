import { useState } from "react";
import { attachmentUrl } from "../attachments";

export function HikePreview({ tripId, cardId, attachmentId, title, onOpen }: {
  tripId: string; cardId: string; attachmentId: string; title: string; onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return <div className="relative overflow-hidden rounded-lg border border-border">
    <button type="button" className="block aspect-video w-full cursor-pointer bg-muted" onClick={onOpen} aria-label={`Open route map for ${title}`}>
      {failed ? <span className="p-4 text-xs text-muted-foreground">Open card to view route</span>
        : <img src={`${attachmentUrl(tripId, cardId, attachmentId)}/preview-v1.svg`} alt={`${title} route map`} loading="lazy" decoding="async"
          width="640" height="360" className="h-full w-full object-contain" onError={() => setFailed(true)} />}
    </button>
    {!failed && <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
      className="absolute right-0 bottom-0 bg-white/90 px-1 text-[10px] text-gray-800">© OpenStreetMap contributors</a>}
  </div>;
}
