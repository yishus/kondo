export const suggestedCityLocationTypes = ["Restaurants", "Coffee", "Interest"] as const;
export const MAX_CITY_LOCATIONS = 50;

const locationTypeColors: Record<string, string> = {
  restaurant: "#c93756",
  restaurants: "#c93756",
  coffee: "#8b5e3c",
  interest: "#3568c0",
};

const customTypeColors = ["#7c3aed", "#0f766e", "#c2410c", "#0369a1", "#a21caf", "#4d7c0f"];

export function cityLocationTypeColor(type: string) {
  const normalized = type.trim().toLocaleLowerCase();
  if (Object.hasOwn(locationTypeColors, normalized)) return locationTypeColors[normalized];

  let hash = 0;
  for (const character of normalized) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return customTypeColors[hash % customTypeColors.length];
}

export type CityLocationDraft = {
  googlePlaceId: string;
  googleMapsQuery: string;
  googlePlaceName?: string | null;
  locationType: string;
};

export function readCityLocations(
  form: FormData,
  cardType: string,
  current: CityLocationDraft[] = [],
): { ok: true; locations: CityLocationDraft[] } | { ok: false; error: string } {
  if (cardType !== "city") return { ok: true, locations: [] };
  if (!form.has("cityLocations")) return { ok: true, locations: current };
  const raw = form.get("cityLocations");
  if (typeof raw !== "string" || raw.length > 50_000) {
    return { ok: false, error: "Could not read the area locations. Reopen the card and try again." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Could not read the area locations. Reopen the card and try again." };
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_CITY_LOCATIONS) {
    return { ok: false, error: `An area card can contain up to ${MAX_CITY_LOCATIONS} locations.` };
  }

  const locations: CityLocationDraft[] = [];
  const placeIds = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Each area location must have a place and type." };
    }
    const candidate = item as Record<string, unknown>;
    const googlePlaceId = typeof candidate.googlePlaceId === "string" ? candidate.googlePlaceId.trim() : "";
    const googleMapsQuery = typeof candidate.googleMapsQuery === "string" ? candidate.googleMapsQuery.trim() : "";
    const googlePlaceName = candidate.googlePlaceName == null ? null : typeof candidate.googlePlaceName === "string" ? candidate.googlePlaceName.trim() || null : false;
    if (googlePlaceName === false || (googlePlaceName?.length ?? 0) > 300) {
      return { ok: false, error: "Choose an area location with a name under 300 characters." };
    }
    const locationType = typeof candidate.locationType === "string" ? candidate.locationType.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(googlePlaceId) || !googleMapsQuery || googleMapsQuery.length > 200) {
      return { ok: false, error: "Choose each area location from the Google Maps search results." };
    }
    if (!locationType || locationType.length > 50) {
      return { ok: false, error: "Enter a location type between 1 and 50 characters." };
    }
    if (placeIds.has(googlePlaceId)) {
      return { ok: false, error: "The same Google location cannot be added twice to one area." };
    }
    placeIds.add(googlePlaceId);
    locations.push({ googlePlaceId, googleMapsQuery, googlePlaceName, locationType });
  }
  return { ok: true, locations };
}
