import { redirect } from "react-router";
import type { Route } from "./+types/trip-live-itinerary-redirect";
import { getLiveTripPage } from "../trip-page.server";

// Keep saved links working after retiring the separate live itinerary.
export async function loader({ context, params, request }: Route.LoaderArgs) {
  const { trip } = await getLiveTripPage(context, request, params.tripId);
  return redirect(`/trips/${encodeURIComponent(trip.code ?? trip.id)}`, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
