import type { Card } from "./db/schema";
import { estimateForDate } from "./transport-estimate";
import { transportTimezone, zonedDateTime } from "./timezones";
import { activityCategories, type ActivityClassification } from "./activity-category";

export type EstimateCard = Pick<Card, "id" | "type" | "title" | "description" | "locationCategory" | "hikeDistanceKm" | "hikeElevationGainM" | "transportMode" | "departureTime" | "arrivalTime" | "departureTimezone" | "arrivalTimezone" | "transportEstimate">;

export type DayEstimate = {
  generatedAt: string;
  startLabel: string;
  timezone: string;
  classificationNote?: string | null;
  labels: { afterCardId: string; time: string; explanation: string; classification?: ActivityClassification }[];
};

export function writtenDuration(card: Pick<EstimateCard, "title" | "description">): number | null {
  const content = `${card.title}\n${card.description}`;
  const duration = content.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b(?:\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)\b)?|\b(\d+)\s*(?:minutes?|mins?)\b/i);
  if (duration) {
    const minutes = duration[3] ? Number(duration[3]) : Number(duration[1]) * 60 + Number(duration[2] ?? 0);
    if (minutes > 0 && minutes <= 1440) return Math.ceil(minutes);
  }
  return null;
}

/** Code owns durations; Jev optionally supplies a location's semantic category. */
export function estimateActivityDuration(card: EstimateCard, date: string, timezone: string, classification?: ActivityClassification) {
  if (card.type === "city") return { minutes: 0, reason: "Area marker; no time estimate" };
  const minutes = writtenDuration(card);
  if (minutes !== null) return { minutes, reason: "Duration written in the card" };
  const content = `${card.title}\n${card.description}`;
  if (card.type === "transport") {
    const estimate = estimateForDate(card.transportEstimate, date, transportTimezone(card, timezone));
    if (estimate?.durationSeconds && estimate.durationSeconds > 0) {
      return { minutes: Math.ceil(estimate.durationSeconds / 60), reason: "Saved travel-time estimate" };
    }
    return { minutes: card.transportMode === "flight" ? 120 : card.transportMode === "walk" ? 20 : 45, reason: "Typical travel duration; no route duration available" };
  }
  if (card.type === "hike") {
    if (card.hikeDistanceKm && card.hikeDistanceKm > 0) {
      return { minutes: Math.max(15, Math.ceil((card.hikeDistanceKm / 4 * 60 + (card.hikeElevationGainM ?? 0) / 600 * 60) / 5) * 5), reason: "Hike distance at 4 km/h, plus 1 hour per 600 m ascent" };
    }
    return { minutes: 120, reason: "Typical hike duration; no distance available" };
  }
  if (card.type === "location" && classification) {
    const category = activityCategories[classification.category];
    return { minutes: category.minutes, reason: `${category.label} · category chosen by Jev` };
  }
  if (/\b(coffee|café|cafe|tea|snack)\b/i.test(content)) return { minutes: 30, reason: "Typical café or snack stop" };
  if (card.locationCategory === "food" || /\b(breakfast|lunch|dinner|restaurant)\b/i.test(content)) return { minutes: 60, reason: "Typical meal stop" };
  if (/\b(museum|gallery)\b/i.test(content)) return { minutes: 90, reason: "Typical museum or gallery visit" };
  return { minutes: 60, reason: "Typical visit duration" };
}

export function createDayEstimate(cards: EstimateCard[], date: string, timezone: string, now = new Date(), classifications: ReadonlyMap<string, ActivityClassification> = new Map()): DayEstimate {
  const defaultStart = zonedDateTime(date, "09:00", timezone);
  if (!defaultStart) throw new Error("Could not estimate times for this date and time zone.");
  const durations = cards.map((card) => estimateActivityDuration(card, date, timezone, classifications.get(card.id)));
  const schedules = cards.map((card) => {
    if (card.type !== "transport") return { departure: null, arrival: null };
    const departure = card.departureTime ? zonedDateTime(date, card.departureTime, card.departureTimezone || timezone)?.getTime() ?? null : null;
    let arrival = card.arrivalTime ? zonedDateTime(date, card.arrivalTime, card.arrivalTimezone || timezone)?.getTime() ?? null : null;
    if ((card.departureTime && departure === null) || (card.arrivalTime && arrival === null)) {
      throw new Error("A transport time is invalid or ambiguous during a clock change. Update the card before refreshing.");
    }
    // Arrival dates are not stored on cards; an earlier arrival means the next local day.
    if (departure !== null && arrival !== null && arrival < departure) {
      const nextDate = new Date(`${date}T12:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      arrival = zonedDateTime(nextDate.toISOString().slice(0, 10), card.arrivalTime, card.arrivalTimezone || timezone)?.getTime() ?? null;
      if (arrival === null) throw new Error("The overnight arrival time is ambiguous. Update the card before refreshing.");
    }
    return { departure, arrival };
  });
  let elapsed = 0;
  let cursor = defaultStart.getTime();
  for (let index = 0; index < cards.length; index++) {
    const { departure, arrival } = schedules[index];
    const anchor = departure ?? (arrival === null ? null : arrival - durations[index].minutes * 60_000);
    if (anchor !== null) { cursor = anchor - elapsed; break; }
    elapsed += durations[index].minutes * 60_000;
  }
  const format = (instant: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant).map(({ type, value }) => [type, value]));
    const dayOffset = Math.round((Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
    return `${parts.hour}:${parts.minute}${dayOffset ? ` (${dayOffset > 0 ? "+" : ""}${dayOffset}d)` : ""}`;
  };
  const startLabel = format(cursor);
  const labels = cards.flatMap((card, index) => {
    if (card.type === "city") return [];
    const duration = durations[index];
    const { departure, arrival } = schedules[index];
    const conflict = departure !== null && cursor > departure;
    const start = Math.max(cursor, departure ?? cursor);
    const end = arrival ?? start + duration.minutes * 60_000;
    const arrivalConflict = end < start;
    cursor = Math.max(start, end);
    return [{
      afterCardId: card.id,
      ...(card.type === "location" && writtenDuration(card) === null && classifications.has(card.id) ? { classification: classifications.get(card.id) } : {}),
      time: format(cursor),
      explanation: `After ${card.title}: ${arrival !== null ? "uses the entered arrival time" : `${duration.minutes} min · ${duration.reason}`}${conflict || arrivalConflict ? ". Timing conflict with the preceding cards." : ""}`,
    }];
  });
  return { generatedAt: now.toISOString(), startLabel, timezone, labels };
}

/** Keep every saved label, even when its original card has been removed.
 * Orphaned labels stay before the next surviving card from the saved sequence.
 */
export function dayEstimateSlots(cardIds: string[], estimate: DayEstimate | null | undefined) {
  const slots: DayEstimate["labels"][] = Array.from({ length: cardIds.length + 1 }, () => []);
  const labels = estimate?.labels ?? [];
  const indices = new Map(cardIds.map((id, index) => [id, index]));
  labels.forEach((label, index) => {
    const anchor = indices.get(label.afterCardId);
    const next = labels.slice(index + 1).find((item) => indices.has(item.afterCardId));
    const slot = anchor !== undefined ? anchor + 1 : next ? indices.get(next.afterCardId)! : cardIds.length;
    slots[slot].push(label);
  });
  return slots;
}
