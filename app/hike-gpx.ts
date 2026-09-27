import { XMLParser, XMLValidator } from "fast-xml-parser";

export const GPX_CONTENT_TYPE = "application/gpx+xml";
export const MAX_GPX_SIZE = 10 * 1024 * 1024;
const MAX_POINTS = 100_000;

export type HikeTrack = {
  segments: [number, number][][];
  elevationSegments: { distanceKm: number; elevationM: number | null }[][];
  hikeDistanceKm: number;
  hikeElevationGainM: number | null;
};

export function gpxFileError(file: File): string | null {
  if (!/\.gpx$/i.test(file.name)) return "Choose a GPX file.";
  if (!file.size) return "The GPX file is empty.";
  if (file.size > MAX_GPX_SIZE) return "The GPX file must be 10 MB or smaller.";
  return null;
}

const list = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function number(value: unknown): number | null {
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function distance(a: [number, number], b: [number, number]) {
  const radians = Math.PI / 180;
  const h = Math.sin((b[0] - a[0]) * radians / 2) ** 2
    + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin((b[1] - a[1]) * radians / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function parseGpx(xml: string): HikeTrack {
  if (new TextEncoder().encode(xml).length > MAX_GPX_SIZE) throw new Error("The GPX file must be 10 MB or smaller.");
  // GPX needs no DTD or custom entities; never expand user-defined XML entities.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error("Upload a valid GPX XML file without a DTD or custom entities.");
  }
  const parsed = new XMLParser({
    ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false,
    parseAttributeValue: false, processEntities: false,
  }).parse(xml);
  if (!parsed.gpx || typeof parsed.gpx !== "object") throw new Error("The file must contain a GPX document.");
  const gpx = object(parsed.gpx);
  const tracks = list(gpx.trk).flatMap((track) => list(object(track).trkseg).map((segment) => list(object(segment).trkpt)));
  const routes = list(gpx.rte).map((route) => list(object(route).rtept));
  // Route points often duplicate the track in exports. Prefer recorded tracks.
  const source = tracks.some((segment) => segment.length) ? tracks : routes;
  let points = 0;
  let hikeDistanceKm = 0;
  let gain = 0;
  let completeElevation = true;
  const segments: HikeTrack["segments"] = [];
  const elevationSegments: HikeTrack["elevationSegments"] = [];
  for (const segment of source) {
    const coordinates: [number, number][] = [];
    const elevations: HikeTrack["elevationSegments"][number] = [];
    let previousElevation: number | null = null;
    for (const raw of segment) {
      if (++points > MAX_POINTS) throw new Error("The GPX file must contain 100,000 route points or fewer.");
      const point = object(raw);
      const lat = number(point["@_lat"]);
      const lon = number(point["@_lon"]);
      if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new Error("The GPX file contains an invalid latitude or longitude.");
      }
      const coordinate: [number, number] = [lat, lon];
      const elevation = number(point.ele);
      if (elevation === null) completeElevation = false;
      const previous = coordinates.at(-1);
      if (previous) {
        hikeDistanceKm += distance(previous, coordinate);
        if (elevation !== null && previousElevation !== null) gain += Math.max(0, elevation - previousElevation);
      }
      coordinates.push(coordinate);
      elevations.push({ distanceKm: hikeDistanceKm, elevationM: elevation });
      previousElevation = elevation;
    }
    if (coordinates.length) {
      segments.push(coordinates);
      elevationSegments.push(elevations);
    }
  }
  if (!segments.some((segment) => segment.length >= 2)) throw new Error("The GPX file needs a track or route with at least two points.");
  return { segments, elevationSegments, hikeDistanceKm, hikeElevationGainM: completeElevation ? gain : null };
}

export function hikeSummary(distanceKm: number | null, elevationGainM: number | null) {
  return [
    distanceKm !== null && `${Number(distanceKm.toFixed(2))} km`,
    elevationGainM !== null ? `${Math.round(elevationGainM)} m gain` : "Elevation gain unavailable",
  ].filter(Boolean).join(" · ");
}
