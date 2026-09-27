import { zonedDateTime } from "./timezones";

export type MappableTransportMode = "train" | "subway" | "tram" | "bus" | "car" | "taxi" | "walk";

const transitModes = { train: "TRAIN", subway: "SUBWAY", tram: "LIGHT_RAIL", bus: "BUS" } as const;

export function isMappableTransportMode(mode: string | null): mode is MappableTransportMode {
  return mode !== null && (Object.hasOwn(transitModes, mode) || mode === "car" || mode === "taxi" || mode === "walk");
}

export type TransportRoutePlan =
  | { ok: false; error: string }
  | {
      ok: true;
      travelMode: "TRANSIT" | "DRIVING" | "WALKING";
      preferredMode?: typeof transitModes[keyof typeof transitModes];
      routingPreference?: "TRAFFIC_AWARE" | "TRAFFIC_UNAWARE";
      requestTime: Date | null;
      timeField: "departureTime" | "arrivalTime" | null;
      timeZone: string;
      usesDepartureTime: boolean;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildTransportRoutePlan({
  mode,
  date,
  departureTime,
  arrivalTime,
  timezone,
  now = new Date(),
}: {
  mode: string;
  date: string | null;
  departureTime: string;
  arrivalTime: string;
  timezone?: string | null;
  now?: Date;
}): TransportRoutePlan {
  if (!isMappableTransportMode(mode)) {
    return { ok: false, error: "Route previews are unavailable for this transport type." };
  }
  const timeZone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const preferredMode = Object.hasOwn(transitModes, mode) ? transitModes[mode as keyof typeof transitModes] : undefined;
  const generalPlan = {
    ok: true as const, timeZone, requestTime: null, timeField: null, usesDepartureTime: false,
  };
  if (mode === "walk") return { ...generalPlan, travelMode: "WALKING" };
  if (!preferredMode && (!date || !departureTime)) {
    return { ...generalPlan, travelMode: "DRIVING", routingPreference: "TRAFFIC_UNAWARE" };
  }
  if (!date) {
    return { ok: false, error: "Move this card to a trip day before previewing its route." };
  }

  const time = departureTime || arrivalTime;
  if (!time) {
    return { ok: false, error: "Add a departure or arrival time to preview a scheduled transit route." };
  }

  const requestTime = zonedDateTime(date, time, timeZone);
  if (!requestTime || !Number.isFinite(requestTime.getTime())) {
    return { ok: false, error: "The route date or time is invalid or repeated during a clock change. Choose another time." };
  }

  if (!preferredMode) {
    if (requestTime < now) return { ...generalPlan, travelMode: "DRIVING", routingPreference: "TRAFFIC_UNAWARE" };
    return {
      ok: true, travelMode: "DRIVING", routingPreference: "TRAFFIC_AWARE",
      requestTime, timeField: "departureTime", timeZone, usesDepartureTime: true,
    };
  }

  if (requestTime.getTime() < now.getTime() - 7 * DAY_MS) {
    return { ok: false, error: "Google transit routes are available for only the previous 7 days." };
  }
  if (requestTime.getTime() > now.getTime() + 100 * DAY_MS) {
    return { ok: false, error: "Google transit routes are available up to 100 days ahead." };
  }

  return {
    ok: true,
    travelMode: "TRANSIT",
    preferredMode,
    requestTime,
    timeField: departureTime ? "departureTime" : "arrivalTime",
    timeZone,
    usesDepartureTime: Boolean(departureTime),
  };
}

export function buildTransportRouteRequest(origin: string, destination: string, plan: Extract<TransportRoutePlan, { ok: true }>) {
  const request: Record<string, unknown> = {
    origin, destination, travelMode: plan.travelMode,
    fields: ["path", "legs", "viewport", "localizedValues"],
  };
  if (plan.preferredMode) request.transitPreference = { allowedTransitModes: [plan.preferredMode] };
  if (plan.routingPreference) request.routingPreference = plan.routingPreference;
  if (plan.timeField && plan.requestTime) request[plan.timeField] = plan.requestTime;
  return request;
}

export function googleTransportDirectionsUrl(origin: string, destination: string, mode: string) {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: mode === "walk" ? "walking" : mode === "car" || mode === "taxi" ? "driving" : "transit",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
