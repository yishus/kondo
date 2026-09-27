import type { HikeTrack } from "./hike-gpx";

export type HikeProfilePoint = {
  distanceKm: number;
  elevationM: number | null;
  coordinate: [number, number];
};

// Keep the original sample index, including missing elevations and segment ends.
// This prevents the profile cursor from pointing to an unrelated route location.
export function hikeProfilePoints(track: HikeTrack): HikeProfilePoint[] {
  return track.elevationSegments.flatMap((segment, segmentIndex) => segment.map((point, index) => ({
    ...point, coordinate: track.segments[segmentIndex][index],
  })));
}

export function nearestProfilePoint(points: HikeProfilePoint[], distanceKm: number): HikeProfilePoint | null {
  if (!points.length || !Number.isFinite(distanceKm)) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].distanceKm < distanceKm) low = middle + 1;
    else high = middle;
  }
  const before = points[Math.max(0, low - 1)];
  const after = points[low];
  const nearest = Math.abs(before.distanceKm - distanceKm) < Math.abs(after.distanceKm - distanceKm) ? before : after;
  return nearest.elevationM === null ? null : nearest;
}
