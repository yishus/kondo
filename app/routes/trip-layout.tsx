import { redirectLegacyTripUrl, resolveTripId } from "../trip-url.server";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { data, Link, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/trip-layout";
import { requireTripOwner, requireUser } from "../auth.server";
import { getDb } from "../db.server";
import { getAccommodationsPage, getNotesPage, getTripPage, isAccommodationsRequest, isNotesRequest, isTripBoardRequest } from "../trip-page.server";
import { trips } from "../db/schema";
import { formatTripDates } from "../trip-dates";
import { loadTripHeader } from "../trip-data.server";
import { AppShell } from "../components/app-shell";
import { Icon, type IconName } from "../components/icon";
import { TimezoneOptions } from "../components/timezone-field";
import { readTimezone } from "../timezones";

export { shouldRevalidateTripChat as shouldRevalidate } from "../trip-chat";

export async function action({ params, request }: Route.ActionArgs) {
  const db = getDb(env.DB);
  const tripId = await resolveTripId(db, params.tripId);
  await requireTripOwner(request, db, tripId);
  const form = await request.formData();
  if (form.get("intent") !== "update-timezone") return data({ ok: false as const, error: "Unknown action." }, { status: 400 });
  const result = readTimezone(form.get("timezone"));
  if (!result.ok) return data(result, { status: 400 });
  await db.update(trips).set({ timezone: result.timezone }).where(eq(trips.id, tripId));
  return { ok: true as const, error: null };
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  if (isTripBoardRequest(request, params.tripId)) {
    const { trip, dates, owners, currentUser } = await getTripPage(context, request, params.tripId);
    redirectLegacyTripUrl(request, trip);
    return { trip, dates, owners, currentUser };
  }
  if (isAccommodationsRequest(request, params.tripId)) {
    const { trip, dates, owners, currentUser } = await getAccommodationsPage(context, request, params.tripId);
    redirectLegacyTripUrl(request, trip);
    return { trip, dates, owners, currentUser };
  }
  if (isNotesRequest(request, params.tripId)) {
    const { trip, dates, owners, currentUser } = await getNotesPage(context, request, params.tripId);
    redirectLegacyTripUrl(request, trip);
    return { trip, dates, owners, currentUser };
  }
  const db = getDb(env.DB);
  const currentUser = await requireUser(request);
  const { trip, dates, owners } = await loadTripHeader(db, params.tripId, currentUser.id);
  redirectLegacyTripUrl(request, trip);
  return { trip, dates, owners, currentUser };
}

export default function TripLayout({ loaderData: { trip, dates, currentUser } }: Route.ComponentProps) {
  const base = `/trips/${encodeURIComponent(trip.code ?? trip.id)}`;
  const dateSubtitle = formatTripDates(dates.start, dates.end);
  const navigation = <>
    <header className="flex flex-wrap items-center justify-between gap-3 mb-6 [&_h1]:text-[21px] [&_h1]:font-[550] [&_h1]:tracking-[-.035em] [&_h1]:leading-[1.3] [&_h1]:wrap-anywhere [@media(max-width:_760px)]:flex-col [@media(max-width:_760px)]:items-start [@media(max-width:_760px)]:[&_a]:min-h-11">
      <div className="min-w-0">
        <h1>{trip.title}</h1>
        {trip.description && <p className="mt-2 text-muted-foreground text-[13px] leading-[1.6]">{trip.description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 [@media(max-width:_760px)]:flex-col [@media(max-width:_760px)]:items-start">
        <span className="flex items-center gap-1.75 text-muted-foreground text-[12px]"><Icon name="calendar" width="15" height="15" />{dateSubtitle}</span>
        <Link to={`${base}/live`} className="inline-flex min-h-8.5 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.75 text-[12px] font-medium text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground"><Icon name="compass" width="16" height="16" />On the trip</Link>
      </div>
    </header>
    <div className="flex [align-items:start] mb-6.5">
    <nav aria-label="Trip tabs" className="flex gap-1 max-w-full overflow-x-auto p-0.75 border border-border rounded-lg bg-surface shadow-(--shadow) [@media(max-width:_760px)]:w-full [@media(max-width:_760px)]:flex-col [@media(max-width:_760px)]:border-0 [@media(max-width:_760px)]:p-0 [@media(max-width:_760px)]:shadow-none [@media(max-width:_760px)]:[&_a]:min-h-11">
      {([[base, "Itinerary", "board"], [`${base}/map`, "Map", "pin"], [`${base}/accommodations`, "Accommodations", "bed"], [`${base}/notes`, "Notes", "notes"], [`${base}/settings`, "Settings", "settings"]] satisfies [string, string, IconName][]).map(([to, label, icon]) => <NavLink key={to} end to={to} className="flex shrink-0 items-center gap-1.75 py-1.75 px-2.5 rounded-[5px] text-muted-foreground text-[12px] font-medium [&:hover]:bg-muted [&:hover]:text-foreground [&.active]:bg-muted [&.active]:text-foreground [@media(max-width:_760px)]:px-2"><Icon name={icon} width="16" height="16" />{label}</NavLink>)}
    </nav>
    </div>
  </>;
  return <AppShell user={currentUser} trip={trip} mobileNavigation={navigation}>
    <TimezoneOptions />
    <div className="[@media(max-width:_760px)]:hidden">{navigation}</div>
    <Outlet />
  </AppShell>;
}
