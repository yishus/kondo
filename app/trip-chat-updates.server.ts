import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "./db.server";
import { cards, tripChats, type Card } from "./db/schema";
import { readCardDetails } from "./card-types";
import { CardChatError } from "./card-chat.server";
import { cardUpdateChanges, cardUpdateFields, type CardUpdateField, type CardUpdateRequest, type TripCardUpdate, type TripChatMessage } from "./trip-chat";

const fields = Object.keys(cardUpdateFields) as CardUpdateField[];

export function prepareCardUpdate(card: Card, request: CardUpdateRequest): TripCardUpdate {
  const form = new FormData();
  for (const [field, value] of Object.entries(request.changes)) {
    if (field === "locationCategory" && card.type !== "location"
      || !["title", "description", "locationCategory"].includes(field) && card.type !== "transport") {
      throw new CardChatError(`Cannot change ${cardUpdateFields[field as CardUpdateField]} on this card.`, 400);
    }
    form.set(field, value);
  }
  const result = readCardDetails(form, card);
  if (!result.ok) throw new CardChatError(result.error, 400);
  if (request.changes.title !== undefined && result.details.title !== request.changes.title
    || request.changes.description !== undefined && result.details.description !== request.changes.description) {
    throw new CardChatError("Transport titles follow their endpoints, and city descriptions must stay empty.", 400);
  }
  const before = Object.fromEntries(fields.map((field) => [field, card[field] ?? ""])) as TripCardUpdate["before"];
  const after = Object.fromEntries(fields.map((field) => [field, result.details[field] ?? ""])) as TripCardUpdate["after"];
  const update: TripCardUpdate = {
    id: crypto.randomUUID(), cardId: card.id, cardTitle: card.title, cardType: card.type, tripDayId: card.tripDayId,
    before, after, status: "pending",
  };
  if (!cardUpdateChanges(update).length) throw new CardChatError("Those values are already saved on the card.", 400);
  return update;
}

/** Reads and validates only; proposals never write to cards. */
export async function prepareCardUpdates(db: Database, tripId: string, requests: CardUpdateRequest[]) {
  const updates: TripCardUpdate[] = [];
  for (const request of requests) {
    const card = await db.select().from(cards).where(and(eq(cards.id, request.cardId), eq(cards.tripId, tripId))).get();
    if (!card) throw new CardChatError("That card no longer exists in this trip.", 404);
    updates.push(prepareCardUpdate(card, request));
  }
  return updates;
}

/** This function is called only by the explicit Approve changes action. */
export async function approveCardUpdate(db: Database, { tripId, userId, lockId, messages, messageId, updateId }: {
  tripId: string; userId: string; lockId: string; messages: TripChatMessage[]; messageId: string; updateId: string;
}) {
  const proposal = messages.find((message) => message.id === messageId && message.role === "assistant")?.updates?.find((update) => update.id === updateId);
  if (!proposal) throw new CardChatError("That proposed update is no longer available. Reload the chat.", 404);
  if (proposal.status === "applied") return messages;
  if (proposal.status !== "pending") throw new CardChatError("That proposed update was declined. Ask chat for a new proposal.", 409);
  const patch = Object.fromEntries(cardUpdateChanges(proposal).map(({ field, after }) => [field, after || (
    ["locationCategory", "transportMode", "departureTimezone", "arrivalTimezone"].includes(field) ? null : ""
  )]));
  const invalidatesRoute = cardUpdateChanges(proposal).some(({ field }) => [
    "transportMode", "startLocation", "endLocation", "departureTime", "arrivalTime", "departureTimezone", "arrivalTimezone",
  ].includes(field));
  const next = messages.map((message) => message.id !== messageId ? message : {
    ...message, updates: message.updates?.map((update) => update.id === updateId ? { ...update, status: "applied" as const } : update),
  });
  const scope = and(eq(tripChats.tripId, tripId), eq(tripChats.userId, userId), eq(tripChats.lockId, lockId), gt(tripChats.lockedUntil, Date.now()));
  // Recheck ownership, the chat lock, and the exact values that were reviewed.
  // Both statements commit together; stale cards update neither the card nor the proposal.
  const [saved] = await db.batch([
    db.update(cards).set({
      ...patch, ...(invalidatesRoute ? { transportEstimate: null } : {}), updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(and(
      eq(cards.id, proposal.cardId), eq(cards.tripId, tripId), eq(cards.type, proposal.cardType),
      proposal.tripDayId === null ? isNull(cards.tripDayId) : eq(cards.tripDayId, proposal.tripDayId),
      ...fields.map((field) => sql`coalesce(${cards[field]}, '') = ${proposal.before[field]}`),
      sql`EXISTS (SELECT 1 FROM ${tripChats} INNER JOIN trip_owners owner
        ON owner.trip_id = ${tripChats.tripId} AND owner.user_id = ${tripChats.userId} WHERE ${scope})`,
    )).returning({ id: cards.id }),
    db.update(tripChats).set({ messages: next }).where(and(scope, sql`changes() > 0`)),
  ]);
  if (!saved.length) throw new CardChatError("This card changed since the proposal. Ask chat for an updated proposal before approving.", 409);
  return next;
}
