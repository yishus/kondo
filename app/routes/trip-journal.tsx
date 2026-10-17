import { env } from "cloudflare:workers";
import { useEffect, useRef, useState } from "react";
import { data, Link, useFetcher } from "react-router";
import type { Route } from "./+types/trip-journal";
import { getDb } from "../db.server";
import { requireTripOwner } from "../auth.server";
import { resolveTripId } from "../trip-url.server";
import { addJournalEntry, loadJournal } from "../journal.server";
import { getLiveTripPage } from "../trip-page.server";
import { journalImageError, journalImageUrl, JOURNAL_IMAGE_TYPES, MAX_JOURNAL_BODY, MAX_JOURNAL_IMAGES } from "../journal";
import { useLiveTrip } from "./trip-live-layout";
import { Icon } from "../components/icon";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const { trip, currentUser } = await getLiveTripPage(context, request, params.tripId);
  return data(await loadJournal(db, trip.id, currentUser.id, new URL(request.url).searchParams.get("before")), { headers: { "Cache-Control": "private, no-store" } });
}

export async function action({ request, params }: Route.ActionArgs) {
  const db = getDb(env.DB);
  const tripId = await resolveTripId(db, params.tripId);
  const user = await requireTripOwner(request, db, tripId);
  return addJournalEntry(db, env.ATTACHMENTS, tripId, user.id, request);
}

export const headers = () => ({ "Cache-Control": "private, no-store" });

const fieldClass = "w-full rounded-lg border border-border bg-surface p-2.5 text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export default function TripJournal({ loaderData }: Route.ComponentProps) {
  const { trip, currentUser, base } = useLiveTrip();
  const fetcher = useFetcher<typeof action>();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef<string | undefined>(undefined);
  const busy = fetcher.state !== "idle";
  const tripId = trip.code ?? trip.id;
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok && fetcher.data.savedId !== saved.current) {
      saved.current = fetcher.data.savedId;
      setBody(""); setFiles([]); setError(null); setVisibility("private");
    } else if (!fetcher.data.ok) setError(fetcher.data.error);
  }, [fetcher.state, fetcher.data]);
  return <section aria-label="Trip journal">
    <h2 className="text-lg font-semibold">Your trip journal</h2>
    <p className="mt-1 mb-5 text-sm text-muted-foreground">Save a moment for yourself, or share it with your travel companions.</p>
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
    <div className="min-w-0 lg:sticky lg:top-6">
    <fetcher.Form method="post" encType="multipart/form-data" action={`${base}/live/journal`} className="grid gap-4 rounded-xl border border-border bg-surface p-4" onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      setError(null);
      const form = new FormData(event.currentTarget);
      form.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
      form.delete("images");
      files.forEach((file) => form.append("images", file));
      void fetcher.submit(form, { method: "post", encType: "multipart/form-data", action: `${base}/live/journal` });
    }}>
      <label className="grid gap-2 text-sm font-medium" htmlFor="journal-body">Capture a moment
        <textarea id="journal-body" name="body" className={`${fieldClass} min-h-28 resize-y font-normal`} rows={4} value={body} onChange={(event) => setBody(event.target.value)} maxLength={MAX_JOURNAL_BODY} placeholder="What happened? What do you want to remember?" disabled={busy} />
      </label>
      <fieldset disabled={busy} className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Who can see this entry?</legend>
        <label className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 ${visibility === "private" ? "border-primary bg-muted" : "border-border"}`}>
          <input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} className="mt-1" /><span><span className="block text-sm font-medium">Private · Only you</span><span className="text-xs text-muted-foreground">Your personal notes and images.</span></span>
        </label>
        <label className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 ${visibility === "public" ? "border-primary bg-muted" : "border-border"}`}>
          <input type="radio" name="visibility" value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} className="mt-1" /><span><span className="block text-sm font-medium">Public · All trip owners</span><span className="text-xs text-muted-foreground">Everyone who owns this trip can see this entry and its images.</span></span>
        </label>
      </fieldset>
      <div>
        <label htmlFor="journal-images" className="mb-2 block text-sm font-medium">Images · {files.length}/{MAX_JOURNAL_IMAGES}</label>
        <input id="journal-images" name="images" type="file" accept={JOURNAL_IMAGE_TYPES.join(",")} multiple disabled={busy || files.length >= MAX_JOURNAL_IMAGES} className={`${fieldClass} text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-foreground`} aria-describedby="journal-images-help" onChange={(event) => {
          const chosen = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (chosen.length + files.length > MAX_JOURNAL_IMAGES) { setError("Add up to five images per entry. Remove an image to choose another."); return; }
          const invalid = chosen.map(journalImageError).find(Boolean);
          if (invalid) { setError(invalid); return; }
          setError(null); setFiles((current) => [...current, ...chosen]);
        }} />
        <p id="journal-images-help" className="mt-2 text-xs text-muted-foreground">Up to 5 JPG, PNG, WebP or GIF images. 10 MB each.</p>
        {files.length > 0 && <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{files.map((file, index) => <li key={`${index}:${file.name}:${file.lastModified}`} className="relative overflow-hidden rounded-lg border border-border"><ImagePreview file={file} /><button type="button" disabled={busy} aria-label={`Remove image ${index + 1}: ${file.name}`} className="absolute top-0 right-0 grid h-11 w-11 place-items-center bg-surface/90" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}><Icon name="close" /></button></li>)}</ul>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy || (!body.trim() && !files.length)} className="min-h-12 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Saving your moment…" : visibility === "private" ? "Save private entry" : "Share with trip owners"}</button>
      <p className="text-xs text-muted-foreground">The date and time are recorded when your entry is saved.</p>
    </fetcher.Form>
    {fetcher.data?.ok && !busy && <p role="status" className="mt-3 text-sm text-muted-foreground">Your journal entry is saved. <Link to={`${base}/live/journal`} className="underline">View newest entries</Link></p>}
    </div>
    <div className="min-w-0">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Trip memories</h3><Link to={`${base}/live/journal`} className="inline-flex min-h-11 items-center text-sm underline">Newest</Link></div>
    {!loaderData.entries.length && <p className="mt-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No entries here yet. Capture your first moment to start your journal.</p>}
    <div className="mt-3 grid gap-4">{loaderData.entries.map((entry) => <article key={entry.id} className="rounded-xl border border-border bg-surface p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-sm font-medium">{entry.userId === currentUser.id ? "You" : entry.author}</p><time dateTime={entry.createdAt} className="mt-1 block text-xs text-muted-foreground">{new Intl.DateTimeFormat("en", { timeZone: entry.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))} · {entry.timezone}</time></div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{entry.visibility === "private" ? "Private · Only you" : "Public · Trip owners"}</span>
      </header>
      {entry.body && <p className="whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">{entry.body}</p>}
      {entry.images.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{entry.images.map((image, index) => <a key={image.id} href={journalImageUrl(tripId, entry.id, image.id)} target="_blank" rel="noopener noreferrer" aria-label={`Open journal image ${index + 1}: ${image.filename}`} className="overflow-hidden rounded-lg border border-border"><img src={journalImageUrl(tripId, entry.id, image.id)} loading="lazy" alt={`Journal image ${index + 1} by ${entry.author}`} className="aspect-square w-full object-cover" /></a>)}</div>}
    </article>)}</div>
    {loaderData.nextCursor && <Link className="mt-5 flex min-h-12 items-center justify-center rounded-lg border border-border text-sm" to={`${base}/live/journal?${new URLSearchParams({ before: loaderData.nextCursor })}`}>Older entries</Link>}
    </div>
    </div>
  </section>;
}

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <img src={url} alt={file.name} className="aspect-square w-full object-cover" />;
}
