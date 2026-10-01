import { resolveTripId } from "../trip-url.server";
import { chatStreamResponse } from "../chat-stream.server";
import type { ChatProgress, ChatToolCall } from "../chat-stream";
import { env } from "cloudflare:workers";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { data } from "react-router";
import type { Route } from "./+types/trip-chat";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { tripChats, cards, tripDays, rateLimit } from "../db/schema";
import { MAX_CHAT_MESSAGES, MAX_CHAT_MESSAGE_LENGTH, type ChatMessage } from "../card-chat";
import { CardChatError } from "../card-chat.server";
import { generateTripChatReply, loadTripChatContext } from "../trip-chat.server";
import { type TripChatData, type TripChatMessage } from "../trip-chat";
import { readCardDetails } from "../card-types";
import { readCardLocation } from "../card-location";
import { photoForCardLocation } from "../place-photo.server";
import { UNSCHEDULED_COLUMN_ID } from "../card-order";

const headers = { "Cache-Control": "private, no-store" };
const reply = (body: TripChatData, status = 200) => data(body, { status, headers });
const apiKey = () => (env as typeof env & { OPENAI_API_KEY?: string }).OPENAI_API_KEY?.trim() ?? "";

async function authorize(request: Request, tripId: string) {
  const db = getDb(env.DB);
  tripId = await resolveTripId(db, tripId);
  const user = await requireTripOwner(request, db, tripId);
  return { tripId, db, userId: user.id, scope: and(eq(tripChats.tripId, tripId), eq(tripChats.userId, user.id)) };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, scope } = await authorize(request, params.tripId);
  try {
    const thread = await db.select().from(tripChats).where(scope).get();
    return reply({ messages: thread?.messages ?? [], available: Boolean(apiKey()) });
  } catch {
    return reply({ error: "Could not load this chat. Please try again." }, 500);
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  // Paid, cookie-authenticated calls must originate from this application.
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "Please send your message from this app." }, 403);
  const { tripId, db, userId, scope } = await authorize(request, params.tripId);
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
  if (intent !== "clear" && intent !== "send" && intent !== "add") return reply({ error: "Unknown chat action." }, 400);
  if (intent === "send" && (!message || message.length > MAX_CHAT_MESSAGE_LENGTH)) return reply({ error: `Enter a message of up to ${MAX_CHAT_MESSAGE_LENGTH} characters.` }, 400);
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
      const detailsForm = new FormData();
      for (const field of ["type", "title", "description", "locationCategory", "transportMode", "startLocation", "endLocation"] as const) detailsForm.set(field, suggestion[field]);
      const details = readCardDetails(detailsForm);
      if (!details.ok) return reply({ error: details.error }, 400);
      const location = readCardLocation(suggestion.type === "location" || suggestion.type === "hike" ? form : new FormData());
      if (!location.ok) return reply({ error: location.error }, 400);
      const cardId = suggestion.id;
      const messages = thread.messages.map((message) => ({ ...message, suggestions: message.suggestions?.map((item) => item.id === suggestion.id ? { ...item, addedCardId: cardId } : item) }));
      const d = details.details;
      const googlePhoto = await photoForCardLocation(d.type, location.location.googlePlaceId, undefined, env.GOOGLE_MAPS_API_KEY, request.signal);
      // Both statements run in one D1 transaction. Fence writes by lock token;
      // deterministic IDs plus saved proposal status make retries idempotent.
      const [, saved] = await db.batch([
        db.insert(cards).values({
          ...d, ...location.location, googlePhoto, id: cardId, tripDayId,
          // trip_id is NOT NULL: losing the lock aborts the entire batch.
          tripId: sql`(SELECT trip_id FROM trip_chats WHERE trip_id = ${tripId} AND user_id = ${userId} AND lock_id = ${lockId})`,
          position: sql`(SELECT COALESCE(MAX(position) + 1, 0) FROM cards WHERE trip_id = ${tripId} AND ${tripDayId === null ? isNull(cards.tripDayId) : eq(cards.tripDayId, tripDayId)})`,
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
      const toolCalls = new Map<string, ChatToolCall>();
      const onEvent = emit ? (event: ChatProgress) => {
        if (event.type === "tool") toolCalls.set(event.tool.id, event.tool);
        emit(event);
      } : undefined;
      const context = await loadTripChatContext(db, tripId);
      const question: ChatMessage = { id: crypto.randomUUID(), role: "user", text: message, citations: [], createdAt: new Date().toISOString() };
      onEvent?.({ type: "status", text: "Sol is preparing a reply…" });
      const answer = await generateTripChatReply({ apiKey: key, context, messages: [...thread.messages, question], signal, onEvent });
      const messages: TripChatMessage[] = [...thread.messages, question, { ...answer, ...(toolCalls.size ? { toolCalls: [...toolCalls.values()] } : {}), id: crypto.randomUUID(), role: "assistant", createdAt: new Date().toISOString() }];
      const saved = await db.update(tripChats).set({ messages }).where(and(scope, eq(tripChats.lockId, lockId))).returning({ tripId: tripChats.tripId });
      if (!saved.length) throw new CardChatError("This chat changed while the answer was being prepared. Reload the chat to continue.", 409);
      return { messages, available: true, completed: lockId };
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
