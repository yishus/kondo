import type { TripColumn } from "./card-order";
import { createDayEstimate, type EstimateCard } from "./day-estimate";
import { zonedDateTime } from "./timezones";

export function localClock(now: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function labelInstant(date: string, label: string, timezone: string) {
  const match = label.match(/^(\d{2}:\d{2})(?: \(([+-]?\d+)d\))?$/);
  if (!match) return null;
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + Number(match[2] ?? 0));
  return zonedDateTime(day.toISOString().slice(0, 10), match[1], timezone)?.getTime() ?? null;
}

/** Timing is an itinerary estimate, never evidence of the traveler's location. */
export function tripNow(columns: (Pick<TripColumn, "id" | "date" | "effectiveTimezone" | "timeEstimate"> & { cards: EstimateCard[] })[], tripTimezone: string | null, deviceTimezone: string | null, now: Date) {
  const fallback = tripTimezone || deviceTimezone || "UTC";
  const today = columns.find((day) => day.date === localClock(now, day.effectiveTimezone || fallback).date);
  const schedules = columns.filter((day) => day.date).map((day) => {
    const timezone = day.effectiveTimezone || fallback;
    try {
      const classifications = new Map((day.timeEstimate?.labels ?? []).flatMap((label) => label.classification ? [[label.afterCardId, label.classification] as const] : []));
      const estimate = createDayEstimate(day.cards, day.date!, timezone, now, classifications);
      let start = labelInstant(day.date!, estimate.startLabel, timezone);
      const windows = day.cards.filter((card) => card.type !== "city").map((card) => {
        const end = labelInstant(day.date!, estimate.labels.find((label) => label.afterCardId === card.id)!.time, timezone);
        const departure = card.type === "transport" && card.departureTime
          ? zonedDateTime(day.date!, card.departureTime, card.departureTimezone || timezone)?.getTime() ?? null : null;
        const window = { card, start: departure === null ? start : Math.max(start ?? departure, departure), end };
        start = end;
        return window;
      });
      return { day, timezone, windows };
    } catch {
      // Invalid/ambiguous transport times must not prevent viewing the trip.
      return { day, timezone, windows: [] };
    }
  });
  const overnight = schedules.find((schedule) => schedule.windows.some((window) => window.card.type === "transport"
    && window.start !== null && window.end !== null && now.getTime() >= window.start && now.getTime() < window.end));
  const selected = overnight ?? schedules.find((schedule) => schedule.day.id === today?.id);
  const timezone = selected?.timezone || fallback;
  const current = selected?.windows.find((window) => window.start !== null && window.end !== null && now.getTime() >= window.start && now.getTime() < window.end);
  const next = selected?.windows.find((window) => window.start !== null && window.start > now.getTime());
  return {
    ...localClock(now, timezone), timezone, dayId: selected?.day.id ?? today?.id ?? null,
    currentCardId: current?.card.id ?? null, nextCardId: next?.card.id ?? null,
    timingNote: "Current/next cards are inferred from entered transport times and estimated activity durations, not live location or confirmed activity times.",
  };
}
