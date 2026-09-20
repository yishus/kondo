import { env } from "cloudflare:workers";
import { eq, max, min } from "drizzle-orm";
import { Form, Link, NavLink, Outlet, useFetcher } from "react-router";
import type { Route } from "./+types/trip-layout";
import type { action as ownersAction } from "./trip-owners";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { tripDays, trips } from "../db/schema";
import { formatTripDates } from "../trip-dates";
import { listTripOwners } from "../trip-owners.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const currentUser = await requireTripOwner(request, db, params.tripId);
  const [[trip], [dates], owners] = await Promise.all([
    db.select().from(trips).where(eq(trips.id, params.tripId)).limit(1),
    db.select({ start: min(tripDays.tripDate), end: max(tripDays.tripDate) })
      .from(tripDays).where(eq(tripDays.tripId, params.tripId)),
    listTripOwners(db, params.tripId),
  ]);
  if (!trip) throw new Response("Trip not found", { status: 404 });
  return { trip, dates, owners, currentUser };
}

export default function TripLayout({ loaderData: { trip, dates, owners, currentUser } }: Route.ComponentProps) {
  const base = `/trips/${encodeURIComponent(trip.id)}`;
  const dateSubtitle = formatTripDates(dates.start, dates.end);
  const ownerFetcher = useFetcher<typeof ownersAction>();
  const ownerError = ownerFetcher.data && !ownerFetcher.data.ok ? ownerFetcher.data.error : null;
  return <main className="min-h-screen bg-[#f4f6f8] px-[clamp(20px,5vw,72px)] py-14 font-sans text-[#172b4d] max-[760px]:pt-9">
    <header className="mb-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="inline-flex text-sm font-bold text-[#0c66e4] hover:text-[#0055cc]" to="/">← All trips</Link>
        <Form action="/sign-out" method="post"><button className="text-sm font-bold text-[#0c66e4] hover:text-[#0055cc]" type="submit">Sign out</button></Form>
      </div>
      <h1 className="text-[clamp(2rem,4vw,3.25rem)] font-bold tracking-[-0.04em]">{trip.title}</h1>
      <p className="mt-2.5 text-[#626f86]">{dateSubtitle}</p>
      {trip.description && <p className="mt-2.5 text-[#626f86]">{trip.description}</p>}
      <details className="mt-5 max-w-2xl rounded-xl border border-[#dcdfe4] bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold">Owners ({owners.length})</summary>
        <div className="mt-4 flex flex-wrap gap-2">
          {owners.map((owner) => <span key={owner.id} className="rounded-full bg-[#f1f2f4] px-3 py-1.5 text-sm text-[#44546f]">{owner.name}{owner.id === currentUser.id ? " (you)" : ""} · {owner.email}</span>)}
        </div>
        <ownerFetcher.Form action={`${base}/owners`} method="post" className="mt-4 flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 basis-64 gap-1.5 text-sm font-bold">Add an owner by account email<input className="h-10 rounded-[10px] border border-[#b6beca] px-3 font-normal outline-none focus:border-[#0c66e4] focus:ring-2 focus:ring-[#0c66e4]/20" name="email" type="email" autoComplete="email" required disabled={ownerFetcher.state !== "idle"} /></label>
          <button className="h-10 rounded-[10px] bg-[#0c66e4] px-4 text-sm font-bold text-white hover:bg-[#0055cc] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={ownerFetcher.state !== "idle"}>{ownerFetcher.state === "idle" ? "Add owner" : "Adding…"}</button>
        </ownerFetcher.Form>
        {ownerError && <p role="alert" className="mt-2 text-sm font-medium text-[#ae2a19]">{ownerError}</p>}
        {ownerFetcher.data?.ok && <p role="status" className="mt-2 text-sm font-medium text-[#216e4e]">Owner added.</p>}
      </details>
    </header>
    <nav aria-label="Trip tabs" className="mb-7 flex gap-6 border-b border-[#dcdfe4]">
      {[[base, "Itinerary"], [`${base}/accommodations`, "Accommodations"], [`${base}/notes`, "Notes"]].map(([to, label]) => <NavLink key={to} end to={to} className={({ isActive }) => `border-b-2 px-1 pb-3 text-sm font-bold ${isActive ? "border-[#0c66e4] text-[#0c66e4]" : "border-transparent text-[#626f86] hover:text-[#172b4d]"}`}>{label}</NavLink>)}
    </nav>
    <Outlet />
  </main>;
}
