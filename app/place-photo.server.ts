export type PlacePhotoResponse = {
  photo: { imageUrl: string; googleMapsUri: string } | null;
  error: string | null;
};

// Resolve a newly selected location once. Ordinary edits reuse its saved photo,
// including when an uploaded cover temporarily hides it.
export async function photoForCardLocation(
  type: string,
  placeId: string | null,
  current: { type: string; googlePlaceId: string | null; googlePhoto: PlacePhotoResponse["photo"] } | undefined,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<PlacePhotoResponse["photo"]> {
  if (type !== "location" || !placeId) return null;
  if (current?.type === type && current.googlePlaceId === placeId) return current.googlePhoto;
  return (await getPlacePhoto(placeId, apiKey, signal)).body.photo;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function getPlacePhoto(
  placeId: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<{ status: number; body: PlacePhotoResponse }> {
  const fail = (error: string, status: number) => ({ status, body: { photo: null, error } });
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(placeId)) return fail("That location is invalid.", 400);
  if (!apiKey?.trim()) return fail("A Google Maps photo is unavailable.", 503);
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
    : AbortSignal.timeout(8000);

  try {
    const placeResponse = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "photos",
      },
      signal: requestSignal,
    });
    if (!placeResponse.ok) return fail("A Google Maps photo is unavailable.", 502);
    const place = await placeResponse.json() as {
      photos?: { name?: string; googleMapsUri?: string }[];
    };
    const photo = place.photos?.[0];
    const expectedPrefix = `places/${placeId}/photos/`;
    if (!photo?.name?.startsWith(expectedPrefix) || !/^[A-Za-z0-9_-]+$/.test(photo.name.slice(expectedPrefix.length))) {
      return { status: 200, body: { photo: null, error: null } };
    }
    if (!isHttpsUrl(photo.googleMapsUri)) {
      return { status: 200, body: { photo: null, error: null } };
    }

    const mediaUrl = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
    mediaUrl.searchParams.set("maxWidthPx", "1200");
    mediaUrl.searchParams.set("maxHeightPx", "700");
    mediaUrl.searchParams.set("skipHttpRedirect", "true");
    const mediaResponse = await fetch(mediaUrl, {
      headers: { "X-Goog-Api-Key": apiKey },
      signal: requestSignal,
    });
    if (!mediaResponse.ok) return fail("A Google Maps photo is unavailable.", 502);
    const media = await mediaResponse.json() as { photoUri?: string };
    if (!isHttpsUrl(media.photoUri)) return fail("A Google Maps photo is unavailable.", 502);

    return {
      status: 200,
      body: { photo: { imageUrl: media.photoUri, googleMapsUri: photo.googleMapsUri }, error: null },
    };
  } catch {
    return fail("A Google Maps photo is unavailable.", 502);
  }
}
