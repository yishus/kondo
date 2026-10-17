import { accessibleTripCondition } from "../trip-access.server";
import { chatStreamResponse } from "../chat-stream.server";
import type { ChatProgress, ChatToolCall } from "../chat-stream";
import { env } from "cloudflare:workers";
import { and, eq, lte, sql } from "drizzle-orm";
import { data } from "react-router";
import type { Route } from "./+types/card-chat";
import { requireUser } from "../auth.server";
import { getDb } from "../db.server";
import { cardChats, cards, rateLimit } from "../db/schema";
import { MAX_CHAT_MESSAGES, MAX_CHAT_MESSAGE_LENGTH, type CardChatData, type ChatMessage } from "../card-chat";
import { CardChatError, generateCardChatReply, loadCardChatContext } from "../card-chat.server";

const headers = { "Cache-Control": "private, no-store" };
const reply = (body: CardChatData, status = 200) => data(body, { status, headers });
const apiKey = () => (env as typeof env & { OPENAI_API_KEY?: string }).OPENAI_API_KEY?.trim() ?? "";

async function authorize(request: Request, tripId: string, cardId: string) {
  const db = getDb(env.DB);
  const user = await requireUser(request);
  const card = await db.select({ id: cards.id, tripId: cards.tripId }).from(cards)
    .where(and(eq(cards.id, cardId), accessibleTripCondition(db, tripId, user.id, cards.tripId))).get();
  if (!card) throw new Response("Card not found", { status: 404 });
  return { tripId: card.tripId, db, userId: user.id, scope: and(eq(cardChats.cardId, cardId), eq(cardChats.userId, user.id)) };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { db, scope } = await authorize(request, params.tripId, params.cardId);
  try {
    const thread = await db.select().from(cardChats).where(scope).get();
    return reply({ messages: thread?.messages ?? [], available: Boolean(apiKey()) });
  } catch {
    return reply({ error: "Could not load this chat. Please try again." }, 500);
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  // Paid, cookie-authenticated calls must originate from this application.
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "Please send your message from this app." }, 403);
  const { tripId, db, userId, scope } = await authorize(request, params.tripId, params.cardId);
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
  if (intent !== "clear" && intent !== "send") return reply({ error: "Unknown chat action." }, 400);
  if (intent === "send" && (!message || message.length > MAX_CHAT_MESSAGE_LENGTH)) return reply({ error: `Enter a message of up to ${MAX_CHAT_MESSAGE_LENGTH} characters.` }, 400);
  const key = apiKey();
  if (intent === "send" && !key) return reply({ available: false, error: "Chat is not configured yet. Add OPENAI_API_KEY to the server to enable it." }, 503);
  const lockId = crypto.randomUUID();
  const now = Date.now();
  let locked = false;
  try {
    const [thread] = await db.insert(cardChats).values({ cardId: params.cardId, userId, lockId, lockedUntil: now + 120_000 })
      .onConflictDoUpdate({ target: [cardChats.cardId, cardChats.userId], set: { lockId, lockedUntil: now + 120_000 }, setWhere: lte(cardChats.lockedUntil, now) }).returning();
    if (!thread) return reply({ error: "A reply is already being prepared for this card. Please wait, then reload the chat." }, 409);
    locked = true;
    if (intent === "clear") {
      await db.update(cardChats).set({ messages: [] }).where(and(scope, eq(cardChats.lockId, lockId)));
      return reply({ messages: [], available: Boolean(key), completed: lockId });
    }
    if (thread.messages.length >= MAX_CHAT_MESSAGES) return reply({ error: "This conversation is full. Start a new chat to continue." }, 400);
    // One persistent limit across all of this user's cards, including concurrent tabs.
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
      const context = await loadCardChatContext(db, env.ATTACHMENTS, tripId, params.cardId);
      const question: ChatMessage = { id: crypto.randomUUID(), role: "user", text: message, citations: [], createdAt: new Date().toISOString() };
      onEvent?.({ type: "status", text: "Sol is preparing a reply…" });
      const answer = await generateCardChatReply({ apiKey: key, context, messages: [...thread.messages, question], signal, onEvent });
      const messages: ChatMessage[] = [...thread.messages, question, { ...answer, ...(toolCalls.size ? { toolCalls: [...toolCalls.values()] } : {}), id: crypto.randomUUID(), role: "assistant", createdAt: new Date().toISOString() }];
      const saved = await db.update(cardChats).set({ messages }).where(and(scope, eq(cardChats.lockId, lockId))).returning({ cardId: cardChats.cardId });
      if (!saved.length) throw new CardChatError("This chat changed while the answer was being prepared. Reload the chat to continue.", 409);
      return { messages, available: true, completed: lockId };
    };
    if (request.headers.get("Accept")?.includes("text/event-stream")) {
      locked = false; // The response now owns releasing the lock, including errors/cancellation.
      return chatStreamResponse(request, run, () => db.update(cardChats).set({ lockId: null, lockedUntil: 0 }).where(and(scope, eq(cardChats.lockId, lockId))));
    }
    return reply(await run());
  } catch (error) {
    if (error instanceof Response) throw error;
    return reply({ error: error instanceof CardChatError ? error.message : "Could not save this reply. Please reload the chat and try again." }, error instanceof CardChatError ? error.status : 500);
  } finally {
    if (locked) await db.update(cardChats).set({ lockId: null, lockedUntil: 0 }).where(and(scope, eq(cardChats.lockId, lockId))).catch(() => {});
  }
}
