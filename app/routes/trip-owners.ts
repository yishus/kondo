import { resolveTripId } from "../trip-url.server";
import { env } from "cloudflare:workers";
import { data } from "react-router";

import type { Route } from "./+types/trip-owners";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { addTripOwner } from "../trip-owners.server";

export async function action({ params, request }: Route.ActionArgs) {
  const db = getDb(env.DB);
  const tripId = await resolveTripId(db, params.tripId);
  await requireTripOwner(request, db, tripId);
  const form = await request.formData();
  const email = form.get("email");

  try {
    const result = await addTripOwner(
      db,
      tripId,
      typeof email === "string" ? email : "",
    );
    return result.ok
      ? result
      : data(result, { status: result.error.includes("already") ? 409 : 400 });
  } catch (error) {
    console.error("Could not add trip owner", error);
    return data(
      { ok: false as const, error: "Could not add that owner. Please try again." },
      { status: 500 },
    );
  }
}
