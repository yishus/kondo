import { TripChat } from "../components/trip-chat";
import { useLiveTrip } from "./trip-live-layout";

export default function TripLive() {
  const { trip } = useLiveTrip();
  return <TripChat key={trip.id} tripId={trip.code ?? trip.id} columns={[]} live />;
}
