import { useEffect, useMemo, useRef, useState } from "react";

import { loadGoogleMaps } from "../google-maps";
import { buildTransportRoutePlan, buildTransportRouteRequest, googleTransportDirectionsUrl } from "../transport-route";

type GoogleMap = {
  fitBounds(bounds: unknown, padding?: number): void;
};

type MapConstructor = new (
  element: HTMLElement,
  options: Record<string, unknown>,
) => GoogleMap;

type MapPolyline = { setMap(map: GoogleMap | null): void };
type MapMarker = { map: GoogleMap | null };

type TransitAgency = { name?: string; url?: URL | string };
type TransitStep = {
  transitDetails?: {
    transitLine?: {
      agencies?: TransitAgency[];
      name?: string;
      shortName?: string;
      vehicle?: { name?: string };
    };
  };
};

type ComputedRoute = {
  createPolylines(): MapPolyline[];
  createWaypointAdvancedMarkers(options: { map: GoogleMap }): Promise<MapMarker[]>;
  legs?: Array<{ steps?: TransitStep[] }>;
  localizedValues?: {
    distance?: string;
    duration?: string;
    transitFare?: string;
  };
  viewport?: unknown;
};

type RouteApi = {
  computeRoutes(request: Record<string, unknown>): Promise<{ routes?: ComputedRoute[] }>;
};

type RouteSummary = {
  agencies: Array<{ name: string; url?: string }>;
  distance?: string;
  duration?: string;
  fare?: string;
  lines: string[];
};


function summarizeRoute(route: ComputedRoute): RouteSummary {
  const lineNames = new Set<string>();
  const agencies = new Map<string, { name: string; url?: string }>();

  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const line = step.transitDetails?.transitLine;
      if (!line) continue;
      const label = line.shortName || line.name || line.vehicle?.name;
      if (label) lineNames.add(label);
      for (const agency of line.agencies ?? []) {
        if (!agency.name) continue;
        const url = agency.url ? String(agency.url) : undefined;
        agencies.set(`${agency.name}:${url ?? ""}`, { name: agency.name, url });
      }
    }
  }

  return {
    agencies: [...agencies.values()],
    distance: route.localizedValues?.distance,
    duration: route.localizedValues?.duration,
    fare: route.localizedValues?.transitFare,
    lines: [...lineNames],
  };
}

function RouteCanvas({
  apiKey,
  destination,
  origin,
  plan,
}: {
  apiKey: string;
  destination: string;
  origin: string;
  plan: Extract<ReturnType<typeof buildTransportRoutePlan>, { ok: true }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-route" | "error">("loading");
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [usedGeneralTransit, setUsedGeneralTransit] = useState(false);

  useEffect(() => {
    let active = true;
    let markers: MapMarker[] = [];
    let polylines: MapPolyline[] = [];
    setStatus("loading");
    setSummary(null);
    setUsedGeneralTransit(false);

    void (async () => {
      try {
        const maps = await loadGoogleMaps(apiKey);
        if (!active || !containerRef.current) return;
        const [mapsLibrary, routesLibrary] = await Promise.all([
          maps.importLibrary("maps"),
          maps.importLibrary("routes"),
        ]);
        if (!active || !containerRef.current) return;

        const Map = mapsLibrary.Map as MapConstructor | undefined;
        const Route = routesLibrary.Route as RouteApi | undefined;
        if (!Map || !Route) throw new Error("The required Google Maps libraries are unavailable.");

        const map = new Map(containerRef.current, {
          center: { lat: 0, lng: 0 },
          fullscreenControl: false,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          zoom: 2,
        });
        const request = buildTransportRouteRequest(origin, destination, plan);

        let result = await Route.computeRoutes(request);
        if (!active) return;

        // Retry transit without the mode preference when a connection needs
        // another form of public transport.
        if (!result.routes?.length && plan.travelMode === "TRANSIT") {
          const generalTransitRequest = { ...request };
          delete generalTransitRequest.transitPreference;
          result = await Route.computeRoutes(generalTransitRequest);
          if (!active) return;
          setUsedGeneralTransit(Boolean(result.routes?.length));
        }

        const route = result.routes?.[0];
        if (!route) {
          setStatus("no-route");
          return;
        }

        polylines = route.createPolylines();
        polylines.forEach((polyline) => polyline.setMap(map));
        markers = await route.createWaypointAdvancedMarkers({ map });
        if (!active) {
          polylines.forEach((polyline) => polyline.setMap(null));
          markers.forEach((marker) => { marker.map = null; });
          return;
        }
        if (route.viewport) map.fitBounds(route.viewport, 48);
        setSummary(summarizeRoute(route));
        setStatus("ready");
      } catch (error) {
        console.error("Google route preview failed", error);
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
      polylines.forEach((polyline) => polyline.setMap(null));
      markers.forEach((marker) => { marker.map = null; });
    };
  }, [apiKey, destination, origin, plan]);

  return (
    <div className="grid gap-3">
      <div className="relative min-h-72 overflow-hidden rounded-[12px] border border-border bg-muted">
        <div ref={containerRef} className="absolute inset-0" aria-label={`Route map from ${origin} to ${destination}`} />
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-background/90 text-sm font-semibold text-secondary-foreground" role="status">
            Calculating route…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center bg-destructive-soft p-6 text-center text-sm font-medium text-destructive" role="alert">
            Google Maps could not calculate this route. Check the locations, schedule, and API access, then try again.
          </div>
        )}
        {status === "no-route" && (
          <div className="absolute inset-0 grid place-items-center bg-background/95 p-6 text-center" role="status">
            <div className="max-w-md">
              <p className="text-sm font-semibold text-foreground">No {plan.travelMode === "TRANSIT" ? "public-transit" : plan.travelMode === "DRIVING" ? "driving" : "walking"} route is available.</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {plan.travelMode === "TRANSIT"
                  ? "Try more specific stop or station names, or another time."
                  : "Try more specific start and end locations."} You can also open directions in Google Maps below.
              </p>
            </div>
          </div>
        )}
      </div>
      {status === "ready" && summary && (
        <div className="grid gap-2 text-sm text-secondary-foreground">
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
            {summary.duration && <span>{summary.duration}</span>}
            {summary.distance && <span>{summary.distance}</span>}
            {summary.fare && <span>{summary.fare}</span>}
          </div>
          {usedGeneralTransit && (
            <p className="text-xs text-muted-foreground">No route matched the preferred transport type, so this route may include other public transport.</p>
          )}
          {summary.lines.length > 0 && <p>Lines: {summary.lines.join(" · ")}</p>}
          {summary.agencies.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Transit data by {summary.agencies.map((agency, index) => (
                <span key={`${agency.name}:${agency.url ?? ""}`}>
                  {index > 0 && ", "}
                  {agency.url ? <a className="underline" href={agency.url} target="_blank" rel="noopener noreferrer">{agency.name}</a> : agency.name}
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function TransportRouteMap({
  apiKey,
  arrivalTime,
  date,
  departureTime,
  destination,
  mode,
  origin,
  timezone,
}: {
  apiKey: string;
  arrivalTime: string;
  date: string | null;
  departureTime: string;
  destination: string;
  mode: string;
  origin: string;
  timezone?: string | null;
}) {
  const [clientReady, setClientReady] = useState(false);
  const [attempt, setAttempt] = useState<{ id: number; signature: string } | null>(null);
  const signature = JSON.stringify({ arrivalTime, date, departureTime, destination, mode, origin, timezone });
  const plan = useMemo(() => clientReady ? buildTransportRoutePlan({
      mode,
      date,
      departureTime,
      arrivalTime,
      timezone,
    }) : { ok: false as const, error: "Preparing route preview…" },
  [arrivalTime, clientReady, date, departureTime, mode, timezone]);
  const directionsUrl = googleTransportDirectionsUrl(origin, destination, mode);
  const showMap = Boolean(attempt && attempt.signature === signature && plan.ok);

  useEffect(() => setClientReady(true), []);

  return (
    <section className="ui-section" aria-labelledby="transport-route-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="ui-label" id="transport-route-heading">Google Maps route</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {mode === "walk"
              ? "Walking route between the start and end locations."
              : plan.ok && plan.travelMode === "DRIVING" && !plan.requestTime
                ? "General driving estimate; traffic at the specified time is not included."
                : `Uses the trip day and ${departureTime ? "departure" : "arrival"} time in ${plan.ok ? plan.timeZone : timezone || "your device’s time zone"}.`}
          </p>
        </div>
        <button
          type="button"
          className="ui-button ui-button-outline"
          disabled={!apiKey || !origin.trim() || !destination.trim() || !plan.ok}
          onClick={() => setAttempt({ id: (attempt?.id ?? 0) + 1, signature })}
        >
          {showMap ? "Refresh route" : "Preview route"}
        </button>
      </div>
      {!apiKey && <p className="text-sm font-medium text-destructive">Add GOOGLE_MAPS_BROWSER_API_KEY to .dev.vars to enable route previews.</p>}
      {apiKey && !plan.ok && <p className="text-sm text-muted-foreground">{plan.error}</p>}
      {plan.ok && plan.usesDepartureTime && departureTime && arrivalTime && (
        <p className="text-xs text-muted-foreground">This preview uses the departure time.</p>
      )}
      {showMap && plan.ok && (
        <RouteCanvas
          key={attempt?.id}
          apiKey={apiKey}
          destination={destination.trim()}
          origin={origin.trim()}
          plan={plan}
        />
      )}
      {origin.trim() && destination.trim() && (
        <a className="w-fit text-sm font-semibold text-primary hover:underline" href={directionsUrl} target="_blank" rel="noopener noreferrer">
          Open directions in Google Maps <span aria-hidden="true">↗</span>
        </a>
      )}
    </section>
  );
}
