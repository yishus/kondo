import type { PlaceSearchResponse, PlaceSearchResult } from "./card-location";
import { resolveGoogleMapsLink } from "./google-maps-link.server";

export async function searchPlaces(query: string, apiKey: string | undefined, signal?: AbortSignal): Promise<{
  status: number;
  body: PlaceSearchResponse;
}> {
  const fail = (error: string, status: number) => ({ status, body: { places: [], error } });
  let textQuery = query.trim();
  const isLink = /^https?:\/\//i.test(textQuery);
  if (textQuery.length < 2 || textQuery.length > (isLink ? 8192 : 200)) {
    return fail("Enter a place name or address between 2 and 200 characters.", 400);
  }
  if (!apiKey?.trim()) {
    return fail("Place search is unavailable right now. You can still save your card without changing its location.", 503);
  }

  try {
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);
    let link;
    if (isLink) {
      try {
        link = await resolveGoogleMapsLink(textQuery, requestSignal);
      } catch {
        return fail("Could not identify that Google Maps place. Try its Share link, or search by place name.", 400);
      }
      textQuery = link.query ?? "";
    }
    const placeId = link?.placeId;
    const fields = ["id", "displayName", "formattedAddress", "attributions", "primaryType", "types"];
    const response = await fetch(placeId ? `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` : "https://places.googleapis.com/v1/places:searchText", {
      method: placeId ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fields.map((field) => placeId ? field : `places.${field}`).join(","),
      },
      body: placeId ? undefined : JSON.stringify({ textQuery, pageSize: 5,
        ...(link?.coordinates ? { locationBias: { circle: { center: link.coordinates, radius: 500 } } } : {}),
      }),
      signal: requestSignal,
    });
    if (!response.ok) {
      // Do not return Google's raw errors, request headers, or credentials.
      return fail("Could not search Google Maps. Please try again in a moment.", 502);
    }
    type GooglePlace = {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      attributions?: { provider?: string; providerUri?: string }[];
      primaryType?: string;
      types?: string[];
    };
    const result = await response.json() as GooglePlace & { places?: GooglePlace[] };
    const places: PlaceSearchResult[] = (placeId ? [result] : result.places ?? []).flatMap((place) => {
      if (!place.id || !place.displayName?.text) return [];
      return [{
        id: place.id,
        name: place.displayName.text,
        address: place.formattedAddress ?? "",
        primaryType: place.primaryType,
        types: place.types,
        attributions: (place.attributions ?? []).flatMap((attribution) => attribution.provider ? [{
          provider: attribution.provider,
          uri: attribution.providerUri?.startsWith("https://") ? attribution.providerUri : null,
        }] : []),
      }];
    });
    return { status: 200, body: { places, error: null, resolved: Boolean(placeId) } };
  } catch {
    return fail("Could not search Google Maps. Please try again in a moment.", 502);
  }
}
