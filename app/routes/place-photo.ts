import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";

import type { Route } from "./+types/place-photo";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { cards } from "../db/schema";
import { getPlacePhoto } from "../place-photo.server";

export async function action({ params, request }: Route.ActionArgs) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (photo: typeof cards.$inferSelect.googlePhoto, error: string | null = null, status = 200) =>
    Response.json({ photo, error }, { status, headers });
  if (request.method !== "POST") return reply(null, "Method not allowed.", 405);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply(null, "Please refresh photos from this app.", 403);
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  const scope = and(eq(cards.id, params.cardId), eq(cards.tripId, params.tripId));
  const [card] = await db.select().from(cards).where(scope).limit(1);
  if (!card || card.type !== "location" || !card.googlePlaceId) {
    return reply(null, "That location card no longer exists.", 404);
  }
  if (card.coverAttachmentId) return reply(null);
  const form = await request.formData();
  if (form.get("placeId") !== card.googlePlaceId) return reply(null, "That card's location has changed.", 409);
  // Another tab may already have replaced the URL that this client saw fail.
  if (card.googlePhoto && form.get("failedImageUrl") !== card.googlePhoto.imageUrl) return reply(card.googlePhoto);

  const apiKey = (env as typeof env & { GOOGLE_MAPS_API_KEY?: string }).GOOGLE_MAPS_API_KEY;
  const result = await getPlacePhoto(card.googlePlaceId, apiKey, request.signal);
  if (result.status !== 200) return reply(null, result.body.error, result.status);
  const [saved] = await db.update(cards).set({ googlePhoto: result.body.photo }).where(and(
    scope, eq(cards.type, "location"), eq(cards.googlePlaceId, card.googlePlaceId), isNull(cards.coverAttachmentId),
    card.googlePhoto ? eq(cards.googlePhoto, card.googlePhoto) : isNull(cards.googlePhoto),
  )).returning({ googlePhoto: cards.googlePhoto });
  if (saved) return reply(saved.googlePhoto);
  // Do not overwrite a location, cover, or photo changed during the Google call.
  const [latest] = await db.select().from(cards).where(scope).limit(1);
  return reply(latest?.type === "location" && latest.googlePlaceId === card.googlePlaceId && !latest.coverAttachmentId
    ? latest.googlePhoto : null);
}
