import { useEffect, useId, useRef, useState } from "react";
import type { CardMove, TripCard, TripColumn } from "../card-order";

const dateFormatter = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" });

export function CardMoveDialog({ card, columns, onMove, onClose }: {
  card: TripCard;
  columns: TripColumn[];
  onMove: (move: CardMove) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const destinationId = useId();
  const [destination, setDestination] = useState(card.tripDayId);
  const source = columns.find((column) => column.id === card.tripDayId);
  const index = source?.cards.findIndex((item) => item.id === card.id) ?? -1;
  const previous = source?.cards[index - 1];
  const next = source?.cards[index + 1];
  const buttonClass = "min-h-11 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-40";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    const element = dialog.current;
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  function move(tripDayId: string, beforeCardId: string | null) {
    onMove({ cardId: card.id, fromDayId: card.tripDayId, tripDayId, beforeCardId });
    onClose();
  }

  return <dialog ref={dialog} aria-label="Move card"
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface p-4 text-foreground shadow-xl backdrop:bg-black/30"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-sm font-semibold">Move card</h2><p className="mt-1 wrap-anywhere text-xs text-muted-foreground">{card.title}</p></div>
      <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-xl hover:bg-muted" aria-label="Close move card" onClick={onClose}>×</button>
    </div>
    <div className="mb-5 grid grid-cols-2 gap-2">
      <button type="button" className={buttonClass} disabled={!previous} onClick={() => { if (previous) move(card.tripDayId, previous.id); }}>Move up</button>
      <button type="button" className={buttonClass} disabled={!next} onClick={() => move(card.tripDayId, source?.cards[index + 2]?.id ?? null)}>Move down</button>
    </div>
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (destination !== card.tripDayId) move(destination, null); }}>
      <label htmlFor={destinationId} className="text-xs font-medium">Move to day</label>
        <select id={destinationId} className="min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-base" value={destination} onChange={(event) => setDestination(event.target.value)}>
          {columns.map((column) => <option key={column.id} value={column.id}>{column.date ? dateFormatter.format(new Date(`${column.date}T00:00:00`)) : "Unscheduled"}</option>)}
        </select>
      <p className="text-xs text-muted-foreground">The card will be added at the end of the selected day.</p>
      <button className="min-h-11 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40" disabled={destination === card.tripDayId}>Move to day</button>
    </form>
  </dialog>;
}
