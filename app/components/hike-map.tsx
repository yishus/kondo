import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouteLoaderData } from "react-router";
import type { Map as LeafletMap, CircleMarker, TileLayer } from "leaflet";
import type { loader as rootLoader } from "../root";
import type { HikeTrack } from "../hike-gpx";
import type { loader as tripLoader } from "../routes/trip-layout";
import { loadHikeTrack } from "../hike-track-cache";
import { HikeElevationProfile } from "./hike-elevation-profile";
import type { HikeProfilePoint } from "../hike-profile";
import { Icon } from "./icon";
import "./hike-map.css";

type HikeMapProps = { url?: string; track?: HikeTrack; compact?: boolean; title?: string };

export function HikeFullscreenMap({ title = "Hike route", onClose, ...props }: HikeMapProps & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="hike-fullscreen-dialog" aria-label={`${title} full-screen map`}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onKeyDown={(event) => event.stopPropagation()}>
    <HikeMapView {...props} compact={false} fullscreen title={title} onClose={onClose} />
  </dialog>, document.body);
}

export function HikeMap(props: HikeMapProps) {
  const [fullscreen, setFullscreen] = useState(false);
  return <>
    <div className="relative">
      <HikeMapView {...props} />
      <button type="button" className="hike-map-expand" style={{ top: props.compact ? 128 : 248 }} aria-label="View hike map full screen" aria-haspopup="dialog" onClick={() => setFullscreen(true)}>
        <Icon name="expand" width="16" height="16" /> Full screen
      </button>
    </div>
    {fullscreen && <HikeFullscreenMap {...props} onClose={() => setFullscreen(false)} />}
  </>;
}

function HikeMapView({ url, track, compact = false, fullscreen = false, title, onClose }: HikeMapProps & { fullscreen?: boolean; onClose?: () => void }) {
  const thunderforestApiKey = useRouteLoaderData<typeof rootLoader>("root")?.thunderforestApiKey ?? "";
  const userId = useRouteLoaderData<typeof tripLoader>("routes/trip-layout")?.currentUser.id ?? "";
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const fitRoute = useRef<() => void>(() => {});
  const layers = useRef<Record<string, TileLayer>>({});
  const [activeLayer, setActiveLayer] = useState(thunderforestApiKey ? "Outdoors" : "Street");
  const [layersOpen, setLayersOpen] = useState(false);
  const profilePanel = useRef<HTMLDivElement>(null);
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
        map = L.map(element!, { scrollWheelZoom: fullscreen, zoomControl: !fullscreen, zoomAnimation: !fullscreen, attributionControl: true });
        mapRef.current = map;
        const openStreetMap = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        layers.current = { Street: openStreetMap };
        if (fullscreen && thunderforestApiKey) {
          const outdoors = L.tileLayer(`https://api.thunderforest.com/outdoors/{z}/{x}/{y}{r}.png?apikey=${encodeURIComponent(thunderforestApiKey)}`, {
            maxZoom: 22,
            attribution: 'Maps &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          });
          layers.current.Outdoors = outdoors;
          map.removeLayer(openStreetMap);
          outdoors.addTo(map);
        }
        setActiveLayer(fullscreen && thunderforestApiKey ? "Outdoors" : "Street");
        if (fullscreen) {
          L.polyline(route.segments, { color: "#28532a", weight: 9, opacity: 0.85, interactive: false }).addTo(map);
          L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
        }
        const line = L.polyline(route.segments, { color: fullscreen ? "#98da70" : "#15803d", weight: fullscreen ? 5 : 4 }).addTo(map);
        fitRoute.current = () => {
          if (!map) return;
          map.stop();
          const size = map.getSize();
          const panelHeight = profilePanel.current?.offsetHeight ?? 200;
          map.fitBounds(line.getBounds(), fullscreen ? {
            paddingTopLeft: [32, Math.min(110, size.y * 0.2)],
            paddingBottomRight: [size.x < 600 ? 76 : 100, Math.min(panelHeight + 56, size.y * 0.45)], maxZoom: 16, animate: false,
          } : { padding: [20, 20], maxZoom: 16, animate: false });
        };
        fitRoute.current();
        const start = route.segments[0][0];
        const end = route.segments.at(-1)!.at(-1)!;
        L.circleMarker(start, { radius: fullscreen ? 9 : 5, color: fullscreen ? "#fff" : "#166534", fillColor: fullscreen ? "#203824" : "#fff", fillOpacity: 1 }).bindTooltip("Start").addTo(map);
        L.circleMarker(end, { radius: fullscreen ? 9 : 5, color: fullscreen ? "#fff" : "#166534", fillColor: "#4da52f", fillOpacity: 1 }).bindTooltip("Finish").addTo(map);
        cursor.current = L.circleMarker(start, { radius: 7, color: "#fff", weight: 3, fillColor: "#15803d", opacity: 0, fillOpacity: 0,
          interactive: false, className: "hike-map-cursor",
        }).addTo(map);
        resize = new ResizeObserver(() => { map?.invalidateSize(); if (fullscreen) fitRoute.current(); });
        resize.observe(element!);
        if (fullscreen && profilePanel.current) resize.observe(profilePanel.current);
        setStatus("");
      } catch {
        if (!controller.signal.aborted) setStatus("Could not load the hike map. Reopen the card to try again.");
      }
    }
    void render();
    return () => { controller.abort(); resize?.disconnect(); cursor.current = null; mapRef.current = null; fitRoute.current = () => {}; layers.current = {}; map?.remove(); };
  }, [url, track, thunderforestApiKey, compact, userId, fullscreen]);

  return <div className={fullscreen ? "hike-fullscreen" : "overflow-hidden rounded-lg border border-border"}>
    <div className={fullscreen ? "hike-fullscreen-canvas" : "relative isolate"}>
      <div ref={container} role="region" aria-label="Hike route map" className={fullscreen ? "h-full w-full" : compact ? "h-[180px] w-full" : "h-[300px] w-full"} />
      {status && <p role="status" className="absolute inset-0 z-[1000] grid place-items-center bg-muted p-4 text-center text-xs text-muted-foreground">{status}</p>}
    </div>
    {fullscreen && <>
      <div className="hike-map-heading">
        <button type="button" className="hike-map-control" onClick={onClose} aria-label="Close full-screen map" autoFocus><Icon name="close" width="26" height="26" /></button>
        <div className="hike-map-title"><h2>{title}</h2></div>
      </div>
      <div className="hike-map-tools">
        <div className="hike-map-layers">
          <button type="button" className="hike-map-layer-trigger" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>
            <Icon name="globe" /> Map layers <Icon name="chevron" width="14" height="14" />
          </button>
          {layersOpen && <div className="hike-map-layer-options" aria-label="Map layers">
            {(thunderforestApiKey ? ["Outdoors", "Street"] : ["Street"]).map((name) => <button type="button" key={name} aria-pressed={activeLayer === name} disabled={Boolean(status)}
              onClick={() => {
                const map = mapRef.current;
                if (!map || !layers.current[name]) return;
                Object.values(layers.current).forEach((layer) => map.removeLayer(layer));
                layers.current[name].addTo(map);
                setActiveLayer(name);
              }}><span className={`hike-layer-swatch hike-layer-${name.toLowerCase()}`} aria-hidden="true" />{name}</button>)}
          </div>}
        </div>
        <button type="button" className="hike-map-control" aria-label="Zoom in" title="Zoom in" disabled={Boolean(status)} onClick={() => mapRef.current?.zoomIn()}><Icon name="plus" width="26" height="26" /></button>
        <button type="button" className="hike-map-control" aria-label="Zoom out" title="Zoom out" disabled={Boolean(status)} onClick={() => mapRef.current?.zoomOut()}><Icon name="minus" width="26" height="26" /></button>
        <button type="button" className="hike-map-control" aria-label="Fit route to screen" title="Fit route to screen" disabled={Boolean(status)} onClick={() => fitRoute.current()}><Icon name="expand" width="23" height="23" /></button>
        {url && <a className="hike-map-control" href={`${url}?download=1`} aria-label="Download GPX" title="Download GPX"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg></a>}
      </div>
    </>}
    {fullscreen && <div ref={profilePanel} className="hike-map-profile">
      {profileTrack && <HikeElevationProfile key={url} track={profileTrack} wide onHighlight={setHighlighted} />}
    </div>}
  </div>;
}
