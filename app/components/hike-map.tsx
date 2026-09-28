import { useEffect, useRef, useState } from "react";
import { useRouteLoaderData } from "react-router";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import type { loader as rootLoader } from "../root";
import type { HikeTrack } from "../hike-gpx";
import type { loader as tripLoader } from "../routes/trip-layout";
import { loadHikeTrack } from "../hike-track-cache";
import { HikeElevationProfile } from "./hike-elevation-profile";
import type { HikeProfilePoint } from "../hike-profile";

export function HikeMap({ url, track, compact = false }: { url?: string; track?: HikeTrack; compact?: boolean }) {
  const thunderforestApiKey = useRouteLoaderData<typeof rootLoader>("root")?.thunderforestApiKey ?? "";
  const userId = useRouteLoaderData<typeof tripLoader>("routes/trip-layout")?.currentUser.id ?? "";
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading hike map…");
  const cursor = useRef<CircleMarker | null>(null);
  const [highlighted, setHighlighted] = useState<HikeProfilePoint | null>(null);
  const [loadedTrack, setLoadedTrack] = useState<{ url: string; track: HikeTrack }>();
  const profileTrack = track ?? (loadedTrack?.url === url ? loadedTrack?.track : undefined);

  useEffect(() => {
    if (!cursor.current) return;
    if (highlighted) cursor.current.setLatLng(highlighted.coordinate);
    cursor.current.setStyle({ opacity: highlighted ? 1 : 0, fillOpacity: highlighted ? 1 : 0 });
  }, [highlighted, status]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const controller = new AbortController();
    let map: LeafletMap | undefined;
    let resize: ResizeObserver | undefined;
    setStatus("Loading hike map…");
    setHighlighted(null);
    async function render() {
      try {
        let route = track;
        if (!route) {
          if (!url) return;
          route = await loadHikeTrack(url, userId);
          if (controller.signal.aborted) return;
          setLoadedTrack({ url, track: route });
        }
        const L = await import("leaflet");
        if (controller.signal.aborted) return;
        map = L.map(element!, { scrollWheelZoom: false, attributionControl: true });
        const openStreetMap = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        if (thunderforestApiKey) {
          const outdoors = L.tileLayer(`https://api.thunderforest.com/outdoors/{z}/{x}/{y}{r}.png?apikey=${encodeURIComponent(thunderforestApiKey)}`, {
            maxZoom: 22,
            attribution: 'Maps &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          });
          L.control.layers({ OpenStreetMap: openStreetMap, "Thunderforest Outdoors": outdoors }, undefined, {
            collapsed: compact,
          }).addTo(map);
        }
        const line = L.polyline(route.segments, { color: "#15803d", weight: 4 }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [20, 20], maxZoom: 16 });
        const start = route.segments[0][0];
        const end = route.segments.at(-1)!.at(-1)!;
        L.circleMarker(start, { radius: 5, color: "#166534", fillColor: "#fff", fillOpacity: 1 }).bindTooltip("Start").addTo(map);
        L.circleMarker(end, { radius: 5, color: "#166534", fillColor: "#166534", fillOpacity: 1 }).bindTooltip("Finish").addTo(map);
        cursor.current = L.circleMarker(start, { radius: 7, color: "#fff", weight: 3, fillColor: "#15803d", opacity: 0, fillOpacity: 0,
          interactive: false, className: "hike-map-cursor",
        }).addTo(map);
        resize = new ResizeObserver(() => map?.invalidateSize());
        resize.observe(element!);
        setStatus("");
      } catch {
        if (!controller.signal.aborted) setStatus("Could not load the hike map. Reopen the card to try again.");
      }
    }
    void render();
    return () => { controller.abort(); resize?.disconnect(); cursor.current = null; map?.remove(); };
  }, [url, track, thunderforestApiKey, compact, userId]);

  return <div className="overflow-hidden rounded-lg border border-border">
    <div className="relative isolate">
      <div ref={container} role="region" aria-label="Hike route map" className={compact ? "h-[180px] w-full" : "h-[300px] w-full"} />
      {status && <p role="status" className="absolute inset-0 z-[1000] grid place-items-center bg-muted p-4 text-center text-xs text-muted-foreground">{status}</p>}
    </div>
    {!compact && profileTrack && <HikeElevationProfile key={url} track={profileTrack} onHighlight={setHighlighted} />}
  </div>;
}
