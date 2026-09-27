export function readTimezone(value: FormDataEntryValue | null) {
  if (value === null || value === "") return { ok: true as const, timezone: null };
  if (typeof value !== "string") return { ok: false as const, error: "Choose a valid time zone, such as Asia/Tokyo." };
  const timezone = value.trim();
  if (!timezone) return { ok: true as const, timezone: null };
  try {
    // Require a named zone rather than a fixed offset, so DST follows the date.
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(timezone)) throw new Error();
    return { ok: true as const, timezone: new Intl.DateTimeFormat("en", { timeZone: timezone }).resolvedOptions().timeZone };
  } catch {
    return { ok: false as const, error: "Choose a valid time zone, such as Asia/Tokyo." };
  }
}

export function effectiveTimezone(tripTimezone: string | null, dayTimezone: string | null) {
  return dayTimezone || tripTimezone;
}

/** Use the override for the schedule anchor, falling back independently for each endpoint. */
export function transportTimezone(card: {
  departureTime: string;
  departureTimezone?: string | null;
  arrivalTimezone?: string | null;
}, inheritedTimezone: string | null) {
  return (card.departureTime ? card.departureTimezone : card.arrivalTimezone) || inheritedTimezone;
}

/** Resolve a local clock time without depending on the device/server zone.
 * Reject missing or repeated DST clock times rather than guessing an instant.
 */
export function zonedDateTime(date: string, time: string, timezone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const wall = new Date(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 10) !== date) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    const localMillis = (instant: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
      return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    };
    const offsets = new Set<number>();
    for (const hours of [-36, 0, 36]) {
      const sample = wall.getTime() + hours * 3_600_000;
      offsets.add(localMillis(sample) - sample);
    }
    const matches = [...offsets].map((offset) => wall.getTime() - offset)
      .filter((instant) => localMillis(instant) === wall.getTime());
    return matches.length === 1 ? new Date(matches[0]) : null;
  } catch {
    return null;
  }
}
