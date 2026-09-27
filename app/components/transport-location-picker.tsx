import { GoogleMapsPlacePicker } from "./google-maps-place-picker";

export function TransportLocationPicker({ tripId, name, label, value, placeName, onChange, disabled }: {
  tripId: string;
  name: "startLocation" | "endLocation";
  label: string;
  value: string;
  placeName: string;
  onChange: (value: string, placeName: string) => void;
  disabled: boolean;
}) {
  return <>
    <input type="hidden" name={name} value={value} />
    <input type="hidden" name={`${name}Name`} value={placeName} />
    <GoogleMapsPlacePicker tripId={tripId} label={label} disabled={disabled}
      value={value ? { name: placeName || value, query: value } : null}
      onChange={(place) => onChange(place
        ? [place.name, place.address].filter(Boolean).join(", ")
        : "", place?.name ?? "")}
    />
  </>;
}
