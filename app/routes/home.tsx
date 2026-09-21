import { env } from "cloudflare:workers";
import { asc, eq, max, min } from "drizzle-orm";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { v7 as uuidv7 } from "uuid";

import type { Route } from "./+types/home";
import { requireUser } from "../auth.server";
import { getDb } from "../db.server";
import { tripDays, tripOwners, trips } from "../db/schema";
import { formatTripDates, getTripPeriod, type TripPeriod } from "../trip-dates";
import { AppShell } from "../components/app-shell";
import { Icon } from "../components/icon";

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

  const id = uuidv7();
  const db = getDb(env.DB);
  await db.batch([
    db.insert(trips).values({ id, title }),
    db.insert(tripOwners).values({ tripId: id, userId: currentUser.id }),
  ]);

  return redirect(`/trips/${id}`);
}

export function meta() {
  return [
    { title: "Trips" },
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
      <div className="mx-auto max-w-6xl">
        <header className="page-heading">
          <div>
            <span className="eyebrow">A world of possibility</span>
            <h1>Your trips</h1>
            <p className="page-description">Pick up where you left off or start planning somewhere new.</p>
          </div>
          <span className="trip-count"><Icon name="trips" width="15" height="15" />{loaderData.trips.length} {loaderData.trips.length === 1 ? "trip" : "trips"}</span>
        </header>

        <Form
          className="new-trip-panel"
          method="post"
        >
          <label className="new-trip-title" htmlFor="trip-title">
            <Icon name="plus" />Add a new trip
          </label>
          <div className="flex gap-2.5 max-[600px]:flex-col">
            <input
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-input bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 aria-invalid:border-destructive"
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
              className="h-11 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
          <section className="empty-state py-16 text-center">
            <span className="mx-auto mb-5 grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground"><Icon name="compass" width="25" height="25" /></span>
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
                  <div className="trip-section-heading">
                    <h2 id={`${section.id}-trips-heading`}>
                      {section.title}
                    </h2>
                    <span className="count-badge">
                      {sectionTrips.length}
                    </span>
                  </div>
                  {sectionTrips.length === 0 ? (
                    <p className="empty-state">
                      {section.emptyMessage}
                    </p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4">
                      {sectionTrips.map((trip) => (
                        <Link
                          className="trip-preview group"
                          key={trip.id}
                          to={`/trips/${trip.id}`}
                        >
                          <div className="trip-preview-top"><span className="trip-preview-icon"><Icon name="compass" /></span><Icon name="arrow" className="text-muted-foreground transition group-hover:text-primary" width="17" height="17" /></div>
                          <h3>
                            {trip.title}
                          </h3>
                          <p className="trip-preview-date">
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
