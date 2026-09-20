import { eq, sql } from "drizzle-orm";

import type { Database } from "./db.server";
import { tripOwners, user } from "./db/schema";

export async function addTripOwner(
  db: Database,
  tripId: string,
  rawEmail: string,
) {
  const email = rawEmail.trim().toLowerCase();
  if (!email || email.length > 320 || !email.includes("@")) {
    return { ok: false as const, error: "Enter a valid account email." };
  }

  const [newOwner] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);

  if (!newOwner) {
    return {
      ok: false as const,
      error: "No Kondo account exists for that email yet.",
    };
  }

  const inserted = await db
    .insert(tripOwners)
    .values({ tripId, userId: newOwner.id })
    .onConflictDoNothing()
    .returning({ userId: tripOwners.userId });

  if (!inserted.length) {
    return {
      ok: false as const,
      error: `${newOwner.email} is already an owner of this trip.`,
    };
  }

  return { ok: true as const, owner: newOwner };
}

export async function listTripOwners(db: Database, tripId: string) {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(tripOwners)
    .innerJoin(user, eq(user.id, tripOwners.userId))
    .where(eq(tripOwners.tripId, tripId))
    .orderBy(user.name, user.email);
}
