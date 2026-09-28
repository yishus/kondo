import { parseGpx, type HikeTrack } from "./hike-gpx";

// Shared across editor mounts. In-flight requests have their own timeout so
// unmounting one consumer cannot cancel another consumer's download.
const tracks = new Map<string, { promise: Promise<HikeTrack>; expires: number }>();
const MAX_TRACKS = 8;
const TTL = 5 * 60_000;

export function loadHikeTrack(url: string, userId: string): Promise<HikeTrack> {
  const key = `${userId}:${url}`;
  const cached = tracks.get(key);
  if (cached && cached.expires > Date.now()) {
    tracks.delete(key);
    tracks.set(key, cached);
    return cached.promise;
  }
  const promise = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Could not load the GPX file.");
    return parseGpx(await response.text());
  })();
  tracks.set(key, { promise, expires: Date.now() + TTL });
  while (tracks.size > MAX_TRACKS) tracks.delete(tracks.keys().next().value!);
  void promise.catch(() => { if (tracks.get(key)?.promise === promise) tracks.delete(key); });
  return promise;
}
