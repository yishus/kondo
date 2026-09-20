import { and, eq } from "drizzle-orm";
import { data } from "react-router";

import { attachmentKey } from "./attachments.server";
import type { Database } from "./db.server";
import { cardAttachments, cards } from "./db/schema";

export async function deleteCard(db: Database, bucket: R2Bucket, tripId: string, cardId: string) {
  const [card] = await db.select({ id: cards.id }).from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.tripId, tripId))).limit(1);
  if (!card) return data({ ok: false as const, error: "That card no longer exists." }, { status: 404 });

  const attachments = await db.select({ id: cardAttachments.id }).from(cardAttachments)
    .where(eq(cardAttachments.cardId, cardId));
  const deleted = await db.delete(cards)
    .where(and(eq(cards.id, cardId), eq(cards.tripId, tripId)))
    .returning({ id: cards.id });
  if (!deleted.length) return data({ ok: false as const, error: "That card no longer exists." }, { status: 404 });

  // Attachment metadata cascades with the card. Remove blobs after the database
  // commits so a database failure cannot destroy files on a surviving card.
  if (attachments.length) {
    await bucket.delete(attachments.map(({ id }) => attachmentKey(cardId, id)))
      .catch(() => console.error("Could not clean up attachments for a deleted card"));
  }
  return { ok: true as const, error: null };
}
