import type { Route } from "./+types/trip-map";
import { TripPage } from "./trip";

// Both views use the same authorized loader, mutations, and card editor.
export { loader, action } from "./trip";
export { shouldRevalidateTripChat as shouldRevalidate } from "../trip-chat";

export default function TripMapPage({ loaderData }: Route.ComponentProps) {
  return <TripPage loaderData={loaderData} view="map" />;
}
