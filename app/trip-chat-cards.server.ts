import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "./db.server";
import { cards, tripChats, tripDays } from "./db/schema";
import { readCardDetails } from "./card-types";
import { readCardLocation, type CardLocation } from "./card-location";
import { nextCardRank } from "./card-rank.server";
import { CardChatError } from "./card-chat.server";
import { readTripSuggestion, type TripCardSuggestion, type TripChatMessage } from "./trip-chat";

export const MAX_ADDED_CHAT_CARDS = 40;
export type PendingChatCard = {
  suggestion: TripCardSuggestion;
  details: Extract<ReturnType<typeof readCardDetails>, { ok: true }>["details"];
  location: CardLocation;
};

/** Validate the whole batch before looking up places or preparing any writes. */
export async function prepareChatCards(suggestions: TripCardSuggestion[], lookup?: (query: string) => Promise<CardLocation | null>) {
  if (!suggestions.length || suggestions.length > MAX_ADDED_CHAT_CARDS) throw new CardChatError("Add between 1 and 40 cards at a time.", 400);
  const pending: PendingChatCard[] = suggestions.map((suggestion) => {
    const value = readTripSuggestion(suggestion);
    if (!value) throw new CardChatError("A card was incomplete. No cards were added.", 400);
    const form = new FormData();
    for (const [key, field] of Object.entries(value)) if (typeof field === "string") form.set(key, field);
    const details = readCardDetails(form);
    if (!details.ok) throw new CardChatError(details.error, 400);
    return {
      suggestion: { ...value, title: details.details.title, id: crypto.randomUUID() },
      details: details.details,
      location: { googlePlaceId: null, googleMapsQuery: null, googlePlaceName: null },
    };
  });
  const places = new Map<string, Promise<CardLocation | null>>();
  const queue = [...pending];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    let card;
    while ((card = queue.shift())) {
      if (!lookup || !["location", "hike"].includes(card.suggestion.type) || !card.suggestion.locationQuery) continue;
      const query = card.suggestion.locationQuery;
      if (!places.has(query)) places.set(query, lookup(query).catch(() => null));
      const place = await places.get(query);
      if (!place) continue;
      const form = new FormData();
      form.set("googlePlaceId", place.googlePlaceId ?? "");
      form.set("googleMapsQuery", place.googleMapsQuery ?? "");
      form.set("googlePlaceName", place.googlePlaceName ?? "");
      const location = readCardLocation(form);
      if (location.ok) card.location = location.location;
    }
  }));
  return pending;
}

/** Commit cards, any new dated columns, and the reply together, or save nothing. */
export async function savePlanningChatReply(db: Database, { tripId, userId, lockId, messages, pending, signal }: {
  tripId: string; userId: string; lockId: string; messages: TripChatMessage[]; pending: PendingChatCard[]; signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new CardChatError("The reply was interrupted. No cards were added.", 499);
  if (pending.length > MAX_ADDED_CHAT_CARDS) throw new CardChatError("Add up to 40 cards at a time.", 400);
  const now = Date.now();
  // trip_id is NOT NULL. A lost/expired lock or revoked ownership aborts the
  // entire transaction, including cards and new days, before a success is shown.
  const authorizedTrip = sql<string>`(SELECT tc.trip_id FROM trip_chats tc
    INNER JOIN trip_owners owner ON owner.trip_id = tc.trip_id AND owner.user_id = tc.user_id
    WHERE tc.trip_id = ${tripId} AND tc.user_id = ${userId} AND tc.lock_id = ${lockId} AND tc.locked_until > ${now})`;
  const dates = [...new Set(pending.flatMap((card) => card.suggestion.date ? [card.suggestion.date] : []))];
  const statements = [
    ...dates.map((date) => db.insert(tripDays).values({ id: crypto.randomUUID(), tripId: authorizedTrip, tripDate: date })
      .onConflictDoNothing({ target: [tripDays.tripId, tripDays.tripDate] })),
    ...pending.map(({ suggestion, details, location }) => {
      const dayId = suggestion.date === null ? null : sql<string>`(SELECT id FROM trip_days WHERE trip_id = ${tripId} AND trip_date = ${suggestion.date})`;
      return db.insert(cards).values({
        ...details, ...location, id: suggestion.id, tripId: authorizedTrip, tripDayId: dayId,
        position: nextCardRank(tripId, dayId),
      });
    }),
    db.update(tripChats).set({ messages }).where(and(
      eq(tripChats.tripId, tripId), eq(tripChats.userId, userId), eq(tripChats.lockId, lockId),
      gt(tripChats.lockedUntil, now), eq(tripChats.tripId, authorizedTrip),
    )).returning({ tripId: tripChats.tripId }),
  ];
  const result = await db.batch(statements as [typeof statements[number], ...typeof statements[number][]]);
  const saved = result.at(-1);
  if (!Array.isArray(saved) || !saved.length) throw new CardChatError("This chat changed while the answer was being prepared. Reload the chat to continue.", 409);
}
