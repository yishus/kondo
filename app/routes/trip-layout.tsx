import { env } from "cloudflare:workers";
import { eq, max, min } from "drizzle-orm";
import { NavLink, Outlet, useFetcher } from "react-router";
import type { Route } from "./+types/trip-layout";
import type { action as ownersAction } from "./trip-owners";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { getTripPage, isTripBoardRequest } from "../trip-page.server";
import { tripDays, trips } from "../db/schema";
import { formatTripDates } from "../trip-dates";
import { listTripOwners } from "../trip-owners.server";
import { AppShell } from "../components/app-shell";
import { Icon, type IconName } from "../components/icon";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  if (isTripBoardRequest(request, params.tripId)) {
    const { trip, dates, owners, currentUser } = await getTripPage(context, request, params.tripId);
    return { trip, dates, owners, currentUser };
  }
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
  return <AppShell user={currentUser} trip={trip}>
    <header className="page-heading">
      <div className="min-w-0">
        <h1>{trip.title}</h1>
        {trip.description && <p className="page-description">{trip.description}</p>}
      </div>
      <span className="trip-count"><Icon name="calendar" width="15" height="15" />{dateSubtitle}</span>
    </header>
    <div className="trip-tools">
      <details className="owners-panel">
        <summary><Icon name="users" width="16" height="16" /><span>Owners ({owners.length})</span><Icon name="chevron" width="14" height="14" /></summary>
        <div className="owners-content">
        <div className="flex flex-wrap gap-2">
          {owners.map((owner) => <span key={owner.id} className="rounded-full bg-muted px-3 py-1.5 text-sm text-secondary-foreground">{owner.name}{owner.id === currentUser.id ? " (you)" : ""} · {owner.email}</span>)}
        </div>
        <ownerFetcher.Form action={`${base}/owners`} method="post" className="mt-4 flex flex-wrap items-end gap-2">
          <label className="ui-field flex-1 basis-64">Add an owner by account email<input className="ui-input" name="email" type="email" autoComplete="email" required disabled={ownerFetcher.state !== "idle"} /></label>
          <button className="ui-button ui-button-primary" type="submit" disabled={ownerFetcher.state !== "idle"}>{ownerFetcher.state === "idle" ? "Add owner" : "Adding…"}</button>
        </ownerFetcher.Form>
        {ownerError && <p role="alert" className="mt-2 text-sm font-medium text-destructive">{ownerError}</p>}
        {ownerFetcher.data?.ok && <p role="status" className="mt-2 text-sm font-medium text-success">Owner added.</p>}
        </div>
      </details>
    <nav aria-label="Trip tabs" className="trip-tabs">
      {([[base, "Itinerary", "board"], [`${base}/accommodations`, "Accommodations", "bed"], [`${base}/notes`, "Notes", "notes"]] satisfies [string, string, IconName][]).map(([to, label, icon]) => <NavLink key={to} end to={to} className="trip-tab"><Icon name={icon} width="16" height="16" />{label}</NavLink>)}
    </nav>
    </div>
    <Outlet />
  </AppShell>;
}
