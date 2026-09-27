import type { CardLocation } from "../card-location";
import { GoogleMapsPlacePicker } from "./google-maps-place-picker";

export function CardLocationPicker({ tripId, location, onChange, disabled }: {
  tripId: string;
  location: CardLocation;
  onChange: (location: CardLocation) => void;
  disabled: boolean;
}) {
  return <>
    <input type="hidden" name="googlePlaceId" value={location.googlePlaceId ?? ""} />
    <input type="hidden" name="googleMapsQuery" value={location.googleMapsQuery ?? ""} />
    <input type="hidden" name="googlePlaceName" value={location.googlePlaceName ?? ""} />
    <GoogleMapsPlacePicker tripId={tripId} label="Google Maps location" optional disabled={disabled}
      value={location.googlePlaceId ? {
        name: location.googlePlaceName || "Location added", query: location.googleMapsQuery ?? "Location", placeId: location.googlePlaceId,
      } : null}
      onChange={(place, query) => onChange({ googlePlaceId: place?.id ?? null, googleMapsQuery: place ? query : null, googlePlaceName: place?.name ?? null })}
    />
  </>;
}
