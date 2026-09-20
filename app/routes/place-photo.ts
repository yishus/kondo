import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";

import type { Route } from "./+types/place-photo";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { cards } from "../db/schema";
import { getPlacePhoto } from "../place-photo.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  const [card] = await db.select({ type: cards.type, googlePlaceId: cards.googlePlaceId }).from(cards)
    .where(and(eq(cards.id, params.cardId), eq(cards.tripId, params.tripId)))
    .limit(1);
  if (!card || card.type !== "location" || !card.googlePlaceId) {
    return Response.json({ photo: null, error: "That location card no longer exists." }, { status: 404, headers });
  }

  const apiKey = (env as typeof env & { GOOGLE_MAPS_API_KEY?: string }).GOOGLE_MAPS_API_KEY;
  const result = await getPlacePhoto(card.googlePlaceId, apiKey, request.signal);
  return Response.json(result.body, { status: result.status, headers });
}
