import { eq } from "drizzle-orm";
import { redirect } from "react-router";
import { v7 as uuidv7 } from "uuid";
import type { Database } from "./db.server";
import { tripOwners, trips } from "./db/schema";
import { newTripCode } from "./trip-code";

// Callers still authorize ownership against the resolved internal UUID.
export async function resolveTripId(db: Database, identifier: string) {
  if (!/^[23456789abcdefghijkmnpqrstuvwxyz]{8}$/.test(identifier)) return identifier;
  const [trip] = await db.select({ id: trips.id }).from(trips)
    .where(eq(trips.code, identifier)).limit(1);
  if (!trip) throw new Response("Trip not found", { status: 404 });
  return trip.id;
}

export function redirectLegacyTripUrl(request: Request, trip: { id: string; code: string | null }) {
  if (!trip.code || !["GET", "HEAD"].includes(request.method)) return;
  const url = new URL(request.url);
  const prefix = `/trips/${encodeURIComponent(trip.id)}`;
  const pathname = url.pathname.replace(/\.data$/, "");
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return;
  throw redirect(`/trips/${trip.code}${pathname.slice(prefix.length)}${url.search}`, 308);
}

export async function createTrip(
  db: Database,
  details: { title: string; timezone: string | null },
  userId: string,
  generateCode = newTripCode,
) {
  const id = uuidv7();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      await db.batch([
        db.insert(trips).values({ id, code, ...details }),
        db.insert(tripOwners).values({ tripId: id, userId }),
      ]);
      return { id, code };
    } catch (error) {
      // Only retry code collisions; other database failures must surface.
      const [collision] = await db.select({ id: trips.id }).from(trips)
        .where(eq(trips.code, code)).limit(1);
      if (!collision || attempt === 4) throw error;
    }
  }
  throw new Error("Could not allocate a trip code");
}
