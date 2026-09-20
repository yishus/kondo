import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import type { Route } from "./+types/place-search";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { trips } from "../db/schema";
import { searchPlaces } from "../place-search.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const headers = { "Cache-Control": "no-store" };
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  const [trip] = await db.select({ id: trips.id }).from(trips)
    .where(eq(trips.id, params.tripId)).limit(1);
  if (!trip) {
    return Response.json({ places: [], error: "That trip no longer exists." }, { status: 404, headers });
  }
  // This optional Worker secret is configured separately from public vars.
  const apiKey = (env as typeof env & { GOOGLE_MAPS_API_KEY?: string }).GOOGLE_MAPS_API_KEY;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchPlaces(query, apiKey, request.signal);
  return Response.json(result.body, { status: result.status, headers });
}
