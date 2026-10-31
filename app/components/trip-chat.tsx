import { MarkdownContent } from "./markdown-content";
import { ChatProgress, ChatToolActivity, useChatStream } from "./chat-progress";
import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { citedMarkdown, MAX_CHAT_MESSAGES, MAX_CHAT_MESSAGE_LENGTH, safeChatUrl } from "../card-chat";
import { cardTypes } from "../card-types";
import { cardUpdateChanges, cardUpdateFields, type TripCardUpdate, type TripChatData, type TripChatMessage, type TripCardSuggestion } from "../trip-chat";
import { UNSCHEDULED_COLUMN_ID, type TripColumn, type TripCard } from "../card-order";
import { type CardLocation } from "../card-location";
import { GoogleMapsPlacePicker } from "./google-maps-place-picker";

const prompts = ["Suggest a few places that fit my itinerary.", "Find food stops near my planned visits.", "What is missing from this trip?"];

export function TripChat({ tripId, columns, onOpenCard, live = false }: {
  tripId: string; columns: TripColumn[]; onOpenCard?: (card: TripCard) => void; live?: boolean;
}) {
  const fetcher = useFetcher<TripChatData>();
  const revalidator = useRevalidator();
  const { load } = fetcher;
  const endpoint = `/trips/${encodeURIComponent(tripId)}/${live ? "live/" : ""}chat`;
  const stream = useChatStream(endpoint);
  const initialized = useRef(false);
  const handled = useRef<string | undefined>(undefined);
  const [messages, setMessages] = useState<TripChatMessage[]>([]);
  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const busy = fetcher.state !== "idle" || stream.busy;
  const error = stream.error ?? requestError;
  const full = messages.length >= MAX_CHAT_MESSAGES;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void load(endpoint);
  }, [endpoint, load]);

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
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy, stream.text, stream.tools, stream.status]);

  function send(message: string) {
    if (busy || !available || !loaded || full || !message.trim()) return;
    setDraft(message);
    setRequestError(undefined);
    void stream.send(message, live ? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}).then((data) => {
      if (data?.messages) { setMessages(data.messages); setDraft(""); }
      if (data?.available !== undefined) setAvailable(data.available);
      if (data?.tripChanged) void revalidator.revalidate();
    });
  }

  return (
    <section className={`text-[13px] min-w-0 rounded-xl border border-border bg-surface p-4 ${live ? "mx-auto w-full max-w-3xl md:p-5" : "xl:sticky xl:top-4"}`} aria-label="Chat about this trip">
      <div className="flex justify-between items-center gap-3 [&_h3]:font-semibold [&_p]:text-muted-foreground [&_p]:text-[11px] [&_p]:leading-[1.6]">
        <div>
          <h3>{live ? "Your travel companion" : "Ask about this trip"}</h3>
          <p>Sol · Web search available</p>
        </div>
        {messages.length > 0 && <button type="button" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" disabled={busy} onClick={() => {
          if (window.confirm("Clear your conversation about this trip and start a new chat?")) {
            void fetcher.submit({ intent: "clear" }, { method: "post", action: endpoint });
          }
        }}>New chat</button>}
      </div>
      <p className="text-muted-foreground text-[11px] leading-[1.6] mt-2.5">{live ? "Ask about today, your current stop, or what’s coming up. The local time and saved itinerary are refreshed with each question." : "Plan with your whole itinerary, stays, notes, and todos. Ask Sol to add cards or suggest edits. Changes to existing cards need your approval."}</p>
      <div className={`min-h-45 max-h-[min(48dvh,520px)] overflow-y-auto overscroll-contain m-[16px_0] pr-1 ${live ? "md:min-h-64" : ""}`} ref={log} role="log" aria-label="Conversation" aria-live="polite" aria-busy={busy}>
        {!loaded && !error && <p className="text-muted-foreground">Loading your chat…</p>}
        {loaded && !messages.length && <div className="p-[20px_0] leading-[1.7]">
          <p>{live ? "How can I help right now?" : "Where would you like to go next?"}</p>
          <p className="text-muted-foreground">{live ? "Get practical help for the day ahead, wherever you are." : "Find places, fill a free day, or build on what you already have planned."}</p>
          {available && <div className="flex flex-wrap gap-2 mt-4 [&_button]:text-left [&_button]:shrink">{(live ? ["What’s next on my itinerary?", "What should I know about my current stop?", "Find food near today’s stops."] : prompts).map((prompt) => <button type="button" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface" key={prompt} disabled={busy} onClick={() => send(prompt)}>{prompt}</button>)}</div>}
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
            {!live && !!message.updates?.length && <div className="mt-4 grid gap-3">
              {message.updates.map((update) => <ProposedCardUpdate key={update.id} update={update} busy={busy}
                onDecision={(intent) => {
                  void fetcher.submit({ intent, messageId: message.id, updateId: update.id }, { method: "post", action: endpoint });
                }} />)}
            </div>}
            {!live && onOpenCard && !!message.suggestions?.length && <div className="@container mt-4">
              <div className="mx-auto grid max-w-80 grid-cols-1 items-start gap-4 @min-[41rem]:max-w-[41rem] @min-[41rem]:grid-cols-2 @min-[62rem]:max-w-[62rem] @min-[62rem]:grid-cols-3">
              {message.suggestions.map((suggestion) => <SuggestedCard key={suggestion.id} suggestion={suggestion} tripId={tripId} columns={columns} busy={busy}
              onOpenCard={onOpenCard} onAdd={(tripDayId, location) => {
                void fetcher.submit({ intent: "add", messageId: message.id, suggestionId: suggestion.id, tripDayId,
                  googlePlaceId: location.googlePlaceId ?? "", googleMapsQuery: location.googleMapsQuery ?? "", googlePlaceName: location.googlePlaceName ?? "",
                }, { method: "post", action: endpoint });
              }} />)}
              </div>
            </div>}
          </>}
        </article>)}
        <ChatProgress stream={stream} />
      </div>
      {available === false && <p className="m-[12px_0] p-3 border border-border rounded-md text-muted-foreground">Chat is not configured yet. Ask the trip administrator to enable it.</p>}
      {!busy && error && <div className="m-[12px_0] p-3 border border-border rounded-md text-muted-foreground" role="alert">
        <p>{error}</p>
        <button type="button" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" onClick={() => void load(endpoint)}>Reload chat</button>
      </div>}
      {full && <p className="m-[12px_0] p-3 border border-border rounded-md text-muted-foreground">This conversation is full. Start a new chat to continue.</p>}
      <form className="[&_textarea]:resize-y [&_textarea]:max-h-50" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
        <label className="sr-only" htmlFor={`trip-chat-message-${tripId}`}>Message about this trip</label>
        <textarea id={`trip-chat-message-${tripId}`} className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" rows={3} value={draft}
          maxLength={MAX_CHAT_MESSAGE_LENGTH} disabled={busy || !available || !loaded || full}
          placeholder={live ? "Ask about your day…" : "Plan a 6-day trip in Japan and add the cards…"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft); }
          }} />
        <div className="flex items-center justify-between gap-4 mt-2 [&_p]:max-w-97.5 [&_p]:text-[11px] [&_p]:text-muted-foreground [&_p]:leading-normal">
          <p>Your chat is private to you. Saved trip details and messages are sent to OpenAI when you ask.</p>
          <button className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary" type="submit" disabled={busy || !available || !loaded || full || !draft.trim()}>{busy ? "Working…" : "Send"}</button>
        </div>
      </form>
    </section>
  );
}

function ProposedCardUpdate({ update, busy, onDecision }: {
  update: TripCardUpdate; busy: boolean; onDecision: (intent: "approve-update" | "reject-update") => void;
}) {
  return <section className="min-w-0 rounded-lg border border-border p-3" aria-label={`Proposed update: ${update.cardTitle}`}>
    <h4 className="font-semibold">{update.cardTitle}</h4>
    <p className="mt-1 text-xs text-secondary-foreground" role="status">{update.status === "pending"
      ? "May I apply these changes? Review each field before approving."
      : update.status === "applied" ? "Changes approved and saved." : "Changes declined. Card kept unchanged."}</p>
    <dl className="mt-3 grid gap-3 text-xs">
      {cardUpdateChanges(update).map(({ field, before, after }) => <div key={field} className="min-w-0">
        <dt className="font-medium">{cardUpdateFields[field]}</dt>
        <dd className="mt-1 whitespace-pre-wrap wrap-anywhere text-muted-foreground"><span className="font-medium">Current: </span>{before || "Empty"}</dd>
        <dd className="mt-1 whitespace-pre-wrap wrap-anywhere text-foreground"><span className="font-medium">Proposed: </span>{after || "Empty"}</dd>
      </div>)}
    </dl>
    {update.status === "pending" && <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className="min-h-11 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        disabled={busy} onClick={() => onDecision("approve-update")}>Approve changes</button>
      <button type="button" className="min-h-11 rounded-md border border-border px-3 text-xs font-medium text-secondary-foreground hover:bg-muted disabled:opacity-50"
        disabled={busy} onClick={() => onDecision("reject-update")}>Keep current card</button>
    </div>}
  </section>;
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
  return <section className="mx-auto grid w-full min-w-0 max-w-80 gap-3 rounded-lg border border-border p-3" aria-label={`Suggested card: ${suggestion.title}`}>
    <div>
      <p className="text-xs text-muted-foreground">{cardTypes[suggestion.type]}</p>
      <h4 className="mt-1 font-semibold">{suggestion.title}</h4>
    </div>
    {suggestion.description && <div className="text-foreground wrap-anywhere [&_>_*_+_*]:mt-3 [&_:is(h1,h2,h3,h4,h5,h6)]:my-[16px_8px] [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold [&_:is(h1,h2,h3,h4,h5,h6)]:leading-[1.3] *:first:mt-0 [&_h1]:text-[1.6em] [&_h2]:text-[1.4em] [&_h3]:text-[1.2em] [&_:is(ul,ol)]:pl-6 [&_ul]:list-disc [&_ol]:list-decimal [&_li+li]:mt-1 [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-1 [&_.task-list-item_input]:mr-1.5 [&_a]:underline [&_a]:underline-offset-[3px] [&_blockquote]:pl-3 [&_blockquote]:border-l-3 [&_blockquote]:border-l-input [&_blockquote]:text-muted-foreground [&_code]:py-0.5 [&_code]:px-1 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:text-[.9em] [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:bg-muted [&_pre_code]:p-0 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_:is(th,td)]:py-1.5 [&_:is(th,td)]:px-2.5 [&_:is(th,td)]:border [&_:is(th,td)]:border-border [&_th]:bg-muted [&_th]:font-semibold [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-sm [&_hr]:border-border text-xs"><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeChatUrl(url) ?? ""}
      components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />, img: () => null }}>{suggestion.description}</Markdown></div>}
    {suggestion.addedCardId ? <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground" role="status">Added to trip</span>
      {addedCard && <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface" onClick={() => onOpenCard(addedCard)}>Open card</button>}
      {showLocation && addedCard && !addedCard.googlePlaceId && <p className="w-full text-xs text-muted-foreground">Set a map location to show this card as a pin.</p>}
    </div> : <>
      <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">Add to
        <select className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" value={selectedDay} disabled={busy} onChange={(event) => setDayId(event.target.value)}>
          {columns.map((column) => <option key={column.id} value={column.id}>{column.date ?? "Unscheduled"}</option>)}
        </select>
      </label>
      {showLocation && <GoogleMapsPlacePicker tripId={tripId} label="Map location" optional disabled={busy} initialQuery={suggestion.locationQuery}
        value={location.googlePlaceId ? { placeId: location.googlePlaceId, name: location.googlePlaceName ?? "Location", query: location.googleMapsQuery ?? "" } : null}
        onChange={(place, query) => setLocation({ googlePlaceId: place?.id ?? null, googleMapsQuery: place ? query : null, googlePlaceName: place?.name ?? null })} />}
      {showLocation && !location.googlePlaceId && <p className="text-xs text-muted-foreground">Choose a place for a map pin, or add the card now and set its location later.</p>}
      <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary justify-self-start" disabled={busy} onClick={() => onAdd(selectedDay, location)}>Add to trip</button>
    </>}
  </section>;
}
