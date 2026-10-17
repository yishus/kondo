import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/journal-image";
import { getDb } from "../db.server";
import { requireUser } from "../auth.server";
import { accessibleTripCondition } from "../trip-access.server";
import { journalEntries, journalImages } from "../db/schema";
import { journalVisibilityCondition } from "../journal.server";
import { journalImageKey } from "../journal";

export async function loader({ request, params }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const user = await requireUser(request);
  const row = await db.select({ image: journalImages, tripId: journalEntries.tripId }).from(journalImages)
    .innerJoin(journalEntries, eq(journalImages.entryId, journalEntries.id))
    .where(and(accessibleTripCondition(db, params.tripId, user.id, journalEntries.tripId), journalVisibilityCondition(user.id), eq(journalEntries.id, params.entryId), eq(journalImages.id, params.imageId))).get();
  if (!row) throw new Response("Image not found", { status: 404 });
  const object = await env.ATTACHMENTS.get(journalImageKey(row.tripId, params.entryId, params.imageId));
  if (!object) throw new Response("Image not found", { status: 404 });
  return new Response(object.body, { headers: {
    "Content-Type": row.image.contentType,
    "Content-Length": String(row.image.size),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  } });
}
