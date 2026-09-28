import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/hike-preview";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { cardAttachments, cards } from "../db/schema";
import { attachmentKey, hikePreviewKey, PRIVATE_ATTACHMENT_CACHE } from "../attachment-storage";
import { GPX_CONTENT_TYPE, parseGpx } from "../hike-gpx";
import { saveHikePreview } from "../hike-preview.server";

// Coalesce simultaneous requests for the same missing preview within a Worker.
const pending = new Map<string, Promise<void>>();

export async function loader({ params, request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  const scope = and(eq(cards.tripId, params.tripId), eq(cards.id, params.cardId),
    eq(cardAttachments.id, params.attachmentId), eq(cardAttachments.contentType, GPX_CONTENT_TYPE));
  const findAttachment = () => db.select({ id: cardAttachments.id }).from(cardAttachments)
    .innerJoin(cards, eq(cards.id, cardAttachments.cardId)).where(scope).get();
  if (!await findAttachment()) throw new Response("Hike route not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const key = hikePreviewKey(params.cardId, params.attachmentId);
  let preview = await env.ATTACHMENTS.get(key);
  if (!preview) {
    let generation = pending.get(key);
    if (!generation) {
      generation = (async () => {
        const gpx = await env.ATTACHMENTS.get(attachmentKey(params.cardId, params.attachmentId));
        if (!gpx) throw new Error("GPX is unavailable.");
        await saveHikePreview(env.ATTACHMENTS, params.cardId, params.attachmentId, parseGpx(await gpx.text()), new URL(request.url).origin);
        // Removal/replacement can race generation. Do not leave orphaned previews.
        if (!await findAttachment()) {
          await env.ATTACHMENTS.delete(key);
          throw new Error("GPX was removed.");
        }
      })();
      pending.set(key, generation);
      void generation.finally(() => { if (pending.get(key) === generation) pending.delete(key); }).catch(() => {});
    }
    try { await generation; }
    catch { return new Response("Preview unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
    preview = await env.ATTACHMENTS.get(key);
  }
  if (!preview) return new Response("Preview unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  const headers = {
    "Content-Type": "image/svg+xml", "Cache-Control": PRIVATE_ATTACHMENT_CACHE, Vary: "Cookie",
    ETag: preview.httpEtag, "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src data:; sandbox",
  };
  if (request.headers.get("If-None-Match") === preview.httpEtag) {
    await preview.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(preview.body, { headers });
}
