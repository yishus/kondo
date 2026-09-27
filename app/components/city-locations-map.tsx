import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

import { cityLocationTypeColor } from "../city-locations";
import type { CityCardLocation } from "../db/schema";
import { loadGoogleMaps } from "../google-maps";

type Place = {
  displayName?: string;
  location?: { lat(): number; lng(): number };
  fetchFields(options: { fields: string[] }): Promise<void>;
};

export function CityLocationsMap({ apiKey, locations }: {
  apiKey: string;
  locations: CityCardLocation[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const typeLegend = useMemo(() => Array.from(new Set(locations.map((location) => location.locationType))), [locations]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !apiKey || !mapRef.current || locations.length === 0) return;
    let cancelled = false;
    let map: LeafletMap | undefined;
    let resize: ResizeObserver | undefined;
    setStatus("loading");

    void (async () => {
      try {
        const [L, placesLibrary] = await Promise.all([
          import("leaflet"),
          loadGoogleMaps(apiKey).then((maps) => maps.importLibrary("places")),
        ]);
        if (cancelled || !mapRef.current) return;

        const Place = placesLibrary.Place as new (options: { id: string }) => Place;
        const settled = await Promise.allSettled(locations.map(async (location) => {
          const place = new Place({ id: location.googlePlaceId });
          await place.fetchFields({ fields: ["location", "displayName"] });
          if (!place.location || cancelled) return null;
          return {
            location,
            name: place.displayName || location.googleMapsQuery,
            position: L.latLng(place.location.lat(), place.location.lng()),
          };
        }));
        if (cancelled || !mapRef.current) return;
        const resolved = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
        if (resolved.length === 0) throw new Error("No place coordinates were available.");

        map = L.map(mapRef.current, { scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        for (const { location, name, position } of resolved) {
          const pin = document.createElement("div");
          pin.className = "flex size-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md";
          pin.style.backgroundColor = cityLocationTypeColor(location.locationType);
          pin.textContent = location.locationType.trim().slice(0, 1).toLocaleUpperCase();
          const popup = document.createElement("span");
          popup.textContent = name;
          L.marker(position, {
            title: name,
            alt: name,
            icon: L.divIcon({
              className: "city-location-pin",
              html: pin,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
              popupAnchor: [0, -14],
            }),
          }).bindPopup(popup, { maxWidth: 220 }).addTo(map);
        }
        map.fitBounds(L.latLngBounds(resolved.map(({ position }) => position)), { padding: [32, 32], maxZoom: 14 });
        resize = new ResizeObserver(() => map?.invalidateSize());
        resize.observe(mapRef.current);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      resize?.disconnect();
      map?.remove();
    };
  }, [apiKey, locations, visible]);

  return (
    <section ref={rootRef} className="overflow-hidden rounded-[10px] border border-border bg-surface/70" aria-label={`Map of ${locations.length} area ${locations.length === 1 ? "location" : "locations"}`}>
      <div className="relative isolate h-44 w-full overflow-hidden bg-muted">
        <div ref={mapRef} className="h-full w-full" />
        {(!apiKey || status !== "ready") && (
          <div role="status" className="absolute inset-0 z-[1000] grid place-items-center bg-muted px-5 text-center text-xs font-semibold text-muted-foreground">
            {!apiKey ? "Add a Google Maps browser API key to show this map." : status === "error" ? "The location map could not be loaded." : "Loading location map…"}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2" aria-label="Map pin legend">
        {typeLegend.map((type) => (
          <span key={type} className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-secondary-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cityLocationTypeColor(type) }} aria-hidden="true" />
            <span className="truncate">{type}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
