import { CardChatError } from "./card-chat.server";
import type { TripChatData } from "./trip-chat";
import type { ChatProgress, ChatStreamEvent } from "./chat-stream";

/** The stream owns the chat lock until generation and persistence have finished. */
export function chatStreamResponse(request: Request, run: (emit: (event: ChatProgress) => void, signal: AbortSignal) => Promise<TripChatData>, release: () => Promise<unknown>) {
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) abort.abort();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        if (!cancelled) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        emit({ type: "status", text: "Reading saved details…" });
        const data = await run(emit, abort.signal);
        // A completed event always means the reply was saved and the lock released.
        await release();
        emit({ type: "done", data });
      } catch (error) {
        await release().catch(() => {});
        emit({ type: "error", error: error instanceof CardChatError ? error.message : "Could not save this reply. Please reload the chat and try again." });
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; abort.abort(); },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no" } });
}
