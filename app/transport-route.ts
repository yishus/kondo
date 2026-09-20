export type MappableTransportMode = "train" | "subway";

export type TransitRoutePlan =
  | { ok: false; error: string }
  | {
      ok: true;
      preferredMode: "TRAIN" | "SUBWAY";
      requestTime: Date;
      timeField: "departureTime" | "arrivalTime";
      timeZone: string;
      usesDepartureTime: boolean;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildTransitRoutePlan({
  mode,
  date,
  departureTime,
  arrivalTime,
  now = new Date(),
}: {
  mode: string;
  date: string | null;
  departureTime: string;
  arrivalTime: string;
  now?: Date;
}): TransitRoutePlan {
  if (mode !== "train" && mode !== "subway") {
    return { ok: false, error: "Route previews are currently available for train and subway cards." };
  }
  if (!date) {
    return { ok: false, error: "Move this card to a trip day before previewing its route." };
  }

  const time = departureTime || arrivalTime;
  if (!time) {
    return { ok: false, error: "Add a departure or arrival time to preview a scheduled transit route." };
  }

  const requestTime = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(requestTime.getTime())) {
    return { ok: false, error: "The route date or time is invalid." };
  }

  if (requestTime.getTime() < now.getTime() - 7 * DAY_MS) {
    return { ok: false, error: "Google transit routes are available for only the previous 7 days." };
  }
  if (requestTime.getTime() > now.getTime() + 100 * DAY_MS) {
    return { ok: false, error: "Google transit routes are available up to 100 days ahead." };
  }

  return {
    ok: true,
    preferredMode: mode === "train" ? "TRAIN" : "SUBWAY",
    requestTime,
    timeField: departureTime ? "departureTime" : "arrivalTime",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "your device time zone",
    usesDepartureTime: Boolean(departureTime),
  };
}

export function googleTransitDirectionsUrl(origin: string, destination: string) {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
