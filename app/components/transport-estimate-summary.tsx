import { formatTravelDuration, type TransportEstimate } from "../transport-estimate";

// Hide retired messages that may still exist in saved estimates.
const retiredNotes = new Set([
  "May include walking and other public transport.",
  "Travel-time estimates are available for train, subway, tram, bus, car, taxi, and walking.",
]);

export function TransportEstimateSummary({ estimate }: { estimate: TransportEstimate | null }) {
  if (!estimate) return null;
  const note = estimate.note && !retiredNotes.has(estimate.note) ? estimate.note : null;
  if (estimate.durationSeconds === null && !note) return null;
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      {estimate.durationSeconds !== null && <p>Est. {formatTravelDuration(estimate.durationSeconds)} · Google Maps</p>}
      {note && <p>{note}</p>}
    </div>
  );
}
