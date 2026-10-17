import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TripCard } from "../card-order";
import { attachmentUrl } from "../attachments";
import { safeChatUrl } from "../card-chat";
import { googleMapsUrl } from "../card-location";
import { GPX_CONTENT_TYPE, hikeSummary } from "../hike-gpx";
import { HikeMap } from "./hike-map";
import { Icon } from "./icon";
import { MarkdownContent } from "./markdown-content";

export function HikeCardDetail({ card, tripId, onClose }: { card: TripCard; tripId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const gpx = card.attachments.find((file) => file.contentType === GPX_CONTENT_TYPE);
  const summary = hikeSummary(card.hikeDistanceKm, card.hikeElevationGainM);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialog} aria-labelledby={headingId}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface p-4 text-[13px] text-foreground shadow-xl backdrop:bg-black/30 sm:p-5"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    } }}>
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">Hike · View only</p><h2 id={headingId} className="text-lg font-semibold wrap-anywhere">{card.title}</h2>{summary && <p className="mt-2 text-muted-foreground">{summary}</p>}</div>
      <button type="button" aria-label="Close hike details" onClick={onClose} className="grid h-8.5 w-8.5 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-muted"><Icon name="close" /></button>
    </header>
    {gpx && <HikeMap url={attachmentUrl(tripId, card.id, gpx.id)} title={card.title} />}
    {card.description && <div className="mt-4 wrap-anywhere"><MarkdownContent><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeChatUrl(url) ?? ""} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />, img: () => null }}>{card.description}</Markdown></MarkdownContent></div>}
    {card.googleMapsQuery && <a href={googleMapsUrl(card.googlePlaceId || "", card.googleMapsQuery)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center underline">Open in Google Maps ↗</a>}
    {card.attachments.length > 0 && <section className="mt-4"><h3 className="font-medium">Files</h3><ul className="mt-1 grid gap-1">{card.attachments.map((file) => <li key={file.id}><a href={attachmentUrl(tripId, card.id, file.id)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline wrap-anywhere">{file.filename} ↗</a></li>)}</ul></section>}
  </dialog>, document.body);
}
