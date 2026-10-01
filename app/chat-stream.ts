import type { TripChatData } from "./trip-chat";

export type ChatToolCall = { id: string; name: string; status: "running" | "completed"; detail?: string };
export type ChatProgress =
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "tool"; tool: ChatToolCall };
export type ChatStreamEvent = ChatProgress | { type: "done"; data: TripChatData } | { type: "error"; error: string };

/** SSE framing is independent of network chunks, including split UTF-8 and CRLF. */
export async function* readEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lines: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
        if (!line && lines.length) {
          const data = lines.join("\n");
          lines = [];
          if (data !== "[DONE]") yield JSON.parse(data);
        }
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
