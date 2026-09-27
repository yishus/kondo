import { useEffect, useId, useMemo, useState } from "react";
import type { HikeTrack } from "../hike-gpx";
import { hikeProfilePoints, nearestProfilePoint, type HikeProfilePoint } from "../hike-profile";

export function HikeElevationProfile({ track, compact = false, onHighlight }: { track: HikeTrack; compact?: boolean; onHighlight?: (point: HikeProfilePoint | null) => void }) {
  const hintId = useId();
  const points = useMemo(() => hikeProfilePoints(track), [track]);
  const [selected, setSelected] = useState<HikeProfilePoint | null>(null);
  const active = selected && points.includes(selected) ? selected : null;
  useEffect(() => { onHighlight?.(active); }, [active, onHighlight]);
  const height = compact ? 140 : 200;
  const left = 52;
  const right = 388;
  const top = 12;
  const bottom = height - 28;
  const profile = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    const runs: { distanceKm: number; elevationM: number }[][] = [];
    for (const segment of track.elevationSegments) {
      let run: typeof runs[number] = [];
      for (const point of segment) {
        if (point.elevationM === null) {
          if (run.length) runs.push(run);
          run = [];
        } else {
          min = Math.min(min, point.elevationM);
          max = Math.max(max, point.elevationM);
          run.push({ distanceKm: point.distanceKm, elevationM: point.elevationM });
        }
      }
      if (run.length) runs.push(run);
    }
    if (!runs.length) return null;
    const padding = Math.max((max - min) * 0.1, 1);
    const low = min - padding;
    const high = max + padding;
    const x = (km: number) => left + (track.hikeDistanceKm > 0 ? km / track.hikeDistanceKm : 0.5) * (right - left);
    const y = (m: number) => bottom - (m - low) / (high - low) * (bottom - top);
    return {
      min, max, x, y,
      ticks: [max, ...(min !== max ? [min] : [])].map((value) => ({ value, y: y(value) })),
      runs: runs.map((run) => {
        const points = run.map((point) => `${x(point.distanceKm).toFixed(2)},${y(point.elevationM).toFixed(2)}`).join(" ");
        return { points, area: `${x(run[0].distanceKm)},${bottom} ${points} ${x(run.at(-1)!.distanceKm)},${bottom}`, single: run.length === 1 };
      }),
    };
  }, [track, bottom]);

  return <div className="border-t border-border bg-surface px-3 pb-2 pt-3">
    <p className="text-xs font-medium">Elevation profile</p>
    <p id={hintId} className="sr-only">Hover or touch the profile to highlight that point on the route map. Use left and right arrow keys when focused.</p>
    {profile ? <svg viewBox={`0 0 400 ${height}`} role="img"
      aria-label={`Elevation profile over ${Number(track.hikeDistanceKm.toFixed(2))} km, from ${Math.round(profile.min)} to ${Math.round(profile.max)} metres`}
      aria-describedby={hintId} tabIndex={0}
      className="mt-1 block w-full text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width * 400;
        if (x < left || x > right) { setSelected(null); return; }
        setSelected(nearestProfilePoint(points, (x - left) / (right - left) * track.hikeDistanceKm));
      }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * 400 - left) / (right - left)));
        setSelected(nearestProfilePoint(points, fraction * track.hikeDistanceKm));
      }}
      onPointerLeave={() => setSelected(null)} onBlur={() => setSelected(null)}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const forward = event.key !== "ArrowLeft" && event.key !== "End";
        let index = event.key === "Home" ? 0 : event.key === "End" ? points.length - 1
          : active ? Math.max(0, Math.min(points.length - 1, points.indexOf(active) + (forward ? 1 : -1))) : 0;
        while (index >= 0 && index < points.length && points[index].elevationM === null) index += forward ? 1 : -1;
        if (points[index]) setSelected(points[index]);
      }}>
      {profile.ticks.map((tick) => <g key={tick.value}>
        <line x1={left} x2={right} y1={tick.y} y2={tick.y} stroke="var(--border)" strokeDasharray="3 3" />
        <text x={left - 8} y={tick.y} dy="0.35em" textAnchor="end" fill="currentColor" fontSize="10">{Math.round(tick.value)} m</text>
      </g>)}
      {profile.runs.map((run, index) => <g key={index}>
        <polygon points={run.area} fill="#15803d" fillOpacity="0.12" />
        {run.single ? <circle cx={run.points.split(",")[0]} cy={run.points.split(",")[1]} r="2" fill="#15803d" />
          : <polyline points={run.points} fill="none" stroke="#15803d" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      </g>)}
      <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--border)" />
      {[0, 0.5, 1].map((fraction) => <text key={fraction} x={left + fraction * (right - left)} y={height - 7}
        textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"} fill="currentColor" fontSize="10">
        {Number((track.hikeDistanceKm * fraction).toFixed(2))} km
      </text>)}
      {active && active.elevationM !== null && <g pointerEvents="none">
        <line x1={profile.x(active.distanceKm)} x2={profile.x(active.distanceKm)} y1={top} y2={bottom} stroke="#15803d" strokeDasharray="3 3" />
        <circle data-profile-cursor cx={profile.x(active.distanceKm)} cy={profile.y(active.elevationM)} r="4" fill="#15803d" stroke="white" strokeWidth="2" />
      </g>}
    </svg> : <p className="py-3 text-xs text-muted-foreground">Elevation data unavailable in this GPX file.</p>}
    {profile && <p className="min-h-4 text-xs tabular-nums text-muted-foreground" aria-live="polite">
      {active ? `${active.distanceKm.toFixed(2)} km · ${Math.round(active.elevationM!)} m` : "Hover over the profile to locate a point on the map."}
    </p>}
  </div>;
}
