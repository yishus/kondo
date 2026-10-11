import { useEffect, useId, useMemo, useRef, useState } from "react";

import { googleMapsUrl, type PlaceSearchResponse, type PlaceSearchResult } from "../card-location";
import { MAX_CITY_LOCATIONS, suggestedCityLocationTypes, type CityLocationDraft } from "../city-locations";
import type { CityCardLocation } from "../db/schema";

function PlaceAttributions({ place }: { place: PlaceSearchResult }) {
  return place.attributions.map((attribution, index) => (
    <p key={index} className="px-3 pb-2 text-xs text-muted-foreground">
      {attribution.uri
        ? <a href={attribution.uri} target="_blank" rel="noopener noreferrer" className="underline">{attribution.provider}</a>
        : attribution.provider}
    </p>
  ));
}

export function CityLocationsEditor({ tripId, locations, disabled }: {
  tripId: string;
  locations: CityCardLocation[];
  disabled: boolean;
}) {
  const id = useId();
  const [items, setItems] = useState<CityLocationDraft[]>(() => locations.map((location) => ({
    googlePlaceId: location.googlePlaceId,
    googleMapsQuery: location.googleMapsQuery,
    googlePlaceName: location.googlePlaceName,
    locationType: location.locationType,
  })));
  const [query, setQuery] = useState("");
  const [locationType, setLocationType] = useState<string>("Interest");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const typeSuggestions = useMemo(() => Array.from(new Set([
    ...suggestedCityLocationTypes,
    ...items.map((item) => item.locationType),
  ])), [items]);

  function clearResults() {
    controllerRef.current?.abort();
    setSearching(false);
    setResults(null);
    setError(null);
  }

  async function search() {
    const text = query.trim();
    if (text.length < 2 || disabled) return;
    if (!locationType.trim()) {
      setError("Enter a location type before choosing a place.");
      return;
    }
    clearResults();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSearching(true);
    try {
      const response = await fetch(`/trips/${encodeURIComponent(tripId)}/places?${new URLSearchParams({ q: text })}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const result = await response.json() as PlaceSearchResponse;
      if (controller.signal.aborted) return;
      if (!response.ok || result.error) setError(result.error || "Could not search Google Maps. Please try again.");
      else setResults(result.places);
    } catch {
      if (!controller.signal.aborted) setError("Could not search Google Maps. Please try again.");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  function addPlace(place: PlaceSearchResult) {
    const type = locationType.trim();
    if (!type) {
      setError("Enter a location type before choosing a place.");
      return;
    }
    if (items.some((item) => item.googlePlaceId === place.id)) {
      setError("That Google location is already in this area.");
      return;
    }
    if (items.length >= MAX_CITY_LOCATIONS) {
      setError(`An area card can contain up to ${MAX_CITY_LOCATIONS} locations.`);
      return;
    }
    setItems((current) => [...current, {
      googlePlaceId: place.id,
      googleMapsQuery: query.trim(),
      googlePlaceName: place.name,
      locationType: type,
    }]);
    setQuery("");
    clearResults();
  }

  return (
    <fieldset className="grid min-w-0 gap-3 pt-4.5 border-t border-t-border [&_>_legend]:float-left [&_>_legend]:w-full [&_>_legend]:mb-0 [&_>_legend_+_*]:clear-both" disabled={disabled}>
      <legend className="text-secondary-foreground text-[12px] font-medium">Locations in this area <span className="font-normal text-muted-foreground">(optional)</span></legend>
      <input type="hidden" name="cityLocations" value={JSON.stringify(items)} />

      {items.length > 0 && (
        <ol className="grid gap-2" aria-label="Locations added to this area">
          {items.map((item, index) => (
            <li key={item.googlePlaceId} className="p-[12px_0] border-b border-b-border">
              <div className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center text-xs text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <a className="text-[13px] font-medium wrap-break-word text-primary hover:underline" href={googleMapsUrl(item.googlePlaceId, item.googleMapsQuery)} target="_blank" rel="noopener noreferrer">
                    {item.googlePlaceName || item.googleMapsQuery} <span aria-hidden="true">↗</span>
                  </a>
                  <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium mt-2">
                    Location type
                    <input
                      className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer"
                      list={`${id}-types`}
                      maxLength={50}
                      required
                      value={item.locationType}
                      onChange={(event) => setItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, locationType: event.target.value } : candidate))}
                    />
                  </label>
                </div>
                <button type="button" className="inline-flex min-h-8.5 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-destructive text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-destructive disabled:opacity-[.45] disabled:cursor-not-allowed shrink-0" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <datalist id={`${id}-types`}>
        {typeSuggestions.map((type) => <option key={type} value={type} />)}
      </datalist>

      <div>
        <p className="text-secondary-foreground text-[12px] font-medium mb-3">Add a Google Maps place</p>
        <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">
          Location type
          <input
            className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer"
            list={`${id}-types`}
            maxLength={50}
            placeholder="Choose or enter your own type"
            value={locationType}
            onChange={(event) => { setLocationType(event.target.value); setError(null); }}
          />
        </label>
        <div className="mt-3 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search Google Maps</span>
            <input
              id={`${id}-search`}
              type="search"
              value={query}
              maxLength={200}
              autoComplete="off"
              className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer"
              placeholder="e.g. Ghibli Museum, Tokyo"
              onChange={(event) => { clearResults(); setQuery(event.target.value); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void search();
                }
              }}
            />
          </label>
          <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface" disabled={searching || query.trim().length < 2 || !locationType.trim() || items.length >= MAX_CITY_LOCATIONS} onClick={() => void search()}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Start with Restaurants, Coffee, or Interest—or type any category you need.</p>
        <div role="status" className="mt-2 text-xs text-muted-foreground">
          {searching ? "Searching Google Maps…" : results ? results.length ? `${results.length} places found.` : "No places found. Try a different name or include the city." : ""}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        {results && results.length > 0 && (
          <div className="mt-2 rounded-md border border-border p-1">
            <ul aria-label="Area location search results" className="max-h-52 overflow-y-auto">
              {results.map((place) => (
                <li key={place.id} className="border-b border-border last:border-b-0">
                  <button type="button" className="min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed block w-full text-left" onClick={() => addPlace(place)}>
                    <span className="block wrap-break-word">{place.name}</span>
                    <span className="mt-0.5 block text-xs font-normal wrap-break-word text-muted-foreground">{place.address}</span>
                  </button>
                  <PlaceAttributions place={place} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-normal whitespace-nowrap text-muted-foreground" translate="no">Google Maps</p>
          </div>
        )}
      </div>
    </fieldset>
  );
}
