import type { CardAttachment, Card, CityCardLocation } from "./db/schema";
import type { CardLocation } from "./card-location";
import { estimateForDate } from "./transport-estimate";

// UI/drop-target ID only; unscheduled cards have a null trip_day_id in storage.
export const UNSCHEDULED_COLUMN_ID = "unscheduled";

export type TripCard = CardLocation & Pick<Card, "tripId" | "type" | "locationCategory" | "hikeDistanceKm" | "hikeElevationGainM" | "coverAttachmentId" | "transportMode" | "startLocation" | "endLocation" | "startLocationName" | "endLocationName" | "departureTime" | "arrivalTime" | "departureTimezone" | "arrivalTimezone" | "serviceNumber" | "transportEstimate"> & {
  id: string;
  tripDayId: string;
  title: string;
  description: string;
  attachments: CardAttachment[];
  cityLocations: CityCardLocation[];
  googlePhoto?: Card["googlePhoto"];
};

export type TripColumn = {
  id: string;
  date: string | null;
  timezone: string | null;
  effectiveTimezone: string | null;
  timeEstimate?: import("./day-estimate").DayEstimate | null;
  cards: TripCard[];
};

export type CardDestination = {
  tripDayId: string;
  beforeCardId: string | null;
};

export type CardMove = CardDestination & { cardId: string; fromDayId: string };

export function insertCard<T extends { id: string }>(
  cards: T[], card: T, beforeCardId: string | null,
) {
  const remaining = cards.filter((item) => item.id !== card.id);
  const index = beforeCardId
    ? remaining.findIndex((item) => item.id === beforeCardId)
    : remaining.length;
  if (index < 0) return cards;
  return [...remaining.slice(0, index), card, ...remaining.slice(index)];
}

export function previewCardMove(columns: TripColumn[], move: CardMove) {
  const card = columns.flatMap((column) => column.cards).find((card) => card.id === move.cardId);
  const destination = columns.find((column) => column.id === move.tripDayId);
  if (!card || !destination || move.beforeCardId === card.id) return columns;
  if (move.beforeCardId && !destination.cards.some((item) => item.id === move.beforeCardId)) return columns;
  const reordered = insertCard(destination.cards, card, move.beforeCardId);
  if (card.tripDayId === move.tripDayId && reordered.every((item, index) => item.id === destination.cards[index]?.id)) return columns;

  return columns.map((column) => ({
    ...column,
    timeEstimate: column.timeEstimate ? { ...column.timeEstimate, labels: column.timeEstimate.labels.filter((label) => label.afterCardId !== card.id) } : column.timeEstimate,
    cards: column.id === move.tripDayId
      ? insertCard(column.cards, { ...card, tripDayId: move.tripDayId,
        transportEstimate: estimateForDate(card.transportEstimate, destination.date, destination.effectiveTimezone),
      }, move.beforeCardId)
      : column.cards.filter((item) => item.id !== card.id),
  }));
}
