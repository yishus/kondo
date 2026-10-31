import type { Card } from "./db/schema";
import { readCardLocation } from "./card-location";
import { readTimezone } from "./timezones";

export const cardTypes = { location: "Location", hike: "Hike", city: "City / area / region", transport: "Transport", event: "Event" } as const;
export type CardType = keyof typeof cardTypes;
export const locationCategories = {
  place_of_interest: "Place of interest",
  food: "Food",
} as const;
export type LocationCategory = keyof typeof locationCategories;
export const transportModes = {
  unspecified: "To be decided", train: "Train", subway: "Subway", tram: "Tram",
  flight: "Flight", bus: "Bus", car: "Car", ferry: "Ferry", taxi: "Taxi", walk: "Walk", other: "Other",
} as const;
export type CardDetails = Pick<Card, "type" | "title" | "description" | "locationCategory" | "hikeDistanceKm" | "hikeElevationGainM" | "transportMode" | "startLocation" | "endLocation" | "startLocationName" | "endLocationName" | "departureTime" | "arrivalTime" | "departureTimezone" | "arrivalTimezone" | "serviceNumber">;

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
  // Only the validated GPX upload may replace these measurements.
  const hikeDistanceKm = type === "hike" ? existing?.hikeDistanceKm ?? null : null;
  const hikeElevationGainM = type === "hike" ? existing?.hikeElevationGainM ?? null : null;
  const transportMode = type === "transport" ? value("transportMode") : null;
  const startLocation = type === "transport" ? value("startLocation") : "";
  const endLocation = type === "transport" ? value("endLocation") : "";
  // A legacy client changing the full address must not retain a stale short name.
  const endpointName = (field: "startLocation" | "endLocation") => {
    const nameField = `${field}Name` as "startLocationName" | "endLocationName";
    if (type !== "transport") return "";
    if (!form.has(nameField) && form.has(field) && value(field) !== existing?.[field]) return "";
    return value(nameField);
  };
  const startLocationName = endpointName("startLocation");
  const endLocationName = endpointName("endLocation");
  if (startLocationName.length > 300 || endLocationName.length > 300) return fail("Keep place names under 300 characters.");
  const departureTime = type === "transport" ? value("departureTime") : "";
  const arrivalTime = type === "transport" ? value("arrivalTime") : "";
  const departureZone = readTimezone(type === "transport" ? form.get("departureTimezone") ?? existing?.departureTimezone ?? null : null);
  if (!departureZone.ok) return fail(`Departure time zone: ${departureZone.error}`);
  const arrivalZone = readTimezone(type === "transport" ? form.get("arrivalTimezone") ?? existing?.arrivalTimezone ?? null : null);
  if (!arrivalZone.ok) return fail(`Arrival time zone: ${arrivalZone.error}`);
  const serviceNumber = type === "transport" ? value("serviceNumber") : "";
  if (type === "transport") {
    if (!transportMode || !Object.hasOwn(transportModes, transportMode)) return fail("Choose a mode of transport.");
    if (!startLocation || !endLocation) return fail("Enter both the start and end locations.");
    if ([departureTime, arrivalTime].some((time) => time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return fail("Enter valid departure and arrival times.");
  }
  let title = type === "transport" ? `${startLocationName || startLocation} → ${endLocationName || endLocation}` : value("title");
  if (!title && type === "location" && !existing) {
    const location = readCardLocation(form);
    if (!location.ok) return fail(location.error);
    title = location.location.googlePlaceName ?? "";
  }
  if (!title) return fail(type === "city" ? "Enter a city, area, or region name." : "Card title cannot be empty.");
  return { ok: true as const, details: {
    type: type as CardType, title, description: type === "city" ? "" : value("description"),
    locationCategory: locationCategory ? locationCategory as LocationCategory : null,
    hikeDistanceKm, hikeElevationGainM,
    transportMode, startLocation, endLocation, startLocationName, endLocationName, departureTime, arrivalTime, serviceNumber,
    departureTimezone: departureZone.timezone, arrivalTimezone: arrivalZone.timezone,
  } };
}
