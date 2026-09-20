import type { Card } from "./db/schema";

export const cardTypes = { location: "Location", city: "City / area / region", transport: "Transport" } as const;
export type CardType = keyof typeof cardTypes;
export const locationCategories = {
  place_of_interest: "Place of interest",
  food: "Food",
  hike: "Hike",
} as const;
export type LocationCategory = keyof typeof locationCategories;
export const transportModes = {
  unspecified: "To be decided", train: "Train", subway: "Subway", tram: "Tram",
  flight: "Flight", bus: "Bus", car: "Car", ferry: "Ferry", taxi: "Taxi", walk: "Walk", other: "Other",
} as const;
export type CardDetails = Pick<Card, "type" | "title" | "description" | "locationCategory" | "transportMode" | "startLocation" | "endLocation" | "departureTime" | "arrivalTime" | "serviceNumber">;

export function readCardDetails(form: FormData, existing?: Card) {
  const value = (key: keyof CardDetails) => {
    const field = form.get(key);
    return typeof field === "string" ? field.trim() : String(existing?.[key] ?? "");
  };
  const type = value("type") || "location";
  const fail = (error: string) => ({ ok: false as const, error });
  if (!Object.hasOwn(cardTypes, type)) return fail("Choose a valid card type.");
  // Changing types could discard location data or attachments. Create a new card instead.
  if (existing && type !== existing.type) return fail("A card’s type cannot be changed.");
  const locationCategory = type === "location" ? value("locationCategory") : "";
  if (locationCategory && !Object.hasOwn(locationCategories, locationCategory)) {
    return fail("Choose a valid location subcategory.");
  }
  const transportMode = type === "transport" ? value("transportMode") : null;
  const startLocation = type === "transport" ? value("startLocation") : "";
  const endLocation = type === "transport" ? value("endLocation") : "";
  const departureTime = type === "transport" ? value("departureTime") : "";
  const arrivalTime = type === "transport" ? value("arrivalTime") : "";
  const serviceNumber = type === "transport" ? value("serviceNumber") : "";
  if (type === "transport") {
    if (!transportMode || !Object.hasOwn(transportModes, transportMode)) return fail("Choose a mode of transport.");
    if (!startLocation || !endLocation) return fail("Enter both the start and end locations.");
    if ([departureTime, arrivalTime].some((time) => time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return fail("Enter valid departure and arrival times.");
  }
  const title = type === "transport" ? `${startLocation} → ${endLocation}` : value("title");
  if (!title) return fail(type === "city" ? "Enter a city, area, or region name." : "Card title cannot be empty.");
  return { ok: true as const, details: {
    type: type as CardType, title, description: type === "city" ? "" : value("description"),
    locationCategory: locationCategory ? locationCategory as LocationCategory : null,
    transportMode, startLocation, endLocation, departureTime, arrivalTime, serviceNumber,
  } };
}
