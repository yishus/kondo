import { and, asc, eq, exists, isNotNull } from "drizzle-orm";

import type { Database } from "./db.server";
import { tripOwners } from "./db/schema";
import { googleMapsUrl } from "./card-location";
import { UNSCHEDULED_COLUMN_ID, type TripCard, type TripColumn } from "./card-order";

export async function loadTripBoard(db: Database, tripId: string, userId: string) {
  const row = await db.query.trips.findFirst({
    where: (trip) => and(eq(trip.id, tripId), exists(
      db.select({ tripId: tripOwners.tripId }).from(tripOwners)
        .where(and(eq(tripOwners.tripId, trip.id), eq(tripOwners.userId, userId))),
    )),
    with: {
      owners: {
        columns: {},
        with: { user: { columns: { id: true, name: true, email: true } } },
      },
      days: { columns: { id: true, tripDate: true }, orderBy: (day) => asc(day.tripDate) },
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
    const columnId = card.tripDayId ?? UNSCHEDULED_COLUMN_ID;
    const column = cardsByDay.get(columnId) ?? [];
    column.push({ ...card, tripDayId: columnId });
    cardsByDay.set(columnId, column);
  }
  const tripColumns: TripColumn[] = [
    { id: UNSCHEDULED_COLUMN_ID, date: null, cards: cardsByDay.get(UNSCHEDULED_COLUMN_ID) ?? [] },
    ...days.map((day) => ({ id: day.id, date: day.tripDate, cards: cardsByDay.get(day.id) ?? [] })),
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
