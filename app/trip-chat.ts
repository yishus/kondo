import type { ShouldRevalidateFunctionArgs } from "react-router";
import type { ChatMessage } from "./card-chat";
import { cardTypes, locationCategories, transportModes, type CardType } from "./card-types";
import { readTimezone } from "./timezones";

export type TripCardSuggestion = {
  id: string;
  type: CardType;
  title: string;
  description: string;
  date: string | null;
  locationQuery: string;
  locationCategory: string;
  transportMode: string;
  startLocation: string;
  endLocation: string;
  departureTime: string;
  arrivalTime: string;
  departureTimezone: string;
  arrivalTimezone: string;
  serviceNumber: string;
  addedCardId?: string;
};
export const cardUpdateFields = {
  title: "Title", description: "Description", locationCategory: "Category",
  transportMode: "Transport mode", startLocation: "Start location", endLocation: "End location",
  startLocationName: "Start place name", endLocationName: "End place name",
  departureTime: "Departure time", arrivalTime: "Arrival time",
  departureTimezone: "Departure time zone", arrivalTimezone: "Arrival time zone", serviceNumber: "Service number",
} as const;
export type CardUpdateField = keyof typeof cardUpdateFields;
export type CardUpdateRequest = { cardId: string; changes: Partial<Record<CardUpdateField, string>> };
export type TripCardUpdate = {
  id: string;
  cardId: string;
  cardTitle: string;
  cardType: CardType;
  tripDayId: string | null;
  before: Record<CardUpdateField, string>;
  after: Record<CardUpdateField, string>;
  status: "pending" | "applied" | "rejected";
};
export type TripChatMessage = ChatMessage & { suggestions?: TripCardSuggestion[]; updates?: TripCardUpdate[] };

export function cardUpdateChanges(update: TripCardUpdate) {
  return (Object.keys(cardUpdateFields) as CardUpdateField[]).filter((field) => update.before[field] !== update.after[field])
    .map((field) => ({ field, before: update.before[field], after: update.after[field] }));
}
export type TripChatData = {
  messages?: TripChatMessage[];
  available?: boolean;
  error?: string;
  completed?: string;
  tripChanged?: boolean;
};

export function readCardUpdateRequest(value: unknown): CardUpdateRequest | null {
  if (!value || typeof value !== "object") return null;
  const { cardId, changes } = value as Record<string, unknown>;
  if (typeof cardId !== "string" || !cardId.trim() || cardId.length > 100 || !changes || typeof changes !== "object" || Array.isArray(changes)) return null;
  const patch: CardUpdateRequest["changes"] = {};
  for (const [field, value] of Object.entries(changes)) {
    if (!Object.hasOwn(cardUpdateFields, field)) return null;
    if (value === null) continue; // Null means leave unchanged; empty strings explicitly clear a field.
    const limit = field === "description" ? 4000 : ["departureTime", "arrivalTime"].includes(field) ? 5 : 300;
    if (typeof value !== "string" || value.length > limit) return null;
    patch[field as CardUpdateField] = value.trim();
  }
  if (!Object.keys(patch).length) return null;
  return { cardId: cardId.trim(), changes: patch };
}

export function readTripSuggestion(value: unknown): Omit<TripCardSuggestion, "id" | "addedCardId"> | null {
  if (!value || typeof value !== "object") return null;
  const item = { ...value } as Record<string, unknown>;
  const transportLimits = { departureTime: 5, arrivalTime: 5, departureTimezone: 100, arrivalTimezone: 100, serviceNumber: 100 };
  // Suggestions saved before transport schedules were supported have no such fields.
  for (const field of Object.keys(transportLimits)) if (item[field] === undefined) item[field] = "";
  const limits = { type: 20, title: 300, description: 4000, locationQuery: 200, locationCategory: 30, transportMode: 30, startLocation: 300, endLocation: 300, ...transportLimits };
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof item[field] !== "string" || item[field].length > limit) return null;
  }
  if (!Object.hasOwn(cardTypes, item.type as string) || !(item.title as string).trim()) return null;
  if (item.locationCategory !== "" && !Object.hasOwn(locationCategories, item.locationCategory as string)) return null;
  if (item.transportMode !== "" && !Object.hasOwn(transportModes, item.transportMode as string)) return null;
  if (item.type === "transport" && (!item.transportMode || !(item.startLocation as string).trim() || !(item.endLocation as string).trim())) return null;
  for (const field of ["departureTime", "arrivalTime"] as const) {
    const time = (item[field] as string).trim();
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  }
  for (const field of ["departureTimezone", "arrivalTimezone"] as const) {
    const zone = readTimezone(item[field] as string);
    if (!zone.ok) return null;
    item[field] = zone.timezone ?? "";
  }
  if (item.date !== null && (typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0, 10) !== item.date)) return null;
  // Copy known fields only. IDs and saved status are always assigned by the server.
  return Object.fromEntries([...Object.keys(limits).map((field) => [field, (item[field] as string).trim()]), ["date", item.date]]) as Omit<TripCardSuggestion, "id" | "addedCardId">;
}

/** Ordinary chat turns do not change the map, photos, or parent trip header. */
export function shouldRevalidateTripChat(args: ShouldRevalidateFunctionArgs) {
  const base = `/trips/${encodeURIComponent(args.currentParams.tripId ?? "")}`;
  const endpoint = args.formAction ? new URL(args.formAction, args.currentUrl).pathname : null;
  if (args.currentUrl.pathname === args.nextUrl.pathname && args.currentUrl.search === args.nextUrl.search
    && (endpoint === `${base}/chat` || endpoint === `${base}/live/chat`)
    && args.actionResult) {
    return (args.actionResult as TripChatData).tripChanged === true;
  }
  return args.defaultShouldRevalidate;
}
