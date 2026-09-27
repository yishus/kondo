import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";

import type { Route } from "./+types/attachment";
import { requireTripOwner } from "../auth.server";
import { attachmentKey } from "../attachments.server";
import { getDb } from "../db.server";
import { cardAttachments, cards } from "../db/schema";

export async function loader({ params, request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  const [row] = await db.select({ attachment: cardAttachments }).from(cardAttachments)
    .innerJoin(cards, eq(cards.id, cardAttachments.cardId))
    .where(and(eq(cards.tripId, params.tripId), eq(cards.id, params.cardId), eq(cardAttachments.id, params.attachmentId)))
    .limit(1);
  if (!row) throw new Response("Attachment not found", { status: 404 });
  const file = row.attachment;
  const object = await env.ATTACHMENTS.get(attachmentKey(file.cardId, file.id));
  if (!object) throw new Response("Attachment not found", { status: 404 });
  const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
  const filename = encodeURIComponent(file.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
  return new Response(object.body, { headers: {
    "Content-Type": file.contentType,
    "Content-Length": String(file.size),
    "Content-Disposition": `${disposition}; filename="attachment.${file.contentType === "application/gpx+xml" ? "gpx" : file.contentType === "application/pdf" ? "pdf" : file.contentType === "image/png" ? "png" : "jpg"}"; filename*=UTF-8''${filename}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  } });
}
