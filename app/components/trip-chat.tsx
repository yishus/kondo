import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { citedMarkdown, MAX_CHAT_MESSAGES, MAX_CHAT_MESSAGE_LENGTH, safeChatUrl } from "../card-chat";
import { cardTypes } from "../card-types";
import { type TripChatData, type TripChatMessage, type TripCardSuggestion } from "../trip-chat";
import { UNSCHEDULED_COLUMN_ID, type TripColumn, type TripCard } from "../card-order";
import { type CardLocation } from "../card-location";
import { GoogleMapsPlacePicker } from "./google-maps-place-picker";

const prompts = ["Suggest a few places that fit my itinerary.", "Find food stops near my planned visits.", "What is missing from this trip?"];

export function TripChat({ tripId, columns, onOpenCard }: {
  tripId: string; columns: TripColumn[]; onOpenCard: (card: TripCard) => void;
}) {
  const fetcher = useFetcher<TripChatData>();
  const { load } = fetcher;
  const endpoint = `/trips/${encodeURIComponent(tripId)}/chat`;
  const initialized = useRef(false);
  const handled = useRef<string | undefined>(undefined);
  const [messages, setMessages] = useState<TripChatMessage[]>([]);
  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const busy = fetcher.state !== "idle";
  const pendingQuestion = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "send" ? String(fetcher.formData.get("message") ?? "") : null;
  const full = messages.length >= MAX_CHAT_MESSAGES;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void load(endpoint);
  }, [endpoint, load]);

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.messages) { setMessages(fetcher.data.messages); setLoaded(true); }
    if (fetcher.data.available !== undefined) setAvailable(fetcher.data.available);
    if (fetcher.data.completed && fetcher.data.completed !== handled.current) {
      handled.current = fetcher.data.completed;
      setDraft("");
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy]);

  function send(message: string) {
    if (busy || !available || !loaded || full || !message.trim()) return;
    setDraft(message);
    void fetcher.submit({ intent: "send", message }, { method: "post", action: endpoint });
  }

  return (
    <section className="card-chat min-w-0 rounded-xl border border-border bg-surface p-4 xl:sticky xl:top-4" aria-label="Chat about this trip">
      <div className="card-chat-heading">
        <div>
          <h3>Ask about this trip</h3>
          <p>Sol · Web search available</p>
        </div>
        {messages.length > 0 && <button type="button" className="ui-button" disabled={busy} onClick={() => {
          if (window.confirm("Clear your conversation about this trip and start a new chat?")) {
            void fetcher.submit({ intent: "clear" }, { method: "post", action: endpoint });
          }
        }}>New chat</button>}
      </div>
      <p className="card-chat-context">Plan with your whole itinerary, stays, notes, and todos. Ask for ideas, then add the cards you like.</p>
      <div className="card-chat-log" ref={log} role="log" aria-label="Conversation" aria-live="polite" aria-busy={busy}>
        {!loaded && !fetcher.data?.error && <p className="text-muted-foreground">Loading your chat…</p>}
        {loaded && !messages.length && <div className="card-chat-empty">
          <p>Where would you like to go next?</p>
          <p className="text-muted-foreground">Find places, fill a free day, or build on what you already have planned.</p>
          {available && <div className="card-chat-prompts">{prompts.map((prompt) => <button type="button" className="ui-button ui-button-outline" key={prompt} disabled={busy} onClick={() => send(prompt)}>{prompt}</button>)}</div>}
        </div>}
        {messages.map((message) => <article className={`card-chat-message card-chat-${message.role}`} key={message.id}>
          <p className="card-chat-speaker">{message.role === "user" ? "You" : "Sol"}</p>
          {message.role === "user" ? <p className="whitespace-pre-wrap">{message.text}</p> : <>
            <div className="markdown-content">
              <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeChatUrl(url) ?? ""} components={{
                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                img: () => null,
              }}>{citedMarkdown(message)}</Markdown>
            </div>
            {message.citations.length > 0 && <div className="card-chat-sources" aria-label="Sources">
              {[...new Map(message.citations.filter((citation) => safeChatUrl(citation.url)).map((citation) => [citation.url, citation])).values()].map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title} ↗</a>)}
            </div>}
            {message.suggestions?.map((suggestion) => <SuggestedCard key={suggestion.id} suggestion={suggestion} tripId={tripId} columns={columns} busy={busy}
              onOpenCard={onOpenCard} onAdd={(tripDayId, location) => {
                void fetcher.submit({ intent: "add", messageId: message.id, suggestionId: suggestion.id, tripDayId,
                  googlePlaceId: location.googlePlaceId ?? "", googleMapsQuery: location.googleMapsQuery ?? "", googlePlaceName: location.googlePlaceName ?? "",
                }, { method: "post", action: endpoint });
              }} />)}
          </>}
        </article>)}
        {busy && pendingQuestion && <>
          <article className="card-chat-message card-chat-user"><p className="card-chat-speaker">You</p><p className="whitespace-pre-wrap">{pendingQuestion}</p></article>
          <p className="card-chat-pending" role="status">Sol is preparing a reply and may search the web…</p>
        </>}
      </div>
      {available === false && <p className="card-chat-notice">Chat is not configured yet. Ask the trip administrator to enable it.</p>}
      {!busy && fetcher.data?.error && <div className="card-chat-notice" role="alert">
        <p>{fetcher.data.error}</p>
        <button type="button" className="ui-button" onClick={() => void load(endpoint)}>Reload chat</button>
      </div>}
      {full && <p className="card-chat-notice">This conversation is full. Start a new chat to continue.</p>}
      <form className="card-chat-composer" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
        <label className="sr-only" htmlFor={`trip-chat-message-${tripId}`}>Message about this trip</label>
        <textarea id={`trip-chat-message-${tripId}`} className="ui-input" rows={3} value={draft}
          maxLength={MAX_CHAT_MESSAGE_LENGTH} disabled={busy || !available || !loaded || full}
          placeholder="Find a few places to add to my trip…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft); }
          }} />
        <div className="card-chat-composer-footer">
          <p>Your chat is private to you. Saved trip details and messages are sent to OpenAI when you ask.</p>
          <button className="ui-button ui-button-primary" type="submit" disabled={busy || !available || !loaded || full || !draft.trim()}>{busy ? "Working…" : "Send"}</button>
        </div>
      </form>
    </section>
  );
}

function SuggestedCard({ suggestion, tripId, columns, busy, onAdd, onOpenCard }: {
  suggestion: TripCardSuggestion; tripId: string; columns: TripColumn[]; busy: boolean;
  onAdd: (tripDayId: string, location: CardLocation) => void; onOpenCard: (card: TripCard) => void;
}) {
  const [dayId, setDayId] = useState(() => columns.find((column) => column.date === suggestion.date)?.id ?? UNSCHEDULED_COLUMN_ID);
  const [location, setLocation] = useState<CardLocation>({ googlePlaceId: null, googleMapsQuery: null, googlePlaceName: null });
  const selectedDay = columns.some((column) => column.id === dayId) ? dayId : UNSCHEDULED_COLUMN_ID;
  const addedCard = columns.flatMap((column) => column.cards).find((card) => card.id === suggestion.addedCardId);
  const showLocation = suggestion.type === "location" || suggestion.type === "hike";
  return <section className="mt-4 grid min-w-0 gap-3 rounded-lg border border-border p-3" aria-label={`Suggested card: ${suggestion.title}`}>
    <div>
      <p className="text-xs text-muted-foreground">{cardTypes[suggestion.type]}</p>
      <h4 className="mt-1 font-semibold">{suggestion.title}</h4>
    </div>
    {suggestion.description && <div className="markdown-content text-xs"><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeChatUrl(url) ?? ""}
      components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />, img: () => null }}>{suggestion.description}</Markdown></div>}
    {suggestion.addedCardId ? <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground" role="status">Added to trip</span>
      {addedCard && <button type="button" className="ui-button ui-button-outline" onClick={() => onOpenCard(addedCard)}>Open card</button>}
    </div> : <>
      <label className="ui-field">Add to
        <select className="ui-input" value={selectedDay} disabled={busy} onChange={(event) => setDayId(event.target.value)}>
          {columns.map((column) => <option key={column.id} value={column.id}>{column.date ?? "Unscheduled"}</option>)}
        </select>
      </label>
      {showLocation && <GoogleMapsPlacePicker tripId={tripId} label="Map location" optional disabled={busy} initialQuery={suggestion.locationQuery}
        value={location.googlePlaceId ? { placeId: location.googlePlaceId, name: location.googlePlaceName ?? "Location", query: location.googleMapsQuery ?? "" } : null}
        onChange={(place, query) => setLocation({ googlePlaceId: place?.id ?? null, googleMapsQuery: place ? query : null, googlePlaceName: place?.name ?? null })} />}
      {showLocation && !location.googlePlaceId && <p className="text-xs text-muted-foreground">Choose a place for a map pin, or add the card now and set its location later.</p>}
      <button type="button" className="ui-button ui-button-primary justify-self-start" disabled={busy} onClick={() => onAdd(selectedDay, location)}>Add to trip</button>
    </>}
  </section>;
}
