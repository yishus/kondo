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
    <section className="card-chat" aria-label="Chat about this card">
      <div className="card-chat-heading">
        <div>
          <h3>Chat about this card</h3>
          <p>Sol · Web search available</p>
        </div>
        {messages.length > 0 && <button type="button" className="ui-button" disabled={busy} onClick={() => {
          if (window.confirm("Clear your conversation about this card and start a new chat?")) {
            void fetcher.submit({ intent: "clear" }, { method: "post", action: endpoint });
          }
        }}>New chat</button>}
      </div>
      <p className="card-chat-context">{date ?? "Unscheduled"} · {timezone ?? "Time zone not set"}. Uses saved card details and any estimated timing. Save card edits before asking about them.</p>
      <div className="card-chat-log" ref={log} role="log" aria-label="Conversation" aria-live="polite" aria-busy={busy}>
        {!loaded && !error && <p className="text-muted-foreground">Loading your chat…</p>}
        {loaded && !messages.length && <div className="card-chat-empty">
          <p>Ask about this {type === "city" ? "area" : type === "location" ? "place" : type}.</p>
          <p className="text-muted-foreground">Use the card as a starting point, then ask follow-up questions.</p>
          {available && <div className="card-chat-prompts">{prompts[type].map((prompt) => <button type="button" className="ui-button ui-button-outline" key={prompt} disabled={busy} onClick={() => send(prompt)}>{prompt}</button>)}</div>}
        </div>}
        {messages.map((message) => <article className={`card-chat-message card-chat-${message.role}`} key={message.id}>
          <p className="card-chat-speaker">{message.role === "user" ? "You" : "Sol"}</p>
          {message.role === "user" ? <p className="whitespace-pre-wrap">{message.text}</p> : <>
            <ChatToolActivity tools={message.toolCalls} />
            <div className="markdown-content">
              <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeChatUrl(url) ?? ""} components={{
                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                img: () => null,
              }}>{citedMarkdown(message)}</Markdown>
            </div>
            {message.citations.length > 0 && <div className="card-chat-sources" aria-label="Sources">
              {[...new Map(message.citations.filter((citation) => safeChatUrl(citation.url)).map((citation) => [citation.url, citation])).values()].map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title} ↗</a>)}
            </div>}
          </>}
        </article>)}
        <ChatProgress stream={stream} />
      </div>
      {available === false && <p className="card-chat-notice">Chat is not configured yet. Add OPENAI_API_KEY to the server to enable Sol.</p>}
      {!busy && error && <div className="card-chat-notice" role="alert">
        <p>{error}</p>
        <button type="button" className="ui-button" onClick={() => void load(endpoint)}>Reload chat</button>
      </div>}
      {full && <p className="card-chat-notice">This conversation is full. Start a new chat to continue.</p>}
      <form className="card-chat-composer" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
        <label className="sr-only" htmlFor={`chat-message-${cardId}`}>Message about this card</label>
        <textarea id={`chat-message-${cardId}`} className="ui-input" rows={3} value={draft}
          maxLength={MAX_CHAT_MESSAGE_LENGTH} disabled={busy || !available || !loaded || full}
          placeholder={type === "hike" ? "Ask about the route, weather, or trail conditions…" : "Ask about this card…"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft); }
          }} />
        <div className="card-chat-composer-footer">
          <p>Your chat is private to you. Card context and messages are sent to OpenAI when you ask.</p>
          <button className="ui-button ui-button-primary" type="submit" disabled={busy || !available || !loaded || full || !draft.trim()}>{busy ? "Working…" : "Send"}</button>
        </div>
      </form>
    </section>
  );
}
