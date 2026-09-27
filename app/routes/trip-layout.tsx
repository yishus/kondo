import { env } from "cloudflare:workers";
import { eq, max, min } from "drizzle-orm";
import { data, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/trip-layout";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { getAccommodationsPage, getNotesPage, getTripPage, isAccommodationsRequest, isNotesRequest, isTripBoardRequest } from "../trip-page.server";
import { tripDays, trips } from "../db/schema";
import { formatTripDates } from "../trip-dates";
import { listTripOwners } from "../trip-owners.server";
import { AppShell } from "../components/app-shell";
import { Icon, type IconName } from "../components/icon";
import { TimezoneOptions } from "../components/timezone-field";
import { readTimezone } from "../timezones";

export async function action({ params, request }: Route.ActionArgs) {
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  const form = await request.formData();
  if (form.get("intent") !== "update-timezone") return data({ ok: false as const, error: "Unknown action." }, { status: 400 });
  const result = readTimezone(form.get("timezone"));
  if (!result.ok) return data(result, { status: 400 });
  await db.update(trips).set({ timezone: result.timezone }).where(eq(trips.id, params.tripId));
  return { ok: true as const, error: null };
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  if (isTripBoardRequest(request, params.tripId)) {
    const { trip, dates, owners, currentUser } = await getTripPage(context, request, params.tripId);
    return { trip, dates, owners, currentUser };
  }
  if (isAccommodationsRequest(request, params.tripId)) {
    const { trip, dates, owners, currentUser } = await getAccommodationsPage(context, request, params.tripId);
    return { trip, dates, owners, currentUser };
  }
  if (isNotesRequest(request, params.tripId)) {
    const { trip, dates, owners, currentUser } = await getNotesPage(context, request, params.tripId);
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

export default function TripLayout({ loaderData: { trip, dates, currentUser } }: Route.ComponentProps) {
  const base = `/trips/${encodeURIComponent(trip.id)}`;
  const dateSubtitle = formatTripDates(dates.start, dates.end);
  return <AppShell user={currentUser} trip={trip}>
    <TimezoneOptions />
    <header className="page-heading">
      <div className="min-w-0">
        <h1>{trip.title}</h1>
        {trip.description && <p className="page-description">{trip.description}</p>}
      </div>
      <span className="trip-count"><Icon name="calendar" width="15" height="15" />{dateSubtitle}</span>
    </header>
    <div className="trip-tools">
    <nav aria-label="Trip tabs" className="trip-tabs">
      {([[base, "Itinerary", "board"], [`${base}/map`, "Map", "pin"], [`${base}/accommodations`, "Accommodations", "bed"], [`${base}/notes`, "Notes", "notes"], [`${base}/settings`, "Settings", "settings"]] satisfies [string, string, IconName][]).map(([to, label, icon]) => <NavLink key={to} end to={to} className="trip-tab"><Icon name={icon} width="16" height="16" />{label}</NavLink>)}
    </nav>
    </div>
    <Outlet />
  </AppShell>;
}
