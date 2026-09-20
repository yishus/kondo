import { env } from "cloudflare:workers";
import { asc, eq, max, min } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { v7 as uuidv7 } from "uuid";

import type { Route } from "./+types/home";
import { requireUser } from "../auth.server";
import { getDb } from "../db.server";
import { tripDays, tripOwners, trips } from "../db/schema";
import { formatTripDates, getTripPeriod, type TripPeriod } from "../trip-dates";

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
    <main className="min-h-screen bg-[#f4f6f8] px-[clamp(20px,5vw,72px)] py-14 font-sans text-[#172b4d] max-[760px]:pt-9">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold tracking-[0.12em] text-[#0c66e4] uppercase">Trip planner</p>
            <div className="flex items-center gap-3 text-sm text-[#626f86]">
              <span>{loaderData.currentUser.name}</span>
              <Form action="/sign-out" method="post">
                <button className="font-bold text-[#0c66e4] hover:text-[#0055cc]" type="submit">Sign out</button>
              </Form>
            </div>
          </div>
          <h1 className="text-[clamp(2rem,4vw,3.25rem)] font-bold tracking-[-0.04em]">
            Your trips
          </h1>
          <p className="mt-2.5 text-[#626f86]">
            Pick up where you left off or start planning somewhere new.
          </p>
        </header>

        <Form
          className="mb-10 rounded-2xl border border-[#dcdfe4] bg-white p-5 shadow-[0_1px_2px_rgb(9_30_66_/_10%)]"
          method="post"
        >
          <label className="mb-2 block text-sm font-bold" htmlFor="trip-title">
            Add a new trip
          </label>
          <div className="flex gap-2.5 max-[600px]:flex-col">
            <input
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#b6beca] bg-white px-3 text-sm outline-none transition focus:border-[#0c66e4] focus:ring-2 focus:ring-[#0c66e4]/20 aria-invalid:border-[#ae2a19]"
              id="trip-title"
              name="title"
              type="text"
              maxLength={100}
              placeholder="e.g. Japan in spring"
              aria-describedby={actionData?.error ? "trip-title-error" : undefined}
              aria-invalid={Boolean(actionData?.error)}
              required
            />
            <button
              className="h-11 rounded-[10px] bg-[#0c66e4] px-5 text-sm font-bold text-white transition hover:bg-[#0055cc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4]"
              type="submit"
            >
              Add trip
            </button>
          </div>
          {actionData?.error && (
            <p
              className="mt-2 text-sm font-medium text-[#ae2a19]"
              id="trip-title-error"
            >
              {actionData.error}
            </p>
          )}
        </Form>

        {loaderData.trips.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-[#b6beca] bg-white/60 px-6 py-12 text-center">
            <h2 className="text-lg font-bold">No trips yet</h2>
            <p className="mt-1.5 text-sm text-[#626f86]">
              Add a title above to create your first trip.
            </p>
          </section>
        ) : (
          <div className="space-y-10" aria-label="Created trips">
            {tripSections.map((section) => {
              const sectionTrips = tripsByPeriod[section.id] ?? [];

              return (
                <section key={section.id} aria-labelledby={`${section.id}-trips-heading`}>
                  <div className="mb-4 flex items-center gap-2.5">
                    <h2 className="text-xl font-bold tracking-[-0.02em]" id={`${section.id}-trips-heading`}>
                      {section.title}
                    </h2>
                    <span className="rounded-full bg-[#dcdfe4] px-2 py-0.5 text-xs font-bold text-[#44546f]">
                      {sectionTrips.length}
                    </span>
                  </div>
                  {sectionTrips.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#b6beca] bg-white/60 px-5 py-7 text-sm text-[#626f86]">
                      {section.emptyMessage}
                    </p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                      {sectionTrips.map((trip) => (
                        <Link
                          className="group rounded-2xl border border-[#dcdfe4] bg-white p-5 shadow-[0_1px_2px_rgb(9_30_66_/_10%)] transition hover:-translate-y-0.5 hover:border-[#b6beca] hover:shadow-[0_5px_12px_rgb(9_30_66_/_12%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4]"
                          key={trip.id}
                          to={`/trips/${trip.id}`}
                        >
                          <h3 className="font-bold tracking-[-0.01em] group-hover:text-[#0c66e4]">
                            {trip.title}
                          </h3>
                          <p className="mt-2 text-sm text-[#626f86]">
                            {formatTripDates(trip.start, trip.end)}
                          </p>
                          {trip.description && <p className="mt-2 text-sm text-[#626f86]">{trip.description}</p>}
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
    </main>
  );
}
