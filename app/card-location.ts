export type CardLocation = {
  googlePlaceId: string | null;
  googleMapsQuery: string | null;
  googlePlaceName?: string | null;
};

export type PlaceSearchResult = {
  id: string;
  name: string;
  address: string;
  attributions: { provider: string; uri: string | null }[];
};

export type PlaceSearchResponse = {
  places: PlaceSearchResult[];
  error: string | null;
};

export function googleMapsUrl(placeId: string, query: string) {
  const params = new URLSearchParams({ api: "1", query, query_place_id: placeId });
  return `https://www.google.com/maps/search/?${params}`;
}

export function readCardLocation(form: FormData, current?: CardLocation):
  | { ok: true; location: CardLocation }
  | { ok: false; error: string } {
  // Older clients can edit a card without overwriting its saved location.
  if (!form.has("googlePlaceId") && !form.has("googleMapsQuery") && !form.has("googlePlaceName")) {
    return { ok: true, location: current ?? { googlePlaceId: null, googleMapsQuery: null, googlePlaceName: null } };
  }
  const id = form.get("googlePlaceId");
  const query = form.get("googleMapsQuery");
  if (typeof id !== "string" || typeof query !== "string") {
    return { ok: false, error: "Choose a location from the search results, or remove it." };
  }
  if (!id && !query.trim()) {
    return { ok: true, location: { googlePlaceId: null, googleMapsQuery: null, googlePlaceName: null } };
  }
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(id) || !query.trim() || query.trim().length > 200) {
    return { ok: false, error: "Choose a location from the search results, or remove it." };
  }
  const name = form.has("googlePlaceName") ? form.get("googlePlaceName") : id === current?.googlePlaceId ? current.googlePlaceName ?? null : null;
  if (name !== null && (typeof name !== "string" || name.trim().length > 300)) {
    return { ok: false, error: "Choose a location with a name under 300 characters." };
  }
  return { ok: true, location: { googlePlaceId: id, googleMapsQuery: query.trim(), googlePlaceName: name?.trim() || null } };
}
