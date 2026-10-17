import { and, eq, exists } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Database } from "./db.server";
import { tripOwners, trips } from "./db/schema";
import { tripIdentifierWhere } from "./trip-url.server";

/** Embed authorization in a data query; this constructs SQL, not a DB call. */
export function tripOwnerCondition(db: Database, tripId: AnySQLiteColumn | string, userId: string) {
  return exists(db.select({ tripId: tripOwners.tripId }).from(tripOwners)
    .where(and(eq(tripOwners.tripId, tripId), eq(tripOwners.userId, userId))));
}

/** Resolve a public code/internal ID and check ownership inside a resource query. */
export function accessibleTripCondition(db: Database, identifier: string, userId: string, resourceTripId: AnySQLiteColumn) {
  return exists(db.select({ id: trips.id }).from(trips)
    .innerJoin(tripOwners, eq(tripOwners.tripId, trips.id))
    .where(and(tripIdentifierWhere(identifier), eq(tripOwners.userId, userId), eq(trips.id, resourceTripId))));
}
