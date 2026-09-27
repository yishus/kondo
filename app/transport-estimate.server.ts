import type { CardDetails } from "./card-types";
import type { TransportEstimate } from "./transport-estimate";
import { transportTimezone, zonedDateTime } from "./timezones";

const transitModes: Record<string, string> = { train: "TRAIN", subway: "SUBWAY", bus: "BUS", tram: "LIGHT_RAIL" };
const DAY_MS = 86_400_000;

export async function fetchTransportEstimate({
  card, date, utcOffsetMinutes, timezone = null, apiKey, now = new Date(), fetcher = fetch,
}: {
  card: CardDetails;
  date: string | null;
  utcOffsetMinutes: string;
  timezone?: string | null;
  apiKey?: string;
  now?: Date;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
}): Promise<TransportEstimate | null> {
  if (card.type !== "transport" || (!card.departureTime && !card.arrivalTime)) return null;
  timezone = transportTimezone(card, timezone);
  const unavailable = (note: string): TransportEstimate => ({ date, timezone, durationSeconds: null, note });
  const mode = card.transportMode ?? "";
  const transitMode = Object.hasOwn(transitModes, mode) ? transitModes[mode] : undefined;
  const driving = mode === "car" || mode === "taxi";
  if (!transitMode && !driving && mode !== "walk") {
    return null;
  }
  if (!date) return unavailable("Move this card to a trip day and save it to estimate travel time.");

  // Retain the device offset when neither an override nor an inherited zone is set.
  const offset = Number(utcOffsetMinutes);
  const time = card.departureTime || card.arrivalTime;
  if ((!timezone && (!utcOffsetMinutes.trim() || !Number.isInteger(offset) || Math.abs(offset) > 840))
    || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return unavailable("Check the trip date and time, then save again to estimate travel time.");
  }
  const localTime = new Date(`${date}T${time}:00Z`);
  if (!Number.isFinite(localTime.getTime()) || localTime.toISOString().slice(0, 10) !== date) {
    return unavailable("Check the trip date and time, then save again to estimate travel time.");
  }
  const requestTime = timezone ? zonedDateTime(date, time, timezone) : new Date(localTime.getTime() + offset * 60_000);
  if (!requestTime) return unavailable("This local time is invalid or repeated during a clock change. Choose another time to estimate travel time.");
  if (transitMode && (requestTime.getTime() < now.getTime() - 7 * DAY_MS
    || requestTime.getTime() > now.getTime() + 100 * DAY_MS)) {
    return unavailable("Google transit estimates are available from 7 days ago to 100 days ahead.");
  }
  if (!apiKey?.trim()) return unavailable("Google Maps travel-time estimates are currently unavailable.");

  const body: Record<string, unknown> = {
    origin: { address: card.startLocation },
    destination: { address: card.endLocation },
    travelMode: transitMode ? "TRANSIT" : driving ? "DRIVE" : "WALK",
  };
  let note: string | null = null;
  if (transitMode) {
    body.transitPreferences = { allowedTravelModes: [transitMode] };
    body[card.departureTime ? "departureTime" : "arrivalTime"] = requestTime.toISOString();
  } else if (driving) {
    if (card.departureTime && requestTime >= now) {
      body.departureTime = requestTime.toISOString();
      body.routingPreference = "TRAFFIC_AWARE";
    } else {
      body.routingPreference = "TRAFFIC_UNAWARE";
      note = "General driving estimate; traffic at the specified time is not included.";
    }
  }

  try {
    const response = await fetcher("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey.trim(),
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) {
      console.error("Google travel-time lookup failed", response.status);
      return unavailable("Travel-time estimate unavailable. Save again to retry.");
    }
    const result = await response.json() as { routes?: { duration?: unknown }[] };
    const duration = result.routes?.[0]?.duration;
    if (typeof duration !== "string" || !/^\d+(?:\.\d+)?s$/.test(duration)) {
      return unavailable("Google Maps found no travel-time estimate for this route and schedule.");
    }
    const durationSeconds = Math.ceil(Number(duration.slice(0, -1)));
    if (!Number.isSafeInteger(durationSeconds)) return unavailable("Travel-time estimate unavailable. Save again to retry.");
    return { date, timezone, durationSeconds, note };
  } catch {
    return unavailable("Travel-time estimate unavailable. Save again to retry.");
  }
}
