import { resolveTripId } from "./trip-url.server";
import { chatStreamResponse } from "./chat-stream.server";
import type { ChatProgress, ChatToolCall } from "./chat-stream";
import { env } from "cloudflare:workers";
import { and, eq, lte, sql } from "drizzle-orm";
import { data } from "react-router";
import { requireTripOwner } from "./auth.server";
import { getDb } from "./db.server";
import { tripChats as planningTripChats, tripLiveChats, cards, tripDays, rateLimit } from "./db/schema";
import { MAX_CHAT_MESSAGES, MAX_CHAT_MESSAGE_LENGTH, type ChatMessage } from "./card-chat";
import { CardChatError } from "./card-chat.server";
import { generateTripChatReply, loadTripChatContext } from "./trip-chat.server";
import { type TripChatData, type TripChatMessage } from "./trip-chat";
import { readCardLocation } from "./card-location";
import { photoForCardLocation } from "./place-photo.server";
import { UNSCHEDULED_COLUMN_ID } from "./card-order";
import { nextCardRank } from "./card-rank.server";
import { generateLiveChatReply, loadLiveChatContext } from "./trip-live.server";
import { readTimezone } from "./timezones";
import { MAX_ADDED_CHAT_CARDS, prepareChatCards, readSuggestedCardDetails, savePlanningChatReply, type PendingChatCard } from "./trip-chat-cards.server";
import { searchPlaces } from "./place-search.server";
import { approveCardUpdate, prepareCardUpdates } from "./trip-chat-updates.server";

type ChatRouteArgs = { request: Request; params: { tripId: string } };

const headers = { "Cache-Control": "private, no-store" };
const reply = (body: TripChatData, status = 200) => data(body, { status, headers });
const apiKey = () => (env as typeof env & { OPENAI_API_KEY?: string }).OPENAI_API_KEY?.trim() ?? "";

async function authorize(request: Request, tripId: string, live: boolean) {
  const tripChats = live ? tripLiveChats : planningTripChats;
  const db = getDb(env.DB);
  tripId = await resolveTripId(db, tripId);
  const user = await requireTripOwner(request, db, tripId);
  return { tripChats, tripId, db, userId: user.id, scope: and(eq(tripChats.tripId, tripId), eq(tripChats.userId, user.id)) };
}

export async function loadChat({ request, params }: ChatRouteArgs, live = false) {
  const { db, scope, tripChats } = await authorize(request, params.tripId, live);
  try {
    const thread = await db.select().from(tripChats).where(scope).get();
    return reply({ messages: thread?.messages ?? [], available: Boolean(apiKey()) });
  } catch {
    return reply({ error: "Could not load this chat. Please try again." }, 500);
  }
}

export async function sendChat({ request, params }: ChatRouteArgs, live = false) {
  const googleMapsApiKey = (env as typeof env & { GOOGLE_MAPS_API_KEY?: string }).GOOGLE_MAPS_API_KEY;
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  // Paid, cookie-authenticated calls must originate from this application.
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "Please send your message from this app." }, 403);
  const { tripId, db, userId, scope, tripChats } = await authorize(request, params.tripId, live);
  if (Number(request.headers.get("Content-Length")) > 64_000) return reply({ error: "That message is too long." }, 413);
  let form: FormData;
  try {
    // Bound the actual body as well, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Enter a message." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64_000) { await reader.cancel(); return reply({ error: "That message is too long." }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData();
  } catch { return reply({ error: "Could not read that message." }, 400); }
  const intent = form.get("intent");
  const value = form.get("message");
  const message = typeof value === "string" ? value.trim() : "";
  if (intent !== "clear" && intent !== "send" && intent !== "add" && intent !== "approve-update" && intent !== "reject-update") return reply({ error: "Unknown chat action." }, 400);
  if (intent === "send" && (!message || message.length > MAX_CHAT_MESSAGE_LENGTH)) return reply({ error: `Enter a message of up to ${MAX_CHAT_MESSAGE_LENGTH} characters.` }, 400);
  if (live && (intent === "add" || intent === "approve-update" || intent === "reject-update")) return reply({ error: "Cards are read-only while on the trip." }, 400);
  const timezone = readTimezone(form.get("timezone"));
  if (live && !timezone.ok) return reply({ error: timezone.error }, 400);
  const key = apiKey();
  if (intent === "send" && !key) return reply({ available: false, error: "Chat is not configured yet. Add OPENAI_API_KEY to the server to enable it." }, 503);
  const lockId = crypto.randomUUID();
  const now = Date.now();
  let locked = false;
  try {
    const [thread] = await db.insert(tripChats).values({ tripId: tripId, userId, lockId, lockedUntil: now + 120_000 })
      .onConflictDoUpdate({ target: [tripChats.tripId, tripChats.userId], set: { lockId, lockedUntil: now + 120_000 }, setWhere: lte(tripChats.lockedUntil, now) }).returning();
    if (!thread) return reply({ error: "A reply is already being prepared for this trip. Please wait, then reload the chat." }, 409);
    locked = true;
    if (intent === "clear") {
      await db.update(tripChats).set({ messages: [] }).where(and(scope, eq(tripChats.lockId, lockId)));
      return reply({ messages: [], available: Boolean(key), completed: lockId });
    }
    if (intent === "approve-update" || intent === "reject-update") {
      const messageId = form.get("messageId");
      const updateId = form.get("updateId");
      if (typeof messageId !== "string" || typeof updateId !== "string") return reply({ error: "Choose a proposed card update." }, 400);
      if (intent === "approve-update") {
        const messages = await approveCardUpdate(db, { tripId, userId, lockId, messages: thread.messages, messageId, updateId });
        return reply({ messages, available: Boolean(key), tripChanged: true });
      }
      const proposal = thread.messages.find((message) => message.id === messageId && message.role === "assistant")?.updates?.find((update) => update.id === updateId);
      if (!proposal) return reply({ error: "That proposed update is no longer available. Reload the chat." }, 404);
      if (proposal.status !== "pending") return reply({ messages: thread.messages, available: Boolean(key) });
      const messages = thread.messages.map((message) => message.id !== messageId ? message : {
        ...message, updates: message.updates?.map((update) => update.id === updateId ? { ...update, status: "rejected" as const } : update),
      });
      const saved = await db.update(tripChats).set({ messages }).where(and(scope, eq(tripChats.lockId, lockId))).returning({ tripId: tripChats.tripId });
      if (!saved.length) throw new CardChatError("This chat changed. Reload the chat before trying again.", 409);
      return reply({ messages, available: Boolean(key) });
    }
    if (intent === "add") {
      const messageId = form.get("messageId");
      const suggestionId = form.get("suggestionId");
      const suggestion = thread.messages.find((item) => item.id === messageId && item.role === "assistant")?.suggestions?.find((item) => item.id === suggestionId);
      if (!suggestion) return reply({ error: "That suggestion is no longer available. Reload the chat." }, 404);
      if (suggestion.addedCardId) return reply({ messages: thread.messages, available: Boolean(key), tripChanged: true });
      const columnId = form.get("tripDayId");
      if (typeof columnId !== "string" || !columnId) return reply({ error: "Choose a day or Unscheduled." }, 400);
      const tripDayId = columnId === UNSCHEDULED_COLUMN_ID ? null : columnId;
      if (tripDayId && !await db.select({ id: tripDays.id }).from(tripDays).where(and(eq(tripDays.id, tripDayId), eq(tripDays.tripId, tripId))).get()) {
        return reply({ error: "That day no longer exists. Choose another day or Unscheduled." }, 400);
      }
      const details = readSuggestedCardDetails(suggestion);
      if (!details.ok) return reply({ error: details.error }, 400);
      const location = readCardLocation(suggestion.type === "location" || suggestion.type === "hike" ? form : new FormData());
      if (!location.ok) return reply({ error: location.error }, 400);
      const cardId = suggestion.id;
      const messages = thread.messages.map((message) => ({ ...message, suggestions: message.suggestions?.map((item) => item.id === suggestion.id ? { ...item, addedCardId: cardId } : item) }));
      const d = details.details;
      const googlePhoto = await photoForCardLocation(d.type, location.location.googlePlaceId, undefined, googleMapsApiKey, request.signal);
      // Both statements run in one D1 transaction. Fence writes by lock token;
      // deterministic IDs plus saved proposal status make retries idempotent.
      const [, saved] = await db.batch([
        db.insert(cards).values({
          ...d, ...location.location, googlePhoto, id: cardId, tripDayId,
          // trip_id is NOT NULL: losing the lock aborts the entire batch.
          tripId: sql`(SELECT trip_id FROM trip_chats WHERE trip_id = ${tripId} AND user_id = ${userId} AND lock_id = ${lockId})`,
          position: nextCardRank(tripId, tripDayId),
        }),
        db.update(tripChats).set({ messages }).where(and(scope, eq(tripChats.lockId, lockId))).returning({ tripId: tripChats.tripId }),
      ]);
      if (!saved.length) return reply({ error: "This chat changed. Reload it before adding the card." }, 409);
      return reply({ messages, available: Boolean(key), tripChanged: true });
    }
    if (thread.messages.length >= MAX_CHAT_MESSAGES) return reply({ error: "This conversation is full. Start a new chat to continue." }, 400);
    // One persistent limit across all of this user's card and trip chats, including concurrent tabs.
    const windowStart = Math.floor(now / 60_000) * 60;
    const limitKey = `card-chat:${userId}`;
    const [usage] = await db.insert(rateLimit).values({ id: limitKey, key: limitKey, count: 1, lastRequest: windowStart })
      .onConflictDoUpdate({ target: rateLimit.key, set: {
        count: sql`CASE WHEN ${rateLimit.lastRequest} = ${windowStart} THEN ${rateLimit.count} + 1 ELSE 1 END`,
        lastRequest: windowStart,
      } }).returning();
    if (usage.count > 10) return reply({ error: "You've sent several messages quickly. Please wait a minute before trying again." }, 429);
    const run = async (emit?: (event: ChatProgress) => void, signal = request.signal) => {
      signal = AbortSignal.any([signal, AbortSignal.timeout(100_000)]);
      const pending: PendingChatCard[] = [];
      const toolCalls = new Map<string, ChatToolCall>();
      const onEvent = emit ? (event: ChatProgress) => {
        if (event.type === "tool") toolCalls.set(event.tool.id, event.tool);
        emit(event);
      } : undefined;
      const context = live
        ? await loadLiveChatContext(db, tripId, timezone.ok ? timezone.timezone : null)
        : await loadTripChatContext(db, tripId);
      const question: ChatMessage = { id: crypto.randomUUID(), role: "user", text: message, citations: [], createdAt: new Date().toISOString() };
      onEvent?.({ type: "status", text: "Sol is preparing a reply…" });
      const options = { apiKey: key, context, messages: [...thread.messages, question], signal, onEvent };
      const answer = live ? await generateLiveChatReply(options) : await generateTripChatReply({
        ...options,
        addCards: async (suggestions) => {
          if (pending.length + suggestions.length > MAX_ADDED_CHAT_CARDS) throw new CardChatError("Add up to 40 cards per request. No cards were added.", 400);
          const prepared = await prepareChatCards(suggestions, async (query) => {
            const { body } = await searchPlaces(query, googleMapsApiKey, signal);
            const place = body.places[0];
            return place ? { googlePlaceId: place.id, googlePlaceName: place.name, googleMapsQuery: query } : null;
          });
          pending.push(...prepared);
          return {
            cards: prepared.map(({ suggestion }) => ({ ...suggestion, addedCardId: suggestion.id })),
            missingMapPins: prepared.filter((card) => ["location", "hike"].includes(card.suggestion.type) && !card.location.googlePlaceId).map((card) => card.suggestion.title),
          };
        },
        proposeUpdates: (updates) => prepareCardUpdates(db, tripId, updates),
      });
      const completedTools = [...toolCalls.values()].map((tool) => tool.name === "Add itinerary cards" ? { ...tool, status: "completed" as const, detail: `${pending.length} cards added to trip` } : tool);
      const messages: TripChatMessage[] = [...thread.messages, question, { ...answer, ...(completedTools.length ? { toolCalls: completedTools } : {}), id: crypto.randomUUID(), role: "assistant", createdAt: new Date().toISOString() }];
      if (live) {
        const saved = await db.update(tripChats).set({ messages }).where(and(scope, eq(tripChats.lockId, lockId))).returning({ tripId: tripChats.tripId });
        if (!saved.length) throw new CardChatError("This chat changed while the answer was being prepared. Reload the chat to continue.", 409);
      } else {
        await savePlanningChatReply(db, { tripId, userId, lockId, messages, pending, signal });
        for (const tool of completedTools) if (tool.name === "Add itinerary cards") emit?.({ type: "tool", tool });
      }
      return { messages, available: true, completed: lockId, tripChanged: pending.length > 0 };
    };
    if (request.headers.get("Accept")?.includes("text/event-stream")) {
      locked = false; // The response now owns releasing the lock, including errors/cancellation.
      return chatStreamResponse(request, run, () => db.update(tripChats).set({ lockId: null, lockedUntil: 0 }).where(and(scope, eq(tripChats.lockId, lockId))));
    }
    return reply(await run());
  } catch (error) {
    if (error instanceof Response) throw error;
    return reply({ error: error instanceof CardChatError ? error.message : "Could not save this reply. Please reload the chat and try again." }, error instanceof CardChatError ? error.status : 500);
  } finally {
    if (locked) await db.update(tripChats).set({ lockId: null, lockedUntil: 0 }).where(and(scope, eq(tripChats.lockId, lockId))).catch(() => {});
  }
}
