import { accessibleTripCondition } from "../trip-access.server";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/trip-attachment";
import { requireUser } from "../auth.server";
import { tripAttachmentKey } from "../attachment-storage";
import { getDb } from "../db.server";
import { tripAttachments } from "../db/schema";

export async function loader({ params, request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const currentUser = await requireUser(request);
  const [file] = await db.select().from(tripAttachments)
    .where(and(accessibleTripCondition(db, params.tripId, currentUser.id, tripAttachments.tripId), eq(tripAttachments.id, params.attachmentId))).limit(1);
  if (!file) throw new Response("Attachment not found", { status: 404 });
  const object = await env.ATTACHMENTS.get(tripAttachmentKey(file.tripId, file.id));
  if (!object) throw new Response("Attachment not found", { status: 404 });
  const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
  const filename = encodeURIComponent(file.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
  return new Response(object.body, { headers: {
    "Content-Type": file.contentType,
    "Content-Length": String(file.size),
    "Content-Disposition": `${disposition}; filename="attachment.${file.contentType === "application/pdf" ? "pdf" : file.contentType === "image/png" ? "png" : "jpg"}"; filename*=UTF-8''${filename}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  } });
}
