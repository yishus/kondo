import type { PlaceSearchResponse, PlaceSearchResult } from "./card-location";

export async function searchPlaces(query: string, apiKey: string | undefined, signal?: AbortSignal): Promise<{
  status: number;
  body: PlaceSearchResponse;
}> {
  const fail = (error: string, status: number) => ({ status, body: { places: [], error } });
  const textQuery = query.trim();
  if (textQuery.length < 2 || textQuery.length > 200) {
    return fail("Enter a place name or address between 2 and 200 characters.", 400);
  }
  if (!apiKey?.trim()) {
    return fail("Place search is unavailable right now. You can still save your card without changing its location.", 503);
  }

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.attributions",
      },
      body: JSON.stringify({ textQuery, pageSize: 5 }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      // Do not return Google's raw errors, request headers, or credentials.
      return fail("Could not search Google Maps. Please try again in a moment.", 502);
    }
    const result = await response.json() as {
      places?: {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        attributions?: { provider?: string; providerUri?: string }[];
      }[];
    };
    const places: PlaceSearchResult[] = (result.places ?? []).flatMap((place) => {
      if (!place.id || !place.displayName?.text) return [];
      return [{
        id: place.id,
        name: place.displayName.text,
        address: place.formattedAddress ?? "",
        attributions: (place.attributions ?? []).flatMap((attribution) => attribution.provider ? [{
          provider: attribution.provider,
          uri: attribution.providerUri?.startsWith("https://") ? attribution.providerUri : null,
        }] : []),
      }];
    });
    return { status: 200, body: { places, error: null } };
  } catch {
    return fail("Could not search Google Maps. Please try again in a moment.", 502);
  }
}
