import type { ShouldRevalidateFunctionArgs } from "react-router";
import type { ChatMessage } from "./card-chat";
import { cardTypes, locationCategories, transportModes, type CardType } from "./card-types";

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
  addedCardId?: string;
};
export type TripChatMessage = ChatMessage & { suggestions?: TripCardSuggestion[] };
export type TripChatData = {
  messages?: TripChatMessage[];
  available?: boolean;
  error?: string;
  completed?: string;
  tripChanged?: boolean;
};

export function readTripSuggestion(value: unknown): Omit<TripCardSuggestion, "id" | "addedCardId"> | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const limits = { type: 20, title: 300, description: 4000, locationQuery: 200, locationCategory: 30, transportMode: 30, startLocation: 300, endLocation: 300 };
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof item[field] !== "string" || item[field].length > limit) return null;
  }
  if (!Object.hasOwn(cardTypes, item.type as string) || !(item.title as string).trim()) return null;
  if (item.locationCategory !== "" && !Object.hasOwn(locationCategories, item.locationCategory as string)) return null;
  if (item.transportMode !== "" && !Object.hasOwn(transportModes, item.transportMode as string)) return null;
  if (item.type === "transport" && (!item.transportMode || !(item.startLocation as string).trim() || !(item.endLocation as string).trim())) return null;
  if (item.date !== null && (typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0, 10) !== item.date)) return null;
  // Copy known fields only. IDs and saved status are always assigned by the server.
  return Object.fromEntries([...Object.keys(limits).map((field) => [field, (item[field] as string).trim()]), ["date", item.date]]) as Omit<TripCardSuggestion, "id" | "addedCardId">;
}

/** Ordinary chat turns do not change the map, photos, or parent trip header. */
export function shouldRevalidateTripChat(args: ShouldRevalidateFunctionArgs) {
  const endpoint = `/trips/${encodeURIComponent(args.currentParams.tripId ?? "")}/chat`;
  if (args.currentUrl.pathname === args.nextUrl.pathname && args.currentUrl.search === args.nextUrl.search
    && args.formAction && new URL(args.formAction, args.currentUrl).pathname === endpoint
    && args.actionResult) {
    return (args.actionResult as TripChatData).tripChanged === true;
  }
  return args.defaultShouldRevalidate;
}
