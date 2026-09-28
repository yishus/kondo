import type { HikeTrack } from "./hike-gpx";
import { hikePreviewKey } from "./attachment-storage";

const WIDTH = 640;
const HEIGHT = 360;
const TILE_SIZE = 256;
type Point = [number, number];

function project([lat, lon]: Point): Point {
  const sin = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180);
  return [(lon + 180) / 360, Math.max(0, Math.min(1, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)))];
}

export function previewLayout(track: HikeTrack) {
  let previousX: number | undefined;
  // Unwrap longitude so routes crossing the date line stay together.
  const segments = track.segments.map((segment) => segment.map((coordinate): Point => {
    const [x, y] = project(coordinate);
    const unwrapped = previousX === undefined ? x : x + Math.round(previousX - x);
    previousX = unwrapped;
    return [unwrapped, y];
  }));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const segment of segments) for (const [x, y] of segment) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const zoom = Math.max(0, Math.min(16, Math.floor(Math.log2(Math.min(
    (WIDTH - 64) / (TILE_SIZE * Math.max(maxX - minX, 1e-10)),
    (HEIGHT - 64) / (TILE_SIZE * Math.max(maxY - minY, 1e-10)),
  )))));
  const count = 2 ** zoom;
  const scale = TILE_SIZE * count;
  const left = (minX + maxX) / 2 * scale - WIDTH / 2;
  const top = (minY + maxY) / 2 * scale - HEIGHT / 2;
  const tiles: { url: string; key: string; x: number; y: number }[] = [];
  for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor((top + HEIGHT - 1) / TILE_SIZE); y++) {
    if (y < 0 || y >= count) continue;
    for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + WIDTH - 1) / TILE_SIZE); x++) {
      const wrappedX = ((x % count) + count) % count;
      const path = `${zoom}/${wrappedX}/${y}.png`;
      tiles.push({ url: `https://tile.openstreetmap.org/${path}`, key: `map-tiles/osm/${path}`, x: x * TILE_SIZE - left, y: y * TILE_SIZE - top });
    }
  }
  return { tiles, segments: segments.map((segment) => segment.map(([x, y]): Point => [x * scale - left, y * scale - top])) };
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function tileImage(bucket: R2Bucket, tile: { key: string; url: string }, signal: AbortSignal, referer: string) {
  const cached = await bucket.get(tile.key);
  // Consume the R2 body before opening a tile request so stale cache entries
  // do not hold extra streaming connections during concurrent revalidation.
  const cachedBytes = cached ? new Uint8Array(await cached.arrayBuffer()) : undefined;
  if (cachedBytes && Number(cached?.customMetadata?.expires) > Date.now()) return base64(cachedBytes);
  const headers = new Headers({ "User-Agent": "kondo/1.0 (hike route previews)", Referer: referer });
  if (cached?.customMetadata?.etag) headers.set("If-None-Match", cached.customMetadata.etag);
  if (cached?.customMetadata?.modified) headers.set("If-Modified-Since", cached.customMetadata.modified);
  const response = await fetch(tile.url, { headers, signal });
  if (!response.ok && response.status !== 304) {
    await response.body?.cancel();
    throw new Error("Map tiles are unavailable.");
  }
  const bytes = response.status === 304 && cachedBytes ? cachedBytes : new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 1024 * 1024 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) throw new Error("Invalid map tile.");
  const maxAge = response.headers.get("Cache-Control")?.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1];
  const expiresHeader = Date.parse(response.headers.get("Expires") ?? "");
  const expires = maxAge ? Date.now() + Math.max(0, Number(maxAge) - Number(response.headers.get("Age") ?? 0)) * 1000
    : Number.isFinite(expiresHeader) ? expiresHeader : Date.now() + 7 * 86400_000;
  await bucket.put(tile.key, bytes, { httpMetadata: { contentType: "image/png" }, customMetadata: {
    expires: String(expires), etag: response.headers.get("ETag") ?? cached?.customMetadata?.etag ?? "",
    modified: response.headers.get("Last-Modified") ?? cached?.customMetadata?.modified ?? "",
  } });
  return base64(bytes);
}

export async function renderHikePreview(bucket: R2Bucket, track: HikeTrack, referer: string) {
  const { tiles, segments } = previewLayout(track);
  const signal = AbortSignal.timeout(8000);
  const images: string[] = [];
  const downloads = new Map<string, Promise<string>>();
  // Only the tiles in this one preview viewport; at most four downloads at once.
  let index = 0;
  const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (index < tiles.length) {
      const tile = tiles[index++];
      let download = downloads.get(tile.key);
      if (!download) { download = tileImage(bucket, tile, signal, referer); downloads.set(tile.key, download); }
      const encoded = await download;
      images.push(`<image x="${tile.x.toFixed(2)}" y="${tile.y.toFixed(2)}" width="256" height="256" href="data:image/png;base64,${encoded}"/>`);
    }
  }));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  const paths = segments.map((segment) => {
    let previous: Point | undefined;
    return segment.filter((point, i) => {
      if (previous && i !== segment.length - 1 && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 1) return false;
      previous = point;
      return true;
    }).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  }).join(" ");
  const marker = ([x, y]: Point, fill: string) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6" fill="${fill}" stroke="#166534" stroke-width="3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="100%" height="100%" fill="#e5e7eb"/>${images.join("")}<path d="${paths}" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="${paths}" fill="none" stroke="#15803d" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>${marker(segments[0][0], "white")}${marker(segments.at(-1)!.at(-1)!, "#166534")}<rect x="352" y="334" width="288" height="26" fill="white" fill-opacity=".9"/><text x="632" y="352" text-anchor="end" font-family="Arial,sans-serif" font-size="16" fill="#1f2937">© OpenStreetMap contributors</text></svg>`;
}

export async function saveHikePreview(bucket: R2Bucket, cardId: string, attachmentId: string, track: HikeTrack, referer: string) {
  const svg = await renderHikePreview(bucket, track, referer);
  await bucket.put(hikePreviewKey(cardId, attachmentId), svg, { httpMetadata: { contentType: "image/svg+xml" } });
}
