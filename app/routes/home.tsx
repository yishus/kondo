import { createTrip } from "../trip-url.server";
import { env } from "cloudflare:workers";
import { asc, eq, max, min } from "drizzle-orm";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/home";
import { requireUser } from "../auth.server";
import { getDb } from "../db.server";
import { tripDays, tripOwners, trips } from "../db/schema";
import { formatTripDates, getTripPeriod, type TripPeriod } from "../trip-dates";
import { AppShell } from "../components/app-shell";
import { Icon } from "../components/icon";
import { readTimezone } from "../timezones";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUser = await requireUser(request);
  const db = getDb(env.DB);
  const tripRows = await db
    .select({
      id: trips.id,
      code: trips.code,
      title: trips.title,
      description: trips.description,
      start: min(tripDays.tripDate),
      end: max(tripDays.tripDate),
    })
    .from(trips)
    .innerJoin(
      tripOwners,
      eq(tripOwners.tripId, trips.id),
    )
    .leftJoin(tripDays, eq(tripDays.tripId, trips.id))
    .where(eq(tripOwners.userId, currentUser.id))
    .groupBy(trips.id, trips.title, trips.description)
    .orderBy(asc(trips.id));

  return {
    trips: tripRows,
    currentUser,
    today: new Date().toISOString().slice(0, 10),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUser = await requireUser(request);
  const formData = await request.formData();
  const title = formString(formData, "title").trim();

  if (!title) {
    return data(
      { ok: false as const, error: "Enter a title for your trip." },
      { status: 400 },
    );
  }

  if (title.length > 100) {
    return data(
      { ok: false as const, error: "Keep the title under 100 characters." },
      { status: 400 },
    );
  }

  const timezone = readTimezone(formData.get("timezone"));
  if (!timezone.ok) return data(timezone, { status: 400 });
  const db = getDb(env.DB);
  const trip = await createTrip(db, { title, timezone: timezone.timezone }, currentUser.id);
  return redirect(`/trips/${trip.code}`);
}

export function meta() {
  return [
    { title: "Trips | kondo" },
    {
      name: "description",
      content: "Create a trip and organize each day on a simple planning board.",
    },
  ];
}

export default function Home({ actionData, loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const tripsByPeriod: Record<TripPeriod, (typeof loaderData.trips)[number][]> = {
    current: [],
    upcoming: [],
    past: [],
  };
  for (const trip of loaderData.trips) {
    tripsByPeriod[getTripPeriod(trip.start, trip.end, loaderData.today)].push(trip);
  }
  const tripSections: Array<{ id: TripPeriod; title: string; emptyMessage: string }> = [
    { id: "current", title: "Current", emptyMessage: "No trips are happening right now." },
    { id: "upcoming", title: "Upcoming", emptyMessage: "No upcoming trips yet." },
    { id: "past", title: "Past", emptyMessage: "No past trips yet." },
  ];

  return (
    <AppShell user={loaderData.currentUser}>
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-6 [&_h1]:text-[21px] [&_h1]:font-[550] [&_h1]:tracking-[-.035em] [&_h1]:leading-[1.3] [&_h1]:wrap-anywhere">
          <div>
            <h1>Your trips</h1>
          </div>
          <span className="flex items-center gap-1.75 text-muted-foreground text-[12px]"><Icon name="trips" width="15" height="15" />{loaderData.trips.length} {loaderData.trips.length === 1 ? "trip" : "trips"}</span>
        </header>

        <Form
          className="mb-8 pb-6.5 border-b border-b-border"
          method="post"
        >
          <label className="block mb-2.5 text-secondary-foreground text-[12px] font-medium" htmlFor="trip-title">
            Add a new trip
          </label>
          <div className="flex gap-2.5 max-[600px]:flex-col">
            <input
              className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer flex-1"
              id="trip-title"
              name="title"
              type="text"
              maxLength={100}
              placeholder="e.g. Japan in spring"
              aria-describedby={actionData?.error ? "trip-title-error" : undefined}
              aria-invalid={Boolean(actionData?.error)}
              required
              disabled={busy}
            />
            <button
              className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Creating…" : "Add trip"}
            </button>
          </div>
          {actionData?.error && (
            <p
              className="mt-2 text-sm font-medium text-destructive"
              id="trip-title-error"
            >
              {actionData.error}
            </p>
          )}
        </Form>

        {loaderData.trips.length === 0 ? (
          <section className="p-[18px_0] text-muted-foreground text-[12px] py-16 text-center">
            <h2 className="text-lg font-semibold">No trips yet</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Add a title above to create your first trip.
            </p>
          </section>
        ) : (
          <div className="space-y-10" aria-label="Created trips">
            {tripSections.map((section) => {
              const sectionTrips = tripsByPeriod[section.id] ?? [];

              return (
                <section key={section.id} aria-labelledby={`${section.id}-trips-heading`}>
                  <div className="flex items-center gap-2.25 mb-3 [&_h2]:text-secondary-foreground [&_h2]:text-[12px] [&_h2]:font-medium">
                    <h2 id={`${section.id}-trips-heading`}>
                      {section.title}
                    </h2>
                    <span className="inline-grid min-w-5 h-5 place-items-center p-[0_4px] text-muted-foreground text-[11px] font-normal tabular-nums">
                      {sectionTrips.length}
                    </span>
                  </div>
                  {sectionTrips.length === 0 ? (
                    <p className="p-[18px_0] text-muted-foreground text-[12px]">
                      {section.emptyMessage}
                    </p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4">
                      {sectionTrips.map((trip) => (
                        <Link
                          className="block min-w-0 p-4.25 border border-border rounded-[7px] bg-surface transition-[border-color] duration-150 [&:hover]:border-input [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:wrap-anywhere group"
                          key={trip.id}
                          to={`/trips/${trip.code ?? trip.id}`}
                        >
                          <div className="flex items-center justify-between gap-3 [&_svg]:shrink-0"><h3>
                            {trip.title}
                          </h3><Icon name="arrow" className="text-muted-foreground" width="15" height="15" /></div>
                          <p className="flex items-center gap-1.75 mt-3.5 text-muted-foreground text-[11px]">
                            <Icon name="calendar" width="14" height="14" />
                            {formatTripDates(trip.start, trip.end)}
                          </p>
                          {trip.description && <p className="mt-2 text-sm text-muted-foreground">{trip.description}</p>}
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
