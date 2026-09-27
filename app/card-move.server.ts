import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { data } from "react-router";

import { insertCard, UNSCHEDULED_COLUMN_ID } from "./card-order";
import type { Database } from "./db.server";
import { cards, tripDays } from "./db/schema";

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

  const [card] = await db.select().from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.tripId, tripId))).limit(1);
  if (!card) return fail("That card no longer exists.", 404);
  if (value("fromDayId") !== (card.tripDayId ?? UNSCHEDULED_COLUMN_ID)) {
    return fail("That card has moved. Please try again.", 409);
  }
  if (tripDayId !== null) {
    const [day] = await db.select({ id: tripDays.id }).from(tripDays)
      .where(and(eq(tripDays.id, tripDayId), eq(tripDays.tripId, tripId))).limit(1);
    if (!day) return fail("That destination day no longer exists.", 404);
  }
  const affectedDays = [...new Set([card.tripDayId, tripDayId])];
  const dayCards = await db.select().from(cards)
    .where(and(eq(cards.tripId, tripId), or(...affectedDays.map(inDay)))).orderBy(asc(cards.position), asc(cards.id));
  const destinationCards = dayCards.filter((item) => item.tripDayId === tripDayId);
  if (beforeCardId && !destinationCards.some((item) => item.id === beforeCardId)) {
    return fail("The drop position has changed. Please try again.", 409);
  }
  if (beforeCardId === card.id) return { ok: true as const, error: null };

  const reordered = insertCard(destinationCards, { ...card, tripDayId }, beforeCardId);
  if (card.tripDayId === tripDayId && reordered.every((item, index) => item.id === destinationCards[index]?.id)) {
    return { ok: true as const, error: null };
  }
  const sourceCards = dayCards.filter((item) => item.tripDayId === card.tripDayId && item.id !== card.id);
  const otherPositions = [
    ...reordered.map((item, position) => ({ ...item, position })).filter((item) => item.id !== card.id),
    ...(card.tripDayId === tripDayId ? [] : sourceCards.map((item, position) => ({ ...item, position }))),
  ];

  // D1 batches commit or roll back as a unit, so a failed move cannot leave the
  // card in one day while the rest of the ordering has already changed.
  const [moved] = await db.batch([
    db.update(cards).set({
      tripDayId,
      position: reordered.findIndex((item) => item.id === card.id),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(and(eq(cards.id, card.id), eq(cards.tripId, tripId), inDay(card.tripDayId)))
      .returning({ id: cards.id }),
    // Remove just this card's label, preserving all other saved times and the
    // start time. JSON is edited in SQL so a concurrent refresh isn't overwritten
    // with an older snapshot. changes() refers to the card update immediately above.
    db.update(tripDays).set({ timeEstimate: sql`json_set(${tripDays.timeEstimate}, '$.labels', json((
      SELECT json_group_array(json(value)) FROM json_each(${tripDays.timeEstimate}, '$.labels')
      WHERE json_extract(value, '$.afterCardId') != ${card.id}
    )))` }).where(and(eq(tripDays.tripId, tripId), sql`${tripDays.timeEstimate} IS NOT NULL`, sql`changes() > 0`)),
    ...otherPositions.map((item) => db.update(cards).set({ position: item.position })
      .where(and(eq(cards.id, item.id), eq(cards.tripId, tripId), inDay(item.tripDayId)))),
  ]);
  if (!moved.length) return fail("That card has moved. Please try again.", 409);
  return { ok: true as const, error: null };
}
