import { and, asc, eq } from "drizzle-orm";
import type { Database } from "./db.server";
import { trips, tripChatContexts } from "./db/schema";
import { estimateActivityDuration, writtenDuration } from "./day-estimate";
import { CardChatError } from "./card-chat.server";

async function buildTripChatContext(db: Database, tripId: string) {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, tripId),
    with: {
      days: { orderBy: (day) => asc(day.tripDate) },
      cards: {
        columns: { id: true, tripDayId: true, type: true, title: true, description: true, position: true,
          googlePlaceId: true, googleMapsQuery: true, googlePlaceName: true, locationCategory: true, hikeDistanceKm: true, hikeElevationGainM: true,
          transportMode: true, startLocation: true, endLocation: true, startLocationName: true, endLocationName: true,
          departureTime: true, arrivalTime: true, departureTimezone: true, arrivalTimezone: true, serviceNumber: true, transportEstimate: true },
        orderBy: (card) => [asc(card.position), asc(card.id)],
        with: { cityLocations: { columns: { googlePlaceName: true, googleMapsQuery: true, locationType: true }, orderBy: (place) => asc(place.position) } },
      },
      places: { columns: { name: true }, with: { accommodations: { columns: {
        name: true, kind: true, dateOptions: true, confirmedOptionId: true, description: true, googleMapsQuery: true,
      } } } },
      notes: { columns: { body: true } },
      todos: { columns: { title: true, completed: true } },
    },
  });
  if (!trip) throw new Response("Trip not found", { status: 404 });
  const context = {
    ...trip, contextVersion: 2, description: trip.description.slice(0, 4000),
    // Preserve duration text and activity keywords beyond the shortened description.
    cards: trip.cards.map((card) => {
      const day = trip.days.find((day) => day.id === card.tripDayId);
      const classification = day?.timeEstimate?.labels.find((label) => label.afterCardId === card.id)?.classification;
      const timingDurationMinutes = writtenDuration(card) ?? (card.type === "location"
        ? estimateActivityDuration(card, day?.tripDate ?? "", day?.timezone || trip.timezone || "UTC", classification).minutes : null);
      return { ...card, timingDurationMinutes, description: card.description.slice(0, 1200) };
    }),
    notes: trip.notes?.body.slice(0, 12000) ?? "",
    places: trip.places.map((place) => ({ ...place, accommodations: place.accommodations.map((stay) => ({ ...stay, description: stay.description.slice(0, 1200) })) })),
    contextNote: "Descriptions and notes may be shortened. Attachments are not included. Day time estimates may predate edits. Current saved state supersedes conversation history.",
  };
  if (JSON.stringify(context).length > 240_000) throw new CardChatError("This trip is too large for trip chat right now. Please use a card's chat for a focused question.", 400);
  return context;
}

export type TripChatContext = Awaited<ReturnType<typeof buildTripChatContext>>;

/** Called after ownership authorization. Warm cache hits issue one read, no write. */
export async function loadTripChatContext(db: Database, tripId: string): Promise<TripChatContext> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let cached = await db.select().from(tripChatContexts).where(eq(tripChatContexts.tripId, tripId)).get();
    if (!cached) {
      const [created] = await db.insert(tripChatContexts).values({ tripId }).onConflictDoNothing().returning();
      cached = created ?? await db.select().from(tripChatContexts).where(eq(tripChatContexts.tripId, tripId)).get();
    }
    if (!cached) throw new Response("Trip not found", { status: 404 });
    // Older snapshots are rebuilt once to supply live timing without a board read.
    if (cached.context?.contextVersion === 2) return cached.context as TripChatContext;
    const context = await buildTripChatContext(db, tripId);
    const saved = await db.update(tripChatContexts).set({ context })
      .where(and(eq(tripChatContexts.tripId, tripId), eq(tripChatContexts.revision, cached.revision)))
      .returning({ tripId: tripChatContexts.tripId });
    if (saved.length) return context;
  }
  throw new CardChatError("The trip is being edited. Please try your question again in a moment.", 409);
}
