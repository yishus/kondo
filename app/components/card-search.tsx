import { useEffect, useId, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import type { loader } from "../routes/card-search";
import { cardTypes } from "../card-types";
import { MAX_CARD_SEARCH_LENGTH } from "../card-search";
import type { TripCard, TripColumn } from "../card-order";

export function CardSearch({ tripId, columns, onOpenCard }: {
  tripId: string; columns: TripColumn[]; onOpenCard: (card: TripCard) => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const query = text.trim();
  const fetcher = useFetcher<typeof loader>();
  const { load } = fetcher;
  const cards = useMemo(() => new Map(columns.flatMap((column) => column.cards.map((card) => [card.id, { card, day: column.date ?? "Unscheduled" }] as const))), [columns]);
  useEffect(() => {
    if (!query) return;
    const timeout = setTimeout(() => { void load(`/trips/${encodeURIComponent(tripId)}/card-search?${new URLSearchParams({ q: query })}`); }, 250);
    return () => clearTimeout(timeout);
  }, [load, tripId, query]);
  const response = fetcher.data?.query === query ? fetcher.data : undefined;
  const busy = Boolean(query) && (!response || fetcher.state !== "idle");
  const results = response?.results.flatMap((result) => {
    const saved = cards.get(result.id);
    return saved ? [{ ...result, ...saved }] : [];
  }) ?? [];

  return <section aria-label="Card search" className="mb-4">
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">Search cards</label>
      <input id={id} type="search" className="ui-input w-full sm:max-w-md" value={text} maxLength={MAX_CARD_SEARCH_LENGTH}
        placeholder="Search cards in this trip…" aria-describedby={`${id}-hint`} aria-controls={`${id}-results`}
        onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setText(""); }} />
      {text && <button type="button" className="ui-button" onClick={() => { setText(""); document.getElementById(id)?.focus(); }}>Clear search</button>}
    </div>
    <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">Search titles, descriptions, places, and transport endpoints across all days.</p>
    <div id={`${id}-results`} aria-busy={busy}>
      {query && <div className="mt-3 rounded-lg border border-border bg-surface p-3">
        <p role="status" className="text-xs text-muted-foreground">
          {busy ? "Searching cards…" : response?.error ? response.error : !results.length ? "No matching cards." : `${results.length}${response?.hasMore ? "+" : ""} matching ${results.length === 1 ? "card" : "cards"}${response?.hasMore ? ". Refine your search to see more." : "."}`}
        </p>
        {!busy && !response?.error && <ul aria-label="Matching cards" className="mt-2 grid max-h-80 gap-1 overflow-y-auto">
          {results.map(({ id, card, day, excerpt }) => <li key={id}>
            <button type="button" className="ui-button block w-full text-left" aria-haspopup="dialog" onClick={() => onOpenCard(card)}>
              <span className="block break-words font-medium">{card.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{day} · {cardTypes[card.type]}</span>
              {excerpt && excerpt !== card.title && <span className="mt-1 line-clamp-2 block break-words text-xs font-normal text-muted-foreground">{excerpt}</span>}
            </button>
          </li>)}
        </ul>}
        {!busy && response?.error && <button type="button" className="ui-button mt-2" onClick={() => void load(`/trips/${encodeURIComponent(tripId)}/card-search?${new URLSearchParams({ q: query })}`)}>Retry search</button>}
      </div>}
    </div>
  </section>;
}
