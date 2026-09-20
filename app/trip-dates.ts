const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatTripDates(start: string | null, end: string | null) {
  return start && end
    ? dateFormatter.formatRange(new Date(`${start}T00:00:00Z`), new Date(`${end}T00:00:00Z`))
    : "Dates not set";
}

export type TripPeriod = "current" | "upcoming" | "past";

export function getTripPeriod(
  start: string | null,
  end: string | null,
  today: string,
): TripPeriod {
  if (!start || !end) return "upcoming";
  if (end < today) return "past";
  if (start > today) return "upcoming";
  return "current";
}
