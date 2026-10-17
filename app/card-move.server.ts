import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { data } from "react-router";

import { insertCard, UNSCHEDULED_COLUMN_ID } from "./card-order";
import { CARD_RANK_STEP, cardRankBetween } from "./card-rank";
import type { Database } from "./db.server";
import { cards, tripCardOrder, tripDays } from "./db/schema";

export async function moveCard(db: Database, tripId: string, form: FormData) {
  const value = (key: string) => {
    const field = form.get(key);
    return typeof field === "string" ? field : "";
  };
  const fail = (error: string, status = 400) => data({ ok: false as const, error }, { status });
  const cardId = value("cardId");
  const tripDayId = value("tripDayId") === UNSCHEDULED_COLUMN_ID ? null : value("tripDayId");
  const beforeCardId = value("beforeCardId") || null;
  const inDay = (dayId: string | null) => dayId === null ? isNull(cards.tripDayId) : eq(cards.tripDayId, dayId);

  const [snapshot] = await db.select({ card: { id: cards.id, tripDayId: cards.tripDayId, position: cards.position }, revision: tripCardOrder.revision }).from(cards)
    .innerJoin(tripCardOrder, eq(tripCardOrder.tripId, cards.tripId))
    .where(and(eq(cards.id, cardId), eq(cards.tripId, tripId))).limit(1);
  if (!snapshot) return fail("That card no longer exists.", 404);
  const { card, revision } = snapshot;
  if (value("fromDayId") !== (card.tripDayId ?? UNSCHEDULED_COLUMN_ID)) {
    return fail("That card has moved. Please try again.", 409);
  }
  if (tripDayId !== null) {
    const [day] = await db.select({ id: tripDays.id }).from(tripDays)
      .where(and(eq(tripDays.id, tripDayId), eq(tripDays.tripId, tripId))).limit(1);
    if (!day) return fail("That destination day no longer exists.", 404);
  }
  const destinationCards = await db.select({ id: cards.id, position: cards.position }).from(cards)
    .where(and(eq(cards.tripId, tripId), inDay(tripDayId))).orderBy(asc(cards.position), asc(cards.id));
  if (beforeCardId && !destinationCards.some((item) => item.id === beforeCardId)) {
    return fail("The drop position has changed. Please try again.", 409);
  }
  if (beforeCardId === card.id) return { ok: true as const, error: null };

  const reordered = insertCard(destinationCards, { id: card.id, position: card.position }, beforeCardId);
  if (card.tripDayId === tripDayId && reordered.every((item, index) => item.id === destinationCards[index]?.id)) {
    return { ok: true as const, error: null };
  }
  const index = reordered.findIndex((item) => item.id === card.id);
  const rank = cardRankBetween(reordered[index - 1]?.position ?? null, reordered[index + 1]?.position ?? null);
  const otherPositions = rank === null ? reordered.flatMap((item, index) => {
    const position = (index + 1) * CARD_RANK_STEP;
    return item.id !== card.id && item.position !== position ? [{ id: item.id, position }] : [];
  }) : [];
  const moveToken = crypto.randomUUID();
  const claimed = sql`EXISTS (SELECT 1 FROM ${tripCardOrder}
    WHERE ${tripCardOrder.tripId} = ${tripId} AND ${tripCardOrder.moveToken} = ${moveToken})`;
  // Three parameters per neighbor (CASE id/rank and IN id). Keep each statement
  // under D1's bind limit, and avoid one statement per card during rebalancing.
  const rebalances = [];
  for (let start = 0; start < otherPositions.length; start += 30) {
    const chunk = otherPositions.slice(start, start + 30);
    rebalances.push(db.update(cards).set({ position: sql<number>`CASE ${cards.id}
      ${sql.join(chunk.map((item) => sql`WHEN ${item.id} THEN ${item.position}`), sql` `)}
      ELSE ${cards.position} END` }).where(and(
      eq(cards.tripId, tripId), inDay(tripDayId), inArray(cards.id, chunk.map((item) => item.id)), claimed,
    )));
  }

  // The revision claim and all card/timing writes commit as one D1 transaction.
  // Every subsequent write is fenced by this batch's token, so a lost claim
  // cannot partially rebalance a column or clear its saved timing labels.
  const [, moved] = await db.batch([
    db.update(tripCardOrder).set({ moveToken })
      .where(and(eq(tripCardOrder.tripId, tripId), eq(tripCardOrder.revision, revision))),
    db.update(cards).set({
      tripDayId,
      position: rank ?? (index + 1) * CARD_RANK_STEP,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(and(eq(cards.id, card.id), eq(cards.tripId, tripId), inDay(card.tripDayId), eq(cards.position, card.position), claimed))
      .returning({ id: cards.id }),
    // Remove just this card's label, preserving all other saved times and the
    // start time. JSON is edited in SQL so a concurrent refresh isn't overwritten
    // with an older snapshot. changes() refers to the card update immediately above.
    db.update(tripDays).set({ timeEstimate: sql`json_set(${tripDays.timeEstimate}, '$.labels', json((
      SELECT json_group_array(json(value)) FROM json_each(${tripDays.timeEstimate}, '$.labels')
      WHERE json_extract(value, '$.afterCardId') != ${card.id}
    )))` }).where(and(eq(tripDays.tripId, tripId), sql`changes() > 0`, claimed,
      sql`EXISTS (SELECT 1 FROM json_each(${tripDays.timeEstimate}, '$.labels')
        WHERE json_extract(value, '$.afterCardId') = ${card.id})`)),
    ...rebalances,
  ]);
  if (!moved.length) return fail("That card has moved. Please try again.", 409);
  return { ok: true as const, error: null };
}
