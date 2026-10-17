import { and, asc, isNotNull } from "drizzle-orm";

import type { Database } from "./db.server";
import { tripIdentifierWhere } from "./trip-url.server";
import { tripOwnerCondition } from "./trip-access.server";
import { googleMapsUrl } from "./card-location";
import { estimateForDate } from "./transport-estimate";
import { effectiveTimezone, transportTimezone } from "./timezones";
import { UNSCHEDULED_COLUMN_ID, type TripCard, type TripColumn } from "./card-order";
import { estimateActivityDuration, writtenDuration, type EstimateCard } from "./day-estimate";

function liveTimingColumn(day: Omit<TripColumn, "cards" | "timezone"> & { cards: EstimateCard[] }) {
  const cards = day.cards.map((card): EstimateCard => {
    const classification = day.timeEstimate?.labels.find((label) => label.afterCardId === card.id)?.classification;
    const duration = writtenDuration(card) ?? (card.type === "location"
      ? estimateActivityDuration(card, day.date ?? "", day.effectiveTimezone || "UTC", classification).minutes : null);
    const estimate = estimateForDate(card.transportEstimate, day.date, transportTimezone(card, day.effectiveTimezone));
    // Retain timing inputs without sending descriptions, estimate notes or saved
    // label explanations to every live tab. Activity keywords are resolved here.
    return {
      id: card.id, type: card.type, title: card.title, description: duration === null ? "" : `${duration} minutes`,
      locationCategory: card.locationCategory, hikeDistanceKm: card.hikeDistanceKm, hikeElevationGainM: card.hikeElevationGainM,
      transportMode: card.transportMode, departureTime: card.departureTime, arrivalTime: card.arrivalTime,
      departureTimezone: card.departureTimezone, arrivalTimezone: card.arrivalTimezone,
      transportEstimate: estimate ? { ...estimate, note: null } : null,
    };
  });
  return { id: day.id, date: day.date, effectiveTimezone: day.effectiveTimezone, cards };
}

/** Only the trip heading and scheduled-card timing inputs needed by the live clock. */
export async function loadLiveTripHeader(db: Database, identifier: string, userId: string) {
  const row = await db.query.trips.findFirst({
    columns: { id: true, code: true, title: true, timezone: true },
    where: (trip) => and(tripIdentifierWhere(identifier), tripOwnerCondition(db, trip.id, userId)),
    with: {
      days: { columns: { id: true, tripDate: true, timezone: true, timeEstimate: true }, orderBy: (day) => asc(day.tripDate) },
      cards: {
        columns: { id: true, tripDayId: true, type: true, title: true, description: true, locationCategory: true,
          hikeDistanceKm: true, hikeElevationGainM: true, transportMode: true, departureTime: true, arrivalTime: true,
          departureTimezone: true, arrivalTimezone: true, transportEstimate: true },
        where: (card) => isNotNull(card.tripDayId),
        orderBy: (card) => [asc(card.position), asc(card.id)],
      },
    },
  });
  if (!row) throw new Response("Trip not found", { status: 404 });
  const { days, cards, ...trip } = row;
  return {
    trip,
    dates: { start: days[0]?.tripDate ?? null, end: days.at(-1)?.tripDate ?? null },
    timingColumns: days.map((day) => liveTimingColumn({
      id: day.id, date: day.tripDate, effectiveTimezone: effectiveTimezone(trip.timezone, day.timezone), timeEstimate: day.timeEstimate,
      cards: cards.filter((card) => card.tripDayId === day.id),
    })),
  };
}

/** Reuse the itinerary's board read when both matched loaders run together. */
export function liveTripHeaderFromBoard(board: Awaited<ReturnType<typeof loadTripBoard>>) {
  const { id, code, title, timezone } = board.trip;
  return { trip: { id, code, title, timezone }, dates: board.dates,
    timingColumns: board.tripColumns.filter((day) => day.date).map(liveTimingColumn) };
}

export async function loadTripHeader(db: Database, identifier: string, userId: string) {
  const row = await db.query.trips.findFirst({
    where: (trip) => and(tripIdentifierWhere(identifier), tripOwnerCondition(db, trip.id, userId)),
    with: {
      owners: { columns: {}, with: { user: { columns: { id: true, name: true, email: true } } } },
      days: { columns: { tripDate: true }, orderBy: (day) => asc(day.tripDate) },
    },
  });
  if (!row) throw new Response("Trip not found", { status: 404 });
  const { owners, days, ...trip } = row;
  return { trip, dates: { start: days[0]?.tripDate ?? null, end: days.at(-1)?.tripDate ?? null },
    owners: owners.map(({ user }) => user).sort((a, b) => compareText(a.name, b.name) || compareText(a.email, b.email)) };
}

export async function loadTripBoard(db: Database, tripId: string, userId: string) {
  const row = await db.query.trips.findFirst({
    where: (trip) => and(tripIdentifierWhere(tripId), tripOwnerCondition(db, trip.id, userId)),
    with: {
      owners: {
        columns: {},
        with: { user: { columns: { id: true, name: true, email: true } } },
      },
      days: { columns: { id: true, tripDate: true, timezone: true, timeEstimate: true }, orderBy: (day) => asc(day.tripDate) },
      cards: {
        columns: { cityGroupId: false },
        orderBy: (card) => [asc(card.position), asc(card.id)],
        with: {
          attachments: { orderBy: (attachment) => [asc(attachment.createdAt), asc(attachment.id)] },
          cityLocations: { orderBy: (location) => [asc(location.position), asc(location.id)] },
        },
      },
      places: {
        columns: { name: true },
        with: {
          accommodations: {
            columns: { id: true, name: true, dateOptions: true, confirmedOptionId: true, googlePlaceId: true, googleMapsQuery: true },
            where: (stay) => isNotNull(stay.confirmedOptionId),
          },
        },
      },
    },
  });
  if (!row) throw new Response("Trip not found", { status: 404 });

  const { owners, days, cards, places, ...trip } = row;
  const cardsByDay = new Map<string, TripCard[]>();
  for (const card of cards) {
    const day = days.find((day) => day.id === card.tripDayId);
    const columnId = card.tripDayId ?? UNSCHEDULED_COLUMN_ID;
    const column = cardsByDay.get(columnId) ?? [];
    column.push({ ...card, tripCode: trip.code ?? undefined, tripDayId: columnId,
      transportEstimate: estimateForDate(card.transportEstimate, day?.tripDate ?? null, transportTimezone(card, effectiveTimezone(trip.timezone, day?.timezone ?? null))),
    });
    cardsByDay.set(columnId, column);
  }
  const tripColumns: TripColumn[] = [
    { id: UNSCHEDULED_COLUMN_ID, date: null, timezone: null, effectiveTimezone: trip.timezone, cards: cardsByDay.get(UNSCHEDULED_COLUMN_ID) ?? [] },
    ...days.map((day) => ({ id: day.id, date: day.tripDate, timezone: day.timezone, effectiveTimezone: effectiveTimezone(trip.timezone, day.timezone), timeEstimate: day.timeEstimate, cards: cardsByDay.get(day.id) ?? [] })),
  ];
  const confirmedStays = places.flatMap((place) => place.accommodations.flatMap((stay) => {
    const dates = stay.dateOptions.find((option) => option.id === stay.confirmedOptionId);
    if (!dates) return [];
    const query = stay.googleMapsQuery || `${stay.name}, ${place.name}`;
    return [{
      id: stay.id,
      name: stay.name,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      mapsUrl: stay.googlePlaceId
        ? googleMapsUrl(stay.googlePlaceId, query)
        : `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`,
    }];
  })).sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));

  return {
    trip,
    tripColumns,
    confirmedStays,
    dates: { start: days[0]?.tripDate ?? null, end: days.at(-1)?.tripDate ?? null },
    owners: owners.map(({ user }) => user).sort((a, b) => compareText(a.name, b.name) || compareText(a.email, b.email)),
  };
}

function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
