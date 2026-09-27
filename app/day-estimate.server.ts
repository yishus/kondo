import { and, asc, eq } from "drizzle-orm";
import type { Database } from "./db.server";
import { cards, tripDays } from "./db/schema";
import { createDayEstimate } from "./day-estimate";
import { effectiveTimezone, readTimezone } from "./timezones";
import { classifyActivities, type ClassificationOptions } from "./activity-category.server";

// The route verifies trip ownership before calling this mutation. Card mutations
// never call it: snapshots are replaced only by an explicit refresh request.
export async function refreshDayEstimate(db: Database, tripId: string, dayId: string, tripTimezone: string | null, deviceTimezone: FormDataEntryValue | null, classificationOptions: ClassificationOptions = {}) {
  const [day] = await db.select().from(tripDays)
    .where(and(eq(tripDays.id, dayId), eq(tripDays.tripId, tripId))).limit(1);
  if (!day) return { ok: false as const, error: "That trip day no longer exists.", status: 404 };
  const fallback = readTimezone(deviceTimezone);
  const timezone = effectiveTimezone(tripTimezone, day.timezone) || (fallback.ok ? fallback.timezone : null);
  if (!timezone) return { ok: false as const, error: "Set a trip or day time zone before estimating times.", status: 400 };
  const dayCards = await db.select().from(cards)
    .where(and(eq(cards.tripId, tripId), eq(cards.tripDayId, dayId)))
    .orderBy(asc(cards.position), asc(cards.id));
  let timeEstimate;
  try {
    // Validate schedules before spending a model request.
    timeEstimate = createDayEstimate(dayCards, day.tripDate, timezone);
    const { classifications, note } = await classifyActivities(dayCards, classificationOptions);
    timeEstimate = createDayEstimate(dayCards, day.tripDate, timezone, new Date(), classifications);
    timeEstimate.classificationNote = note;
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not estimate this day.", status: 400 };
  }
  const updated = await db.update(tripDays).set({ timeEstimate })
    .where(and(eq(tripDays.id, dayId), eq(tripDays.tripId, tripId))).returning({ id: tripDays.id });
  if (!updated.length) return { ok: false as const, error: "That trip day no longer exists.", status: 404 };
  return { ok: true as const, error: null, status: 200 };
}
