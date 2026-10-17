import { MarkdownContent } from "./markdown-content";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeChatUrl } from "../card-chat";
import { readEventStream, type ChatStreamEvent, type ChatToolCall } from "../chat-stream";
import type { TripChatData } from "../trip-chat";

export function useChatStream(endpoint: string) {
  const [progress, setProgress] = useState({ question: "", text: "", status: "", tools: [] as ChatToolCall[] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [endpoint]);

  function reset() {
    setError(undefined);
    setProgress({ question: "", text: "", status: "", tools: [] });
  }

  async function send(question: string, fields: Record<string, string> = {}): Promise<TripChatData | undefined> {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setError(undefined);
    setBusy(true);
    setProgress({ question, text: "", status: "Sol is preparing a reply…", tools: [] });
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { Accept: "text/event-stream" }, body: new URLSearchParams({ ...fields, intent: "send", message: question }), signal: request.signal });
      if (!response.ok || !response.headers.get("Content-Type")?.includes("text/event-stream")) {
        const data = response.headers.get("Content-Type")?.includes("application/json") ? await response.json() as TripChatData : null;
        throw new Error(data?.error ?? "Could not load the reply. Please reload the chat and try again.");
      }
      if (!response.body) throw new Error("The reply was interrupted. Please try again.");
      for await (const raw of readEventStream(response.body)) {
        if (request.signal.aborted) return;
        const event = raw as ChatStreamEvent;
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "done") {
          if (!event.data.messages || !event.data.completed) throw new Error("The reply could not be saved. Please reload the chat.");
          reset();
          return event.data;
        }
        setProgress((previous) => {
          if (event.type === "text") return { ...previous, text: previous.text + event.delta, status: "Writing reply…" };
          if (event.type === "status") return { ...previous, status: event.text };
          if (event.type === "tool") return { ...previous, tools: previous.tools.some((tool) => tool.id === event.tool.id) ? previous.tools.map((tool) => tool.id === event.tool.id ? event.tool : tool) : [...previous.tools, event.tool] };
          return previous;
        });
      }
      throw new Error("The reply was interrupted. Please try again.");
    } catch (error) {
      if (!request.signal.aborted) setError(error instanceof Error ? error.message : "Could not reach the chat service. Please try again.");
    } finally {
      if (controller.current === request) { controller.current = null; setBusy(false); }
    }
  }
  return { ...progress, busy, error, send, reset };
}

function AsciiSpinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(timer);
      if (!reducedMotion.matches) timer = setInterval(() => setFrame((value) => (value + 1) % 4), 160);
    };
    update();
    reducedMotion.addEventListener("change", update);
    return () => { clearInterval(timer); reducedMotion.removeEventListener("change", update); };
  }, []);
  return <span className="inline-block w-8 shrink-0 font-mono" aria-hidden="true">[{["|", "/", "-", "\\"][frame]}]</span>;
}

export function ChatToolActivity({ tools, interrupted = false }: { tools?: ChatToolCall[]; interrupted?: boolean }) {
  if (!tools?.length) return null;
  return <ul className="mb-3 grid gap-2 text-xs text-muted-foreground" aria-label="Tool activity">
    {tools.map((tool) => <li key={tool.id} className="min-w-0 wrap-break-word">
      <span className="font-mono" aria-hidden="true">{tool.status === "completed" ? "[x]" : interrupted ? "[!]" : "[>]"}</span>{" "}
      {tool.name} · {tool.status === "completed" ? "Done" : interrupted ? "Interrupted" : "Running"}
      {tool.detail && <p className="mt-1 wrap-break-word pl-6">{tool.detail}</p>}
    </li>)}
  </ul>;
}

export function ChatProgress({ stream }: { stream: ReturnType<typeof useChatStream> }) {
  if (!stream.question) return null;
  const running = stream.tools.filter((tool) => tool.status === "running").at(-1);
  return <>
    <article className="p-3.5 mb-3 rounded-lg wrap-anywhere ml-6 bg-muted"><p className="mb-2 text-muted-foreground text-[11px] font-semibold">You</p><p className="whitespace-pre-wrap">{stream.question}</p></article>
    <article className="p-3.5 mb-3 rounded-lg wrap-anywhere border border-border">
      <p className="mb-2 text-muted-foreground text-[11px] font-semibold">Sol</p>
      <ChatToolActivity tools={stream.tools} interrupted={!stream.busy} />
      {stream.text && <MarkdownContent><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeChatUrl(url) ?? ""}
        components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />, img: () => null }}>{stream.text}</Markdown></MarkdownContent>}
      {stream.busy ? <p className="p-3 text-muted-foreground flex items-center" role="status"><AsciiSpinner />{running ? `${running.name}…` : stream.status}</p>
        : <p className="p-3 text-muted-foreground">Reply interrupted. Reload the chat or retry your message below.</p>}
    </article>
  </>;
}
