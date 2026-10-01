import { resolveTripId } from "../trip-url.server";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/card-search";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { searchCards } from "../card-search.server";
import { data } from "react-router";

export async function loader({ params, request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const tripId = await resolveTripId(db, params.tripId);
  const user = await requireTripOwner(request, db, tripId);
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const headers = { "Cache-Control": "no-store" };
  try {
    return data(await searchCards(db, tripId, user.id, query), { headers });
  } catch {
    return data({ query: query.trim(), results: [], hasMore: false, error: "Could not search cards. Please try again." }, { headers });
  }
}
