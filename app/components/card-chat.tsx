import { MarkdownContent } from "./markdown-content";
import { ChatProgress, ChatToolActivity, useChatStream } from "./chat-progress";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { citedMarkdown, MAX_CHAT_MESSAGES, MAX_CHAT_MESSAGE_LENGTH, safeChatUrl, type CardChatData, type ChatMessage } from "../card-chat";
import type { CardType } from "../card-types";

const prompts: Record<CardType, string[]> = {
  hike: ["Give me a route report for this hike on the planned day and time.", "What should I pack for this hike?"],
  location: ["What should I know before visiting?", "Check opening hours for my planned visit."],
  city: ["What should I explore in this area?", "What will the weather be like on this day?"],
  transport: ["Check this route and any travel disruptions.", "What should I know about this journey?"],
};

export function CardChat({ tripId, cardId, type, active, date, timezone }: {
  tripId: string; cardId: string; type: CardType; active: boolean; date: string | null; timezone: string | null;
}) {
  const fetcher = useFetcher<CardChatData>();
  const { load } = fetcher;
  const endpoint = `/trips/${encodeURIComponent(tripId)}/cards/${encodeURIComponent(cardId)}/chat`;
  const stream = useChatStream(endpoint);
  const initialized = useRef(false);
  const handled = useRef<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const busy = fetcher.state !== "idle" || stream.busy;
  const error = stream.error ?? requestError;
  const full = messages.length >= MAX_CHAT_MESSAGES;

  useEffect(() => {
    if (!active || initialized.current) return;
    initialized.current = true;
    void load(endpoint);
  }, [active, endpoint, load]);

  useEffect(() => {
    if (!fetcher.data) return;
    stream.reset();
    setRequestError(fetcher.data.error);
    if (fetcher.data.messages) { setMessages(fetcher.data.messages); setLoaded(true); }
    if (fetcher.data.available !== undefined) setAvailable(fetcher.data.available);
    if (fetcher.data.completed && fetcher.data.completed !== handled.current) {
      handled.current = fetcher.data.completed;
      setDraft("");
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (active && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [active, messages, busy, stream.text, stream.tools, stream.status]);

  function send(message: string) {
    if (busy || !available || !loaded || full || !message.trim()) return;
    setDraft(message);
    setRequestError(undefined);
    void stream.send(message).then((data) => {
      if (data?.messages) { setMessages(data.messages); setDraft(""); }
      if (data?.available !== undefined) setAvailable(data.available);
    });
  }

  return (
    <section className="text-[13px]" aria-label="Chat about this card">
      <div className="flex justify-between items-center gap-3 [&_h3]:font-semibold [&_p]:text-muted-foreground [&_p]:text-[11px] [&_p]:leading-[1.6]">
        <div>
          <h3>Chat about this card</h3>
          <p>Sol · Web search available</p>
        </div>
        {messages.length > 0 && <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" disabled={busy} onClick={() => {
          if (window.confirm("Clear your conversation about this card and start a new chat?")) {
            void fetcher.submit({ intent: "clear" }, { method: "post", action: endpoint });
          }
        }}>New chat</button>}
      </div>
      <p className="text-muted-foreground text-[11px] leading-[1.6] mt-2.5">{date ?? "Unscheduled"} · {timezone ?? "Time zone not set"}. Uses saved card details and any estimated timing. Save card edits before asking about them.</p>
      <div className="min-h-45 max-h-[min(48dvh,520px)] overflow-y-auto overscroll-contain m-[16px_0] pr-1" ref={log} role="log" aria-label="Conversation" aria-live="polite" aria-busy={busy}>
        {!loaded && !error && <p className="text-muted-foreground">Loading your chat…</p>}
        {loaded && !messages.length && <div className="p-[20px_0] leading-[1.7]">
          <p>Ask about this {type === "city" ? "area" : type === "location" ? "place" : type}.</p>
          <p className="text-muted-foreground">Use the card as a starting point, then ask follow-up questions.</p>
          {available && <div className="flex flex-wrap gap-2 mt-4 [&_button]:text-left [&_button]:shrink">{prompts[type].map((prompt) => <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface" key={prompt} disabled={busy} onClick={() => send(prompt)}>{prompt}</button>)}</div>}
        </div>}
        {messages.map((message) => <article className={`p-3.5 mb-3 rounded-lg wrap-anywhere ${message.role === "user" ? "ml-6 bg-muted" : "border border-border"}`} key={message.id}>
          <p className="mb-2 text-muted-foreground text-[11px] font-semibold">{message.role === "user" ? "You" : "Sol"}</p>
          {message.role === "user" ? <p className="whitespace-pre-wrap">{message.text}</p> : <>
            <ChatToolActivity tools={message.toolCalls} />
            <MarkdownContent>
              <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeChatUrl(url) ?? ""} components={{
                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                img: () => null,
              }}>{citedMarkdown(message)}</Markdown>
            </MarkdownContent>
            {message.citations.length > 0 && <div className="flex flex-wrap gap-[8px_12px] mt-4 pt-2.5 border-t border-t-border text-[11px] [&_a]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-[3px]" aria-label="Sources">
              {[...new Map(message.citations.filter((citation) => safeChatUrl(citation.url)).map((citation) => [citation.url, citation])).values()].map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title} ↗</a>)}
            </div>}
          </>}
        </article>)}
        <ChatProgress stream={stream} />
      </div>
      {available === false && <p className="m-[12px_0] p-3 border border-border rounded-md text-muted-foreground">Chat is not configured yet. Add OPENAI_API_KEY to the server to enable Sol.</p>}
      {!busy && error && <div className="m-[12px_0] p-3 border border-border rounded-md text-muted-foreground" role="alert">
        <p>{error}</p>
        <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" onClick={() => void load(endpoint)}>Reload chat</button>
      </div>}
      {full && <p className="m-[12px_0] p-3 border border-border rounded-md text-muted-foreground">This conversation is full. Start a new chat to continue.</p>}
      <form className="[&_textarea]:resize-y [&_textarea]:max-h-50" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
        <label className="sr-only" htmlFor={`chat-message-${cardId}`}>Message about this card</label>
        <textarea id={`chat-message-${cardId}`} className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" rows={3} value={draft}
          maxLength={MAX_CHAT_MESSAGE_LENGTH} disabled={busy || !available || !loaded || full}
          placeholder={type === "hike" ? "Ask about the route, weather, or trail conditions…" : "Ask about this card…"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft); }
          }} />
        <div className="flex items-center justify-between gap-4 mt-2 [&_p]:max-w-97.5 [&_p]:text-[11px] [&_p]:text-muted-foreground [&_p]:leading-normal">
          <p>Your chat is private to you. Card context and messages are sent to OpenAI when you ask.</p>
          <button className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary" type="submit" disabled={busy || !available || !loaded || full || !draft.trim()}>{busy ? "Working…" : "Send"}</button>
        </div>
      </form>
    </section>
  );
}
