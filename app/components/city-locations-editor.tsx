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
      locationType: type,
    }]);
    setQuery("");
    clearResults();
  }

  return (
    <fieldset className="ui-section" disabled={disabled}>
      <legend className="ui-label">Locations in this area <span className="font-normal text-muted-foreground">(optional)</span></legend>
      <input type="hidden" name="cityLocations" value={JSON.stringify(items)} />

      {items.length > 0 && (
        <ol className="grid gap-2" aria-label="Locations added to this area">
          {items.map((item, index) => (
            <li key={item.googlePlaceId} className="ui-saved-item">
              <div className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center text-xs text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <a className="text-[13px] font-medium break-words text-primary hover:underline" href={googleMapsUrl(item.googlePlaceId, item.googleMapsQuery)} target="_blank" rel="noopener noreferrer">
                    {item.googleMapsQuery} <span aria-hidden="true">↗</span>
                  </a>
                  <label className="ui-field mt-2">
                    Location type
                    <input
                      className="ui-input"
                      list={`${id}-types`}
                      maxLength={50}
                      required
                      value={item.locationType}
                      onChange={(event) => setItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, locationType: event.target.value } : candidate))}
                    />
                  </label>
                </div>
                <button type="button" className="ui-button ui-button-danger shrink-0" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
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
        <p className="ui-label mb-3">Add a Google Maps place</p>
        <label className="ui-field">
          Location type
          <input
            className="ui-input"
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
              className="ui-input"
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
          <button type="button" className="ui-button ui-button-outline" disabled={searching || query.trim().length < 2 || !locationType.trim() || items.length >= MAX_CITY_LOCATIONS} onClick={() => void search()}>
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
                  <button type="button" className="ui-button block w-full text-left" onClick={() => addPlace(place)}>
                    <span className="block break-words">{place.name}</span>
                    <span className="mt-0.5 block text-xs font-normal break-words text-muted-foreground">{place.address}</span>
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
