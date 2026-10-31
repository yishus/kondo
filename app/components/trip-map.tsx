import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { TripColumn, TripCard } from "../card-order";
import { locationCategories } from "../card-types";
import { loadGoogleMaps } from "../google-maps";
import { resolveTripMap, tripMapColorGroups, tripMapColorKey, tripMapEntries, validMapPoint, wrapMapEntries, type MapColorBy, type MapPoint, type ResolvedMapEntry } from "../trip-map";
import { Icon } from "./icon";

type Place = {
  location?: { lat(): number; lng(): number };
  fetchFields(options: { fields: string[] }): Promise<unknown>;
};
type PlaceConstructor = {
  new (options: { id: string }): Place;
};

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Map lookup timed out")), 12_000);
    promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

export function TripMap({ columns, apiKey, onOpenCard }: {
  columns: TripColumn[];
  apiKey: string;
  onOpenCard: (card: TripCard) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => {});
  const openRef = useRef(onOpenCard);
  const columnsRef = useRef(columns);
  openRef.current = onOpenCard;
  columnsRef.current = columns;
  const cache = useRef(new Map<string, MapPoint>());
  const pinsRef = useRef(new Map<string, HTMLSpanElement>());
  const entries = useMemo(() => tripMapEntries(columns), [columns]);
  const [colorBy, setColorBy] = useState<MapColorBy>("type");
  const colorGroups = useMemo(() => tripMapColorGroups(entries, colorBy), [entries, colorBy]);
  const colors = useMemo(() => new Map(entries.map((entry) => [entry.cardId,
    colorGroups.find((group) => group.key === tripMapColorKey(entry, colorBy))!.color,
  ])), [entries, colorGroups, colorBy]);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const [resolved, setResolved] = useState<ResolvedMapEntry[]>([]);
  const [status, setStatus] = useState("Loading trip map…");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    for (const [cardId, pin] of pinsRef.current) {
      pin.style.backgroundColor = colors.get(cardId) ?? "";
    }
  }, [colors]);

  function open(cardId: string) {
    const card = columnsRef.current.flatMap((column) => column.cards).find((card) => card.id === cardId);
    if (card) openRef.current(card);
  }

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const controller = new AbortController();
    let map: LeafletMap | undefined;
    let resize: ResizeObserver | undefined;
    setReady(false);
    setResolved([]);
    setStatus("Loading trip map…");
    void (async () => {
      try {
        const L = await import("leaflet");
        if (controller.signal.aborted) return;
        map = L.map(element, { scrollWheelZoom: false }).setView([20, 0], 2);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        resize = new ResizeObserver(() => map?.invalidateSize());
        resize.observe(element);
        let Place: PlaceConstructor | undefined;
        if (apiKey && entries.some((entry) => entry.placeId)) {
          const library = await withTimeout(loadGoogleMaps(apiKey).then((maps) => maps.importLibrary("places")));
          Place = library.Place as PlaceConstructor;
        }
        const result = wrapMapEntries(await resolveTripMap(entries, async (placeId) => {
          const cached = cache.current.get(placeId);
          if (cached) return cached;
          if (!Place) return null;
          const place = new Place({ id: placeId });
          await withTimeout(place.fetchFields({ fields: ["location"] }));
          if (!place?.location) return null;
          const point: MapPoint = [place.location.lat(), place.location.lng()];
          if (validMapPoint(point)) cache.current.set(placeId, point);
          return point;
        }, controller.signal));
        if (controller.signal.aborted) return;
        const allPoints = result.flatMap((entry) => entry.point ? [entry.point] : []);
        for (const entry of result) {
          if (!entry.point) continue;
          const title = `${entry.title} · ${entry.day}`;
          const tooltip = document.createElement("span");
          tooltip.textContent = title;
          const pin = document.createElement("span");
          pin.className = "grid w-7 h-8 place-items-center border-2 border-white rounded-[50%_50%_50%_0] text-white shadow-[0_2px_6px_rgb(0_0_0/30%)]";
          pin.style.backgroundColor = colorsRef.current.get(entry.cardId) ?? "";
          pin.textContent = "●";
          pinsRef.current.set(entry.cardId, pin);
          const marker = L.marker(entry.point, { title, alt: `Open ${title}`, keyboard: true,
            icon: L.divIcon({ className: "focus-visible:[outline:3px_solid_#2563eb] focus-visible:outline-offset-4", html: pin, iconSize: [28, 36], iconAnchor: [14, 36] }),
          }).bindTooltip(tooltip).on("click", () => open(entry.cardId)).addTo(map);
          marker.getElement()?.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault(); event.stopPropagation(); open(entry.cardId);
            }
          });
        }

        fitRef.current = () => {
          if (allPoints.length) map?.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40], maxZoom: 14 });
        };
        fitRef.current();
        setResolved(result);
        setReady(true);
        const pins = result.filter((entry) => entry.point).length;
        const missing = result.filter((entry) => entry.error).length;
        setStatus(!apiKey && entries.length ? "Map locations are unavailable right now. You can still open and edit every card below."
          : `${pins} location ${pins === 1 ? "pin" : "pins"}${missing ? ` · ${missing} cards could not be mapped` : ""}`);

      } catch {
        if (!controller.signal.aborted) setStatus("The map could not be fully loaded. Retry, or open a card from the list below.");
      }
    })();
    return () => {
      controller.abort(); resize?.disconnect(); map?.remove(); pinsRef.current.clear(); fitRef.current = () => {};
    };
  }, [entries, apiKey, attempt]);

  return <section aria-label="Trip map" className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium" role="status">{status}</p>
        <p className="mt-1 text-xs text-muted-foreground">Click a pin to edit its card. All trip days and Unscheduled are included.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Color map pins by</legend>
          <span className="text-xs text-muted-foreground" aria-hidden="true">Color by</span>
          <div className="flex overflow-hidden rounded-md border border-border">
            {([ ["day", "Day"], ["type", "Card type"] ] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={colorBy === value} onClick={() => setColorBy(value)}
                className={`min-h-8.5 px-2.5 py-1.75 text-xs font-medium transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${colorBy === value ? "bg-muted text-foreground" : "bg-surface text-secondary-foreground hover:bg-muted"}`}>
                {label}
              </button>,
            )}
          </div>
        </fieldset>
        <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface" onClick={() => fitRef.current()} disabled={!ready || !resolved.some((entry) => entry.point)}>Fit all</button>
        <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface" onClick={() => setAttempt((value) => value + 1)}>Retry map</button>
      </div>
    </div>
    {colorGroups.length > 0 && <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-secondary-foreground" aria-label="Map color legend">
      {colorGroups.map((group) => <li key={group.key} className="inline-flex items-center gap-1.5">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} aria-hidden="true" />
        {group.label}
      </li>)}
    </ul>}
    <div className="relative isolate overflow-hidden rounded-xl border border-border bg-muted">
      <div ref={container} className="h-[60vh] min-h-80 w-full" aria-label="Location pins" />
    </div>
    {entries.length === 0 ? <p className="text-sm text-muted-foreground">Add location or hike cards in the Itinerary tab to see them here.</p> :
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Map cards">
        {entries.map((entry) => {
          const result = resolved.find((item) => item.cardId === entry.cardId);
          return <button key={entry.cardId} type="button" className="min-h-8.5 shrink-0 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface flex w-full min-w-0 items-start justify-start gap-3 text-left" onClick={() => open(entry.cardId)}>
            <Icon name="pin" className="shrink-0" style={{ color: colors.get(entry.cardId) }} />
            <span className="min-w-0 flex-1"><span className="block wrap-anywhere">{entry.title}</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{entry.day} · {entry.type === "hike" ? "Hike" : entry.locationCategory ? `Location · ${locationCategories[entry.locationCategory]}` : "Location · Uncategorized"}</span>
              {result?.error && <span className="mt-1 block text-xs font-normal text-muted-foreground">{result.error}</span>}
            </span>
          </button>;
        })}
      </div>}
  </section>;
}
