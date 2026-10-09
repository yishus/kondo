type MapsLink = { placeId: string | null; query: string | null; coordinates: { latitude: number; longitude: number } | null };

function mapsUrl(value: string): URL {
  const url = new URL(value);
  const googleHost = /^(?:www\.|maps\.)?google\.(?:com|co\.uk|co\.jp|com\.sg|com\.au|co\.nz|ca|de|fr|it|es|nl|co\.in)$/.test(url.hostname);
  const shortHost = url.hostname === "maps.app.goo.gl" || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"));
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !(shortHost || (googleHost && (url.hostname.startsWith("maps.") || /^\/maps(?:\/|$)/.test(url.pathname))))) {
    throw new Error("Paste a Google Maps place link, or search by place name.");
  }
  return url;
}

function parseLink(url: URL): MapsLink {
  const decoded = decodeURIComponent(url.pathname + url.search);
  const query = url.searchParams.get("query") || url.searchParams.get("q");
  const embeddedId = decoded.match(/!1s([A-Za-z0-9_-]+)(?:!|&|$)/)?.[1]
    || decoded.match(/!19s([A-Za-z0-9_-]+)(?:!|&|$)/)?.[1];
  const placeId = url.searchParams.get("query_place_id") || url.searchParams.get("place_id")
    || query?.match(/^place_id:([A-Za-z0-9_-]+)$/)?.[1] || embeddedId || null;
  const name = url.pathname.match(/\/place\/([^/]+)/)?.[1];
  const coordinateMatch = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const latitude = Number(coordinateMatch?.[1]);
  const longitude = Number(coordinateMatch?.[2]);
  return {
    placeId: placeId && /^[A-Za-z0-9_-]{1,512}$/.test(placeId) ? placeId : null,
    query: name ? decodeURIComponent(name.replace(/\+/g, " ")) : query && !/^(?:place_id:|loc:|[-\d.]+\s*,\s*[-\d.]+$)/.test(query) ? query : null,
    coordinates: coordinateMatch && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null,
  };
}

export async function resolveGoogleMapsLink(value: string, signal: AbortSignal): Promise<MapsLink> {
  let url = mapsUrl(value);
  // Expand only approved Maps hosts; validate each hop before making a request.
  for (let hop = 0; hop < 5; hop++) {
    const parsed = parseLink(url);
    if (parsed.placeId || parsed.query) return parsed;
    if (url.hostname !== "maps.app.goo.gl" && url.hostname !== "goo.gl") break;
    const response = await fetch(url.href, { redirect: "manual", signal });
    const location = response.headers.get("Location");
    await response.body?.cancel();
    if (response.status < 300 || response.status >= 400 || !location) break;
    url = mapsUrl(new URL(location, url).href);
  }
  throw new Error("Could not identify a place in that link. Copy a place’s Share link from Google Maps, or search by name.");
}
