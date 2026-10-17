import { resolveTripId } from "../trip-url.server";
import { env } from "cloudflare:workers";

import type { Route } from "./+types/place-search";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { searchPlaces } from "../place-search.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const headers = { "Cache-Control": "no-store" };
  const db = getDb(env.DB);
  const tripId = await resolveTripId(db, params.tripId);
  await requireTripOwner(request, db, tripId);
  // This optional Worker secret is configured separately from public vars.
  const apiKey = (env as typeof env & { GOOGLE_MAPS_API_KEY?: string }).GOOGLE_MAPS_API_KEY;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchPlaces(query, apiKey, request.signal);
  return Response.json(result.body, { status: result.status, headers });
}
