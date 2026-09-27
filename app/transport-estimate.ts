export type TransportEstimate = {
  date: string | null;
  durationSeconds: number | null;
  note: string | null;
  timezone?: string | null;
};

export function formatTravelDuration(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
}

export function estimateForDate(estimate: TransportEstimate | null, date: string | null, timezone?: string | null): TransportEstimate | null {
  if (!estimate || (estimate.date === date && (timezone === undefined || (estimate.timezone ?? null) === timezone))) return estimate;
  return { date, timezone, durationSeconds: null, note: "Save the card to refresh its travel-time estimate for this day and time zone." };
}
