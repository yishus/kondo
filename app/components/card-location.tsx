import { useEffect, useId, useRef, useState } from "react";

import { googleMapsUrl, type CardLocation, type PlaceSearchResponse, type PlaceSearchResult } from "../card-location";

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

export function CardLocationPicker({ tripId, location, onChange, disabled }: {
  tripId: string;
  location: CardLocation;
  onChange: (location: CardLocation) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
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

  async function search() {
    const text = query.trim();
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
    <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold">Google Maps location <span className="font-normal text-muted-foreground">(optional)</span></legend>
      <input type="hidden" name="googlePlaceId" value={location.googlePlaceId ?? ""} />
      <input type="hidden" name="googleMapsQuery" value={location.googleMapsQuery ?? ""} />
      {location.googlePlaceId && (
        <div className="rounded-[10px] border border-success-border bg-success-soft p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold break-words">{selected?.name ?? "Location added"}</p>
              {selected?.address && <p className="mt-1 text-xs break-words text-muted-foreground">{selected.address}</p>}
              <a className="mt-1 inline-block font-semibold text-primary hover:underline" href={googleMapsUrl(location.googlePlaceId, location.googleMapsQuery ?? "Location")} target="_blank" rel="noopener noreferrer">
                View on Google Maps <span aria-hidden="true">↗</span>
              </a>
            </div>
            <button type="button" className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary shrink-0 text-secondary-foreground" onClick={() => {
              onChange({ googlePlaceId: null, googleMapsQuery: null });
              setSelected(null);
              clearSearch();
            }}>Remove location</button>
          </div>
          {selected && <><PlaceAttributions place={selected} /><GoogleMapsAttribution /></>}
        </div>
      )}
      <label className="text-xs font-semibold text-secondary-foreground" htmlFor={id}>
        {location.googlePlaceId ? "Search for a different place" : "Search for a place"}
      </label>
      <div className="flex gap-2">
        <input id={id} type="search" value={query} maxLength={200} autoComplete="off"
          className="min-w-0 flex-1 rounded-[10px] border border-input px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="e.g. Ghibli Museum, Tokyo" aria-describedby={`${id}-hint`}
          onChange={(event) => { clearSearch(); setQuery(event.target.value); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary bg-accent text-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={searching || query.trim().length < 2} onClick={() => void search()}>
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">Include the city or address, then choose a result to attach it.</p>
      <div role="status" className="text-xs text-muted-foreground">
        {searching ? "Searching Google Maps…" : results ? results.length ? `${results.length} places found.` : "No places found. Try a different name or include the city." : ""}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {results && results.length > 0 && (
        <div className="rounded-[10px] border border-border bg-background p-2">
          <ul aria-label="Location search results" className="max-h-52 overflow-y-auto">
            {results.map((place) => (
              <li key={place.id} className="border-b border-border last:border-b-0">
                <button type="button" className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary w-full text-left" onClick={() => {
                  onChange({ googlePlaceId: place.id, googleMapsQuery: query.trim() });
                  setSelected(place);
                  clearSearch();
                  setQuery("");
                }}>
                  <span className="block break-words">{place.name}</span>
                  <span className="mt-0.5 block text-xs font-normal break-words text-muted-foreground">{place.address}</span>
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
