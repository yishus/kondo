import { useEffect, useMemo, useRef, useState } from "react";

import { cityLocationTypeColor } from "../city-locations";
import type { CityCardLocation } from "../db/schema";
import { loadGoogleMaps } from "../google-maps";

type MapInstance = {
  fitBounds(bounds: unknown, padding?: number): void;
  setCenter(position: unknown): void;
  setZoom(zoom: number): void;
};

type MarkerInstance = { map: MapInstance | null };

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
    let markers: MarkerInstance[] = [];
    setStatus("loading");

    void (async () => {
      try {
        const maps = await loadGoogleMaps(apiKey);
        const [mapsLibrary, markerLibrary, placesLibrary] = await Promise.all([
          maps.importLibrary("maps"),
          maps.importLibrary("marker"),
          maps.importLibrary("places"),
        ]);
        if (cancelled || !mapRef.current) return;

        const Map = mapsLibrary.Map as new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
        const LatLngBounds = mapsLibrary.LatLngBounds as new () => { extend(position: unknown): void; isEmpty(): boolean };
        const AdvancedMarkerElement = markerLibrary.AdvancedMarkerElement as new (options: Record<string, unknown>) => MarkerInstance;
        const PinElement = markerLibrary.PinElement as new (options: Record<string, unknown>) => HTMLElement & { element?: HTMLElement };
        const Place = placesLibrary.Place as new (options: { id: string }) => { location?: unknown; fetchFields(options: { fields: string[] }): Promise<void> };
        const map = new Map(mapRef.current, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          mapId: "DEMO_MAP_ID",
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        const bounds = new LatLngBounds();
        const settled = await Promise.allSettled(locations.map(async (location) => {
          const place = new Place({ id: location.googlePlaceId });
          await place.fetchFields({ fields: ["location"] });
          if (!place.location || cancelled) return null;
          const color = cityLocationTypeColor(location.locationType);
          const pin = new PinElement({
            background: color,
            borderColor: color,
            glyphColor: "#ffffff",
            glyphText: location.locationType.trim().slice(0, 1).toLocaleUpperCase(),
            scale: 0.9,
          });
          bounds.extend(place.location);
          const marker = new AdvancedMarkerElement({
            map,
            position: place.location,
            title: `${location.googleMapsQuery} · ${location.locationType}`,
            content: pin.element ?? pin,
          });
          return { marker, position: place.location };
        }));
        if (cancelled) return;
        const resolved = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
        markers = resolved.map(({ marker }) => marker);
        if (markers.length === 0 || bounds.isEmpty()) throw new Error("No place coordinates were available.");
        map.fitBounds(bounds, 44);
        if (resolved.length === 1) {
          map.setCenter(resolved[0].position);
          map.setZoom(14);
        }
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      markers.forEach((marker) => { marker.map = null; });
    };
  }, [apiKey, locations, visible]);

  return (
    <section ref={rootRef} className="overflow-hidden rounded-[10px] border border-[#dcdfe4] bg-white/70" aria-label={`Map of ${locations.length} area ${locations.length === 1 ? "location" : "locations"}`}>
      <div className="relative h-44 w-full overflow-hidden bg-[#eef1f4]">
        <div ref={mapRef} className="h-full w-full" />
        {(!apiKey || status !== "ready") && (
          <div className="absolute inset-0 grid place-items-center px-5 text-center text-xs font-semibold text-[#626f86]">
            {!apiKey ? "Add a Google Maps browser API key to show this map." : status === "error" ? "The location map could not be loaded." : "Loading location map…"}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2" aria-label="Map pin legend">
        {typeLegend.map((type) => (
          <span key={type} className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-[#44546f]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cityLocationTypeColor(type) }} aria-hidden="true" />
            <span className="truncate">{type}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
