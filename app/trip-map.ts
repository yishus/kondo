import type { TripColumn } from "./card-order";
import { locationCategories, type LocationCategory } from "./card-types";

export type MapPoint = [number, number];
export type TripMapEntry = {
  cardId: string;
  title: string;
  day: string;
  placeId: string | null;
  type: "location" | "hike";
  locationCategory: LocationCategory | null;
};
export type ResolvedMapEntry = TripMapEntry & { point: MapPoint | null; error: string | null };
export type MapColorBy = "day" | "type";

const dayColors = ["#2563eb", "#c2410c", "#15803d", "#7e22ce", "#be123c", "#0e7490", "#a16207", "#4338ca", "#a21caf", "#0f766e"];
const typeColors = {
  location: { label: "Location · Uncategorized", color: "#0f766e" },
  place_of_interest: { label: `Location · ${locationCategories.place_of_interest}`, color: "#7e22ce" },
  food: { label: `Location · ${locationCategories.food}`, color: "#c2410c" },
  hike: { label: "Hike", color: "#15803d" },
};

export function tripMapColorKey(entry: TripMapEntry, colorBy: MapColorBy) {
  return colorBy === "day" ? entry.day : entry.type === "location" ? entry.locationCategory ?? "location" : entry.type;
}

export function tripMapColorGroups(entries: TripMapEntry[], colorBy: MapColorBy) {
  const keys = new Set(entries.map((entry) => tripMapColorKey(entry, colorBy)));
  if (colorBy === "type") {
    return Object.entries(typeColors).filter(([key]) => keys.has(key)).map(([key, group]) => ({ key, ...group }));
  }
  return [...keys].sort().map((key, index) => ({
    key, label: key,
    color: key === "Unscheduled" ? "#64748b" : dayColors[index] ?? `hsl(${(index * 137.508) % 360} 65% 38%)`,
  }));
}

export function tripMapEntries(columns: TripColumn[]): TripMapEntry[] {
  return columns.flatMap((column) => column.cards.flatMap((card): TripMapEntry[] =>
    card.type === "location" || card.type === "hike" ? [{ cardId: card.id, title: card.title, day: column.date ?? "Unscheduled", placeId: card.googlePlaceId, type: card.type, locationCategory: card.locationCategory }] : [],
  ));
}

export function validMapPoint(point: MapPoint) {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
}

// Deduplicate places and bound API concurrency. One failed lookup must not hide
// other cards. Cache ownership stays with the mounted map view.
export async function resolveTripMap(entries: TripMapEntry[], lookup: (placeId: string) => Promise<MapPoint | null>, signal: AbortSignal): Promise<ResolvedMapEntry[]> {
  const queue = [...new Set(entries.flatMap((entry) => entry.placeId ? [entry.placeId] : []))];
  const points = new Map<string, MapPoint>();
  async function work() {
    let next;
    while (!signal.aborted && (next = queue.shift())) {
      try {
        const point = await lookup(next);
        if (point && validMapPoint(point)) points.set(next, point);
      } catch { /* Report unavailable coordinates per card below. */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, work));
  return entries.map((entry) => {
    const point = entry.placeId ? points.get(entry.placeId) ?? null : null;
    return { ...entry, point, error: point ? null : entry.placeId
      ? "Could not locate this card on the map." : "Add a location to show this pin.",
    };
  });
}

// Keep trips crossing the date line together when fitting all pins.
export function wrapMapEntries(entries: ResolvedMapEntry[]): ResolvedMapEntry[] {
  const longitudes = entries.flatMap((entry) => entry.point ? [(entry.point[1] + 360) % 360] : []).sort((a, b) => a - b);
  if (!longitudes.length) return entries;
  let start = longitudes[0];
  let largestGap = -1;
  for (let i = 0; i < longitudes.length; i++) {
    const next = longitudes[(i + 1) % longitudes.length];
    const gap = next + (i === longitudes.length - 1 ? 360 : 0) - longitudes[i];
    if (gap > largestGap) { largestGap = gap; start = next; }
  }
  return entries.map((entry) => {
    if (!entry.point) return entry;
    let lng = (entry.point[1] + 360) % 360;
    if (lng < start) lng += 360;
    return { ...entry, point: [entry.point[0], lng] };
  });
}
