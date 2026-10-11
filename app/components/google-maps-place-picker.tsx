import { useEffect, useId, useRef, useState } from "react";

import { googleMapsUrl, type PlaceSearchResponse, type PlaceSearchResult } from "../card-location";

function GoogleMapsAttribution() {
  return <p className="mt-2 text-xs font-normal whitespace-nowrap text-muted-foreground" translate="no">Google Maps</p>;
}

function PlaceAttributions({ place }: { place: PlaceSearchResult }) {
  return place.attributions.map((attribution, index) => (
    <p key={index} className="px-3 pb-2 text-xs text-muted-foreground">
      {attribution.uri ? <a href={attribution.uri} target="_blank" rel="noopener noreferrer" className="underline">{attribution.provider}</a> : attribution.provider}
    </p>
  ));
}

export function GoogleMapsPlacePicker({ tripId, label, value, onChange, disabled, optional = false, initialQuery = "" }: {
  tripId: string;
  label: string;
  value: { name: string; query: string; placeId?: string | null } | null;
  onChange: (place: PlaceSearchResult | null, query: string) => void;
  disabled: boolean;
  optional?: boolean;
  initialQuery?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [selected, setSelected] = useState<PlaceSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  function clearSearch() {
    controllerRef.current?.abort();
    setSearching(false);
    setResults(null);
    setError(null);
  }

  function choose(place: PlaceSearchResult) {
    // Store a readable query, never the pasted URL (which can be very long).
    onChange(place, `${place.name} ${place.address}`.trim().slice(0, 200));
    setSelected(place);
    clearSearch();
    setQuery("");
  }

  async function search(input = query) {
    const text = input.trim();
    if (text.length < 2 || disabled) return;
    clearSearch();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSearching(true);
    try {
      // Read this JSON resource directly so searching never submits the card form.
      const response = await fetch(`/trips/${encodeURIComponent(tripId)}/places?${new URLSearchParams({ q: text })}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const result = await response.json() as PlaceSearchResponse;
      if (controller.signal.aborted) return;
      if (!response.ok || result.error) {
        setError(result.error || "Could not search Google Maps. Please try again.");
      } else if (result.resolved && result.places.length === 1) {
        choose(result.places[0]);
      } else {
        setResults(result.places);
      }
    } catch {
      if (!controller.signal.aborted) setError("Could not search Google Maps. Please try again.");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  return (
    <fieldset className="grid min-w-0 gap-3 pt-4.5 border-t border-t-border [&_>_legend]:float-left [&_>_legend]:w-full [&_>_legend]:mb-0 [&_>_legend_+_*]:clear-both" disabled={disabled}>
      <legend className="text-secondary-foreground text-[12px] font-medium">{label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}</legend>
      {value && (
        <div className="p-[12px_0] border-b border-b-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-xs">
              <p className="font-medium wrap-break-word">{selected?.name ?? value.name}</p>
              {selected?.address && <p className="mt-1 text-xs wrap-break-word text-muted-foreground">{selected.address}</p>}
              <a className="mt-1 inline-block text-secondary-foreground hover:underline" href={googleMapsUrl(selected?.id ?? value.placeId ?? "", value.query)} target="_blank" rel="noopener noreferrer">
                View on Google Maps <span aria-hidden="true">↗</span>
              </a>
            </div>
            <button type="button" className="inline-flex min-h-8.5 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed shrink-0" onClick={() => {
              onChange(null, "");
              setSelected(null);
              clearSearch();
            }}>Remove location</button>
          </div>
          {selected && <><PlaceAttributions place={selected} /><GoogleMapsAttribution /></>}
        </div>
      )}
      <label className="text-secondary-foreground text-[12px] font-medium" htmlFor={id}>
        {value ? "Search or paste a different Maps link" : "Search or paste a Google Maps link"}
      </label>
      <div className="flex gap-2">
        <input id={id} type="search" value={query} maxLength={8192} autoComplete="off"
          className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer flex-1"
          placeholder="Place name or Google Maps URL" aria-describedby={`${id}-hint`}
          onChange={(event) => { clearSearch(); setQuery(event.target.value); }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text").trim();
            if (!/^https?:\/\//i.test(text)) return;
            event.preventDefault();
            setQuery(text);
            void search(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface" disabled={searching || query.trim().length < 2} onClick={() => void search()}>
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">Paste a place’s Share link to attach it, or search by name and choose a result.</p>
      <div role="status" className="text-xs text-muted-foreground">
        {searching ? "Searching Google Maps…" : results ? results.length ? `${results.length} places found.` : "No places found. Try a different name or include the city." : ""}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {results && results.length > 0 && (
        <div className="rounded-md border border-border p-1">
          <ul aria-label={`${label} search results`} className="max-h-52 overflow-y-auto">
            {results.map((place) => (
              <li key={place.id} className="border-b border-border last:border-b-0">
                <button type="button" className="min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed block w-full text-left" onClick={() => choose(place)}>
                  <span className="block wrap-break-word">{place.name}</span>
                  <span className="mt-0.5 block text-xs font-normal wrap-break-word text-muted-foreground">{place.address}</span>
                </button>
                <PlaceAttributions place={place} />
              </li>
            ))}
          </ul>
          <GoogleMapsAttribution />
        </div>
      )}
    </fieldset>
  );
}
