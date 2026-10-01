import { resolveTripId } from "./trip-url.server";
import { env } from "cloudflare:workers";
import { createContext, type RouterContextProvider } from "react-router";

import { requireUser } from "./auth.server";
import { getDb } from "./db.server";
import { loadTripBoard } from "./trip-data.server";
import { asc, and, eq, exists } from "drizzle-orm";
import { tripOwners } from "./db/schema";

// The two matched loaders share a promise only for this request. A subsequent
// navigation/revalidation checks the session and ownership again.
const tripPageContext = createContext<Map<string, ReturnType<typeof loadPage>> | null>(null);
const accommodationsPageContext = createContext<Map<string, ReturnType<typeof loadAccommodationsPage>> | null>(null);
const notesPageContext = createContext<Map<string, ReturnType<typeof loadNotesPage>> | null>(null);

async function loadPage(request: Request, tripId: string) {
  const currentUser = await requireUser(request);
  const db = getDb(env.DB);
  tripId = await resolveTripId(db, tripId);
  return { ...await loadTripBoard(db, tripId, currentUser.id), currentUser };
}

async function loadAccommodationsPage(request: Request, tripId: string) {
  const currentUser = await requireUser(request);
  const db = getDb(env.DB);
  tripId = await resolveTripId(db, tripId);
  const row = await db.query.trips.findFirst({
    where: (trip) => and(eq(trip.id, tripId), exists(
      db.select({ tripId: tripOwners.tripId }).from(tripOwners)
        .where(and(eq(tripOwners.tripId, trip.id), eq(tripOwners.userId, currentUser.id))),
    )),
    with: {
      owners: { columns: {}, with: { user: { columns: { id: true, name: true, email: true } } } },
      days: { columns: { tripDate: true }, orderBy: (day) => asc(day.tripDate) },
      places: {
        orderBy: (place) => asc(place.id),
        with: {
          accommodations: {
            orderBy: (stay) => asc(stay.id),
            with: { document: true },
          },
        },
      },
    },
  });
  if (!row) throw new Response("Trip not found", { status: 404 });
  const { owners, days, places, ...trip } = row;
  return {
    trip,
    currentUser,
    dates: { start: days[0]?.tripDate ?? null, end: days.at(-1)?.tripDate ?? null },
    owners: owners.map(({ user }) => user).sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email)),
    places: places.map(({ accommodations, ...place }) => ({
      ...place,
      candidates: accommodations.map((accommodation) => ({
        ...accommodation,
        document: accommodation.document ?? null,
      })),
    })),
  };
}

async function loadNotesPage(request: Request, tripId: string) {
  const currentUser = await requireUser(request);
  const db = getDb(env.DB);
  tripId = await resolveTripId(db, tripId);
  const row = await db.query.trips.findFirst({
    where: (trip) => and(eq(trip.id, tripId), exists(
      db.select({ tripId: tripOwners.tripId }).from(tripOwners)
        .where(and(eq(tripOwners.tripId, trip.id), eq(tripOwners.userId, currentUser.id))),
    )),
    with: {
      owners: { columns: {}, with: { user: { columns: { id: true, name: true, email: true } } } },
      days: { columns: { tripDate: true }, orderBy: (day) => asc(day.tripDate) },
      notes: true,
      attachments: { orderBy: (attachment) => [asc(attachment.createdAt), asc(attachment.id)] },
      todos: { orderBy: (todo) => asc(todo.id) },
    },
  });
  if (!row) throw new Response("Trip not found", { status: 404 });
  const { owners, days, notes, todos, attachments, ...trip } = row;
  return {
    trip,
    currentUser,
    dates: { start: days[0]?.tripDate ?? null, end: days.at(-1)?.tripDate ?? null },
    owners: owners.map(({ user }) => user).sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email)),
    tripId: trip.code ?? trip.id,
    notes: notes?.body ?? "",
    attachments,
    todos,
  };
}

export function getTripPage(context: Readonly<RouterContextProvider>, request: Request, tripId: string) {
  let pages = context.get(tripPageContext);
  if (!pages) {
    pages = new Map();
    context.set(tripPageContext, pages);
  }
  let page = pages.get(tripId);
  if (!page) {
    page = loadPage(request, tripId);
    pages.set(tripId, page);
  }
  return page;
}

export function getAccommodationsPage(context: Readonly<RouterContextProvider>, request: Request, tripId: string) {
  let pages = context.get(accommodationsPageContext);
  if (!pages) {
    pages = new Map();
    context.set(accommodationsPageContext, pages);
  }
  let page = pages.get(tripId);
  if (!page) {
    page = loadAccommodationsPage(request, tripId);
    pages.set(tripId, page);
  }
  return page;
}

export function getNotesPage(context: Readonly<RouterContextProvider>, request: Request, tripId: string) {
  let pages = context.get(notesPageContext);
  if (!pages) {
    pages = new Map();
    context.set(notesPageContext, pages);
  }
  let page = pages.get(tripId);
  if (!page) {
    page = loadNotesPage(request, tripId);
    pages.set(tripId, page);
  }
  return page;
}

export function isTripBoardRequest(request: Request, tripId: string) {
  const pathname = new URL(request.url).pathname.replace(/\.data$/, "").replace(/\/$/, "");
  return pathname === `/trips/${encodeURIComponent(tripId)}` || pathname === `/trips/${encodeURIComponent(tripId)}/map`;
}

export function isAccommodationsRequest(request: Request, tripId: string) {
  const pathname = new URL(request.url).pathname.replace(/\.data$/, "").replace(/\/$/, "");
  return pathname === `/trips/${encodeURIComponent(tripId)}/accommodations`;
}

export function isNotesRequest(request: Request, tripId: string) {
  const pathname = new URL(request.url).pathname.replace(/\.data$/, "").replace(/\/$/, "");
  return pathname === `/trips/${encodeURIComponent(tripId)}/notes`;
}
