import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/accommodation-document";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { accommodationDocuments, accommodationPlaces, accommodations } from "../db/schema";
import { documentKey } from "../accommodations.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  const [row] = await db.select({ document: accommodationDocuments }).from(accommodationDocuments)
    .innerJoin(accommodations, eq(accommodations.id, accommodationDocuments.accommodationId))
    .innerJoin(accommodationPlaces, eq(accommodationPlaces.id, accommodations.placeId))
    .where(and(eq(accommodationPlaces.tripId, params.tripId), eq(accommodations.id, params.accommodationId), eq(accommodationDocuments.id, params.documentId))).limit(1);
  if (!row) throw new Response("Document not found", { status: 404 });
  const file = row.document;
  const object = await env.ATTACHMENTS.get(documentKey(file.accommodationId, file.id));
  if (!object) throw new Response("Document not found", { status: 404 });
  const filename = encodeURIComponent(file.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
  const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
  return new Response(object.body, { headers: {
    "Content-Type": "application/pdf", "Content-Length": String(file.size),
    "Content-Disposition": `${disposition}; filename="booking.pdf"; filename*=UTF-8''${filename}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
  } });
}
