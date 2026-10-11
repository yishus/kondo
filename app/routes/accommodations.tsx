import { resolveTripId } from "../trip-url.server";
import { env } from "cloudflare:workers";
import { useEffect, useRef, useState } from "react";
import { data, useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/accommodations";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { accommodationAction } from "../accommodations.server";
import { getAccommodationsPage } from "../trip-page.server";
import { currencies, money, stayNights, type StayOption } from "../accommodations";
import type { Accommodation, AccommodationDocument } from "../db/schema";
import { CardLocationPicker } from "../components/card-location";
import { googleMapsUrl, type CardLocation } from "../card-location";
import { formatFileSize } from "../attachments";
import { Icon } from "../components/icon";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { places, trip } = await getAccommodationsPage(context, request, params.tripId);
  return { places, tripId: trip.code ?? trip.id };
}
export async function action({ params, request }: Route.ActionArgs) {
  const db = getDb(env.DB);
  const tripId = await resolveTripId(db, params.tripId);
  await requireTripOwner(request, db, tripId);
  try { return await accommodationAction(db, env.ATTACHMENTS, tripId, request); }
  catch { return data({ ok: false as const, error: "Could not save your changes. Please try again." }, { status: 500 }); }
}
export function meta() { return [{ title: "Accommodations · Kondo" }]; }

type Candidate = Accommodation & { document: AccommodationDocument | null };
type Place = Route.ComponentProps["loaderData"]["places"][number];
const input = "w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer";
const button = "inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed";
const primary = "inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary";
const secondary = "inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed";
const label = "grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium";
const documentUrl = (tripId: string, doc: AccommodationDocument) => `/trips/${encodeURIComponent(tripId)}/accommodations/${encodeURIComponent(doc.accommodationId)}/documents/${encodeURIComponent(doc.id)}`;
const dateLabel = (date: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

function CandidateEditor({ tripId, place, candidate, onClose }: { tripId: string; place: Place; candidate?: Candidate; onClose: () => void }) {
  const fetcher = useFetcher<typeof action>();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitted = useRef(false);
  const [options, setOptions] = useState<StayOption[]>(candidate?.dateOptions ?? []);
  const [currency, setCurrency] = useState(candidate?.currency ?? "SGD");
  const [confirmed, setConfirmed] = useState(candidate?.confirmedOptionId ?? "");
  const [freeCancellation, setFreeCancellation] = useState(candidate?.freeCancellation ?? false);
  const [location, setLocation] = useState<CardLocation>({ googlePlaceId: candidate?.googlePlaceId ?? null, googleMapsQuery: candidate?.googleMapsQuery ?? null });
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    if (fetcher.state === "idle" && submitted.current) {
      submitted.current = false;
      if (fetcher.data?.ok) onClose();
    }
  }, [fetcher.state, fetcher.data, onClose]);
  function changeOption(id: string, field: keyof StayOption, value: string) {
    setOptions((current) => current.map((option) => option.id === id ? { ...option, [field]: value } : option));
  }
  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="accommodation-heading" className="w-full max-h-[calc(100dvh-32px)] overflow-y-auto p-5 border border-border rounded-[10px] bg-surface text-foreground text-[13px] shadow-[0_8px_36px_rgb(0_0_0/12%)] [dialog]:fixed [dialog]:inset-0 [dialog]:w-[calc(100%-32px)] [dialog]:m-auto backdrop:[background:rgb(0_0_0/25%)] max-w-2xl">
    <div className="flex [align-items:start] justify-between gap-3 mb-5 [&_h2]:pt-1 [&_h2]:text-[15px] [&_h2]:font-[550] [&_h2]:tracking-[-.02em] [&_p]:mb-0.5 [&_p]:text-muted-foreground [&_p]:text-[11px]">
      <div><p>{place.name}</p><h2 id="accommodation-heading">{candidate ? "Accommodation details" : "Add accommodation"}</h2></div>
      <button type="button" aria-label="Close accommodation" disabled={busy} className="grid w-8 h-8 place-items-center rounded-md text-muted-foreground [&:hover]:bg-muted [&:hover]:text-foreground text-[20px] leading-none" onClick={onClose}>×</button>
    </div>
    <fetcher.Form method="post" encType="multipart/form-data" className="grid min-w-0 gap-4.5" onSubmit={() => { submitted.current = true; }}>
      <input type="hidden" name="intent" value={candidate ? "save-candidate" : "add-candidate"} />
      <input type="hidden" name="placeId" value={place.id} />
      <input type="hidden" name="accommodationId" value={candidate?.id ?? ""} />
      <input type="hidden" name="dateOptions" value={JSON.stringify(options)} />
      <input type="hidden" name="confirmedOptionId" value={confirmed} />
      <fieldset disabled={busy} className="grid min-w-0 gap-4.5">
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <label className={label}>Accommodation name<input autoFocus className={input} name="name" required maxLength={200} defaultValue={candidate?.name} placeholder="Hotel or Airbnb name" /></label>
          <label className={label}>Type<select className={input} name="kind" defaultValue={candidate?.kind ?? "hotel"}><option value="hotel">Hotel</option><option value="airbnb">Airbnb</option></select></label>
        </div>
        <CardLocationPicker tripId={tripId} location={location} onChange={setLocation} disabled={busy} />
        <section className="grid min-w-0 gap-3 pt-4.5 border-t border-t-border [&_>_legend]:float-left [&_>_legend]:w-full [&_>_legend]:mb-0 [&_>_legend_+_*]:clear-both" aria-label="Date and price options">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-secondary-foreground text-[12px] font-medium">Dates & prices</h3><p className="mt-1.5 text-muted-foreground text-[12px] leading-[1.6]">Compare total prices, including taxes and fees.</p></div>
            <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium w-28">Currency<select name="currency" className={input} value={currency} onChange={(event) => setCurrency(event.target.value)}>{currencies.map((code) => <option key={code}>{code}</option>)}</select></label>
          </div>
          {!options.length && <p className="py-2 text-xs text-muted-foreground">Add a date option when you have a quote.</p>}
          {options.map((option, index) => {
            const nights = stayNights(option.checkIn, option.checkOut);
            return <fieldset key={option.id} className="min-w-0 p-[12px_0] border-t border-t-border [&_legend]:pr-2 [&_legend]:text-secondary-foreground [&_legend]:text-[12px] [&_legend]:font-medium">
              <legend>Option {index + 1}{confirmed === option.id ? " · Confirmed stay" : ""}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>Check-in<input className={input} type="date" required value={option.checkIn} onChange={(event) => changeOption(option.id, "checkIn", event.target.value)} /></label>
                <label className={label}>Check-out<input className={input} type="date" required min={option.checkIn || undefined} value={option.checkOut} onChange={(event) => changeOption(option.id, "checkOut", event.target.value)} /></label>
                <label className={label}>Total cost<input className={input} type="number" required min="0" max="999999999.99" step="0.01" value={option.totalCost} onChange={(event) => changeOption(option.id, "totalCost", event.target.value)} /></label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm" aria-live="polite">{nights && option.totalCost !== "" && Number.isFinite(Number(option.totalCost)) ? `${nights} ${nights === 1 ? "night" : "nights"} · ${money(Number(option.totalCost) / nights, currency)} / night` : "Choose dates and a total price to calculate cost per night."}</p>
                <button className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 border border-transparent rounded-md text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 disabled:opacity-[.45] disabled:cursor-not-allowed px-2 text-destructive hover:bg-destructive-soft" type="button" aria-label={`Remove option ${index + 1}`} onClick={() => { setOptions((current) => current.filter((item) => item.id !== option.id)); if (confirmed === option.id) setConfirmed(""); }}>Remove</button>
              </div>
              <label className="flex items-center gap-2 text-secondary-foreground text-[12px] font-normal [&_input]:accent-primary mt-2"><input type="radio" name="confirmSelection" checked={confirmed === option.id} onChange={() => setConfirmed(option.id)} />Confirm this stay</label>
            </fieldset>;
          })}
          <div className="flex flex-wrap gap-2"><button className={secondary} type="button" disabled={options.length >= 50} onClick={() => setOptions((current) => [...current, { id: crypto.randomUUID(), checkIn: "", checkOut: "", totalCost: "" }])}>+ Add date option</button>
            {confirmed && <button className={secondary} type="button" onClick={() => setConfirmed("")}>Mark as unconfirmed</button>}</div>
        </section>
        <section className="grid min-w-0 gap-3 pt-4.5 border-t border-t-border [&_>_legend]:float-left [&_>_legend]:w-full [&_>_legend]:mb-0 [&_>_legend_+_*]:clear-both" aria-label="Booking details">
          <div><h3 className="text-secondary-foreground text-[12px] font-medium">Booking details</h3><p className="mt-1.5 text-muted-foreground text-[12px] leading-[1.6]">{confirmed ? "Your selected dates will be marked confirmed when you save." : "Select a date option above to confirm this accommodation."}</p></div>
          <label className={label}>Booked via<input className={input} name="bookedVia" maxLength={200} defaultValue={candidate?.bookedVia} placeholder="e.g. Booking.com, Airbnb, hotel website" /></label>
          <label className="flex items-center gap-2 text-secondary-foreground text-[12px] font-normal [&_input]:accent-primary"><input type="checkbox" name="freeCancellation" checked={freeCancellation} onChange={(event) => setFreeCancellation(event.target.checked)} />Free cancellation</label>
          {freeCancellation && <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Free cancellation until<input className={input} type="datetime-local" name="cancellationUntil" required defaultValue={candidate?.cancellationUntil} /></label>
            <label className={label}>Cancellation time zone<input className={input} name="cancellationTimezone" required defaultValue={candidate?.cancellationTimezone} placeholder="e.g. Asia/Tokyo" /><span className="text-xs font-normal text-muted-foreground">Use the time zone on your booking.</span></label>
          </div>}
          <label className={label}>Description<textarea className="w-full min-w-0 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer min-h-28 resize-y" name="description" maxLength={10000} defaultValue={candidate?.description} placeholder="Who made the booking, confirmation number, room details…" /></label>
          {candidate?.document && <div className="p-[12px_0] border-b border-b-border text-xs">
            <a className="font-semibold text-primary hover:underline" href={documentUrl(tripId, candidate.document)} target="_blank" rel="noreferrer">{candidate.document.filename}</a><span className="ml-2 text-muted-foreground">{formatFileSize(candidate.document.size)}</span>
            <a className="ml-3 text-primary hover:underline" href={`${documentUrl(tripId, candidate.document)}?download`} download>Download PDF</a>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="removeDocument" />Remove booking PDF</label>
          </div>}
          <label className={label}>{candidate?.document ? "Replace booking PDF" : "Booking confirmation PDF"}<input className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:mr-3 file:cursor-pointer file:font-semibold" type="file" name="document" accept="application/pdf,.pdf" /><span className="text-xs font-normal text-muted-foreground">One PDF, up to 10 MB. Uploaded when you save.</span></label>
        </section>
      </fieldset>
      {fetcher.data?.error && <p role="alert" className="text-sm font-medium text-destructive">{fetcher.data.error}</p>}
      <div className="flex flex-wrap [justify-content:end] gap-1.5 pt-4 border-t border-t-border">
        {candidate && <button type="button" disabled={busy} className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 disabled:opacity-[.45] disabled:cursor-not-allowed mr-auto text-destructive hover:bg-destructive-soft" onClick={() => {
          if (!window.confirm(`Delete “${candidate.name}” and its booking PDF? This cannot be undone.`)) return;
          submitted.current = true;
          fetcher.submit({ intent: "delete-candidate", placeId: place.id, accommodationId: candidate.id }, { method: "post" });
        }}>Delete accommodation</button>}
        <button className={secondary} type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Save accommodation"}</button>
      </div>
    </fetcher.Form>
  </dialog>;
}

function PlaceSection({ place, tripId, onEdit }: { place: Place; tripId: string; onEdit: (candidate?: Candidate) => void }) {
  const fetcher = useFetcher<typeof action>();
  const [renaming, setRenaming] = useState(false);
  const submitted = useRef(false);
  useEffect(() => { if (fetcher.state === "idle" && submitted.current) { submitted.current = false; if (fetcher.data?.ok) setRenaming(false); } }, [fetcher.state, fetcher.data]);
  return <section aria-label={`Accommodations in ${place.name}`} className="min-w-0 pt-5.5 border-t border-t-border">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div><h3 className="text-[15px] font-medium tracking-[-.02em]">{place.name}</h3><p className="mt-1.5 text-muted-foreground text-[12px] leading-[1.6]">{place.candidates.length} {place.candidates.length === 1 ? "candidate" : "candidates"} · {place.candidates.filter((candidate) => candidate.confirmedOptionId).length} confirmed</p></div>
      <div className="flex flex-wrap gap-1"><button type="button" className={secondary} onClick={() => setRenaming(!renaming)}>Edit place</button><button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed border-border bg-surface" onClick={() => onEdit()}><Icon name="plus" width="14" height="14" />Add accommodation</button></div>
    </div>
    {renaming && <fetcher.Form method="post" className="mb-5 flex max-w-2xl flex-wrap items-end gap-2" onSubmit={() => { submitted.current = true; }}>
      <input type="hidden" name="intent" value="rename-place" /><input type="hidden" name="placeId" value={place.id} />
      <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium flex-1">City / area / region<input className={input} name="name" defaultValue={place.name} required maxLength={200} /></label>
      <button className={primary} disabled={fetcher.state !== "idle"}>Save place</button>
      <button className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted disabled:opacity-[.45] disabled:cursor-not-allowed text-destructive" type="button" disabled={fetcher.state !== "idle"} onClick={() => { if (window.confirm(`Delete “${place.name}”, all its accommodations and booking PDFs? This cannot be undone.`)) fetcher.submit({ intent: "delete-place", placeId: place.id }, { method: "post" }); }}>Delete place</button>
    </fetcher.Form>}
    {fetcher.data?.error && <p role="alert" className="mb-3 text-sm text-destructive">{fetcher.data.error}</p>}
    {!place.candidates.length && <p className="p-[18px_0] text-muted-foreground text-[12px]">Start a shortlist of hotels and Airbnbs for {place.name}.</p>}
    <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {place.candidates.map((candidate) => <article key={candidate.id} className="min-w-0 p-4 border border-border rounded-[7px] bg-surface shadow-(--shadow)">
        <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-normal"><Icon name="bed" width="13" height="13" />{candidate.kind === "hotel" ? "Hotel" : "Airbnb"}</span><span className="flex items-center gap-1.25 text-muted-foreground text-[11px] data-[confirmed='true']:text-foreground" data-confirmed={Boolean(candidate.confirmedOptionId)}>{candidate.confirmedOptionId && <span aria-hidden="true">✓</span>}{candidate.confirmedOptionId ? "Confirmed" : "Shortlisted"}</span></div>
        <button type="button" className="block max-w-full mt-2.25 text-[14px] font-medium text-left wrap-anywhere [&:hover]:underline [&:hover]:underline-offset-[3px]" onClick={() => onEdit(candidate)}>{candidate.name}</button>
        {candidate.googlePlaceId && <a className="mt-2 block text-xs wrap-break-word text-muted-foreground hover:text-foreground hover:underline" href={googleMapsUrl(candidate.googlePlaceId, candidate.googleMapsQuery ?? candidate.name)} target="_blank" rel="noreferrer">{candidate.googleMapsQuery || "View address on Google Maps"} ↗</a>}
        <ul className="mt-4">
          {candidate.dateOptions.map((option) => <li key={option.id} className="py-3 border-t border-t-border text-[12px] data-[confirmed='true']:border-t-input" data-confirmed={option.id === candidate.confirmedOptionId}>
            {option.id === candidate.confirmedOptionId && <p className="mb-2 text-[11px] text-secondary-foreground">Confirmed dates</p>}
            <p>{dateLabel(option.checkIn)} → {dateLabel(option.checkOut)}</p><p className="mt-2 font-medium">{money(Number(option.totalCost), candidate.currency)} total</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stayNights(option.checkIn, option.checkOut)} nights · {money(Number(option.totalCost) / stayNights(option.checkIn, option.checkOut), candidate.currency)} / night</p>
          </li>)}
        </ul>
        {!candidate.dateOptions.length && <p className="mt-3 text-xs text-muted-foreground">No date options yet</p>}
        {candidate.bookedVia && <p className="mt-3 text-xs text-secondary-foreground">Booked via {candidate.bookedVia}</p>}
        {candidate.freeCancellation ? <p className="mt-2 text-xs text-secondary-foreground">Free cancellation until {candidate.cancellationUntil.replace("T", " at ")} ({candidate.cancellationTimezone})</p> : candidate.confirmedOptionId && <p className="mt-2 text-xs text-muted-foreground">Free cancellation not indicated</p>}
        {candidate.description && <p className="mt-3 line-clamp-3 text-xs leading-relaxed whitespace-pre-wrap wrap-break-word text-muted-foreground">{candidate.description}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3.5 pt-2.5 border-t border-t-border">
          {candidate.document && <a className="min-w-0 text-xs wrap-break-word text-secondary-foreground hover:underline" href={documentUrl(tripId, candidate.document)} target="_blank" rel="noreferrer">PDF · {candidate.document.filename}</a>}
          <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed ml-auto" onClick={() => onEdit(candidate)}>Edit details<Icon name="arrow" width="13" height="13" /></button>
        </div>
      </article>)}
    </div>
  </section>;
}

export default function Accommodations({ loaderData: { places, tripId } }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  const [editor, setEditor] = useState<{ place: Place; candidate?: Candidate } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const linkedPlace = places.find((place) => place.candidates.some((candidate) => candidate.id === editId));
  const activeEditor = editor ?? (linkedPlace ? { place: linkedPlace, candidate: linkedPlace.candidates.find((candidate) => candidate.id === editId) } : null);
  function closeEditor() {
    setEditor(null);
    if (searchParams.has("edit")) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("edit");
        return next;
      }, { replace: true, preventScrollReset: true });
    }
  }
  useEffect(() => { if (fetcher.state === "idle" && submitted.current) { submitted.current = false; if (fetcher.data?.ok) form.current?.reset(); } }, [fetcher.state, fetcher.data]);
  return <>
    <div className="mb-5"><h2 className="text-[15px] font-medium tracking-[-.02em]">A place to stay</h2><p className="mt-1.5 text-muted-foreground text-[12px] leading-[1.6]">Shortlist stays, compare dates and prices, and keep your bookings together.</p></div>
    <fetcher.Form ref={form} method="post" className="mb-7 flex max-w-xl flex-wrap items-end gap-2" onSubmit={() => { submitted.current = true; }}>
      <input type="hidden" name="intent" value="add-place" />
      <label className="grid gap-1.5 text-secondary-foreground text-[12px] font-medium min-w-48 flex-1">City / area / region<input className={input} name="name" required maxLength={200} placeholder="e.g. Tokyo, Lake District, Tuscany" /></label>
      <button type="submit" className={primary} disabled={fetcher.state !== "idle"}>{fetcher.state === "idle" ? "Add place" : "Adding…"}</button>
      {fetcher.data?.error && <p role="alert" className="w-full text-sm text-destructive">{fetcher.data.error}</p>}
    </fetcher.Form>
    {!places.length && <div className="p-[18px_0] text-muted-foreground text-[12px]"><h3 className="text-[13px] font-medium text-secondary-foreground">Where would you like to stay?</h3><p className="mt-2">Add your first city, area, or region to start comparing accommodations.</p></div>}
    <div className="grid gap-6">{places.map((place) => <PlaceSection key={place.id} place={place} tripId={tripId} onEdit={(candidate) => setEditor({ place, candidate })} />)}</div>
    {activeEditor && <CandidateEditor key={activeEditor.candidate?.id ?? activeEditor.place.id} tripId={tripId} place={activeEditor.place} candidate={activeEditor.candidate} onClose={closeEditor} />}
  </>;
}
