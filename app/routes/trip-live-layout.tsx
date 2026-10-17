import { useEffect, useState } from "react";
import { data, isRouteErrorResponse, Link, NavLink, Outlet, useOutletContext, useRouteError } from "react-router";
import type { Route } from "./+types/trip-live-layout";
import { getLiveTripPage } from "../trip-page.server";
import { redirectLegacyTripUrl } from "../trip-url.server";
import { tripNow } from "../trip-now";
import { formatTripDates } from "../trip-dates";
import { Icon, type IconName } from "../components/icon";
import { ThemeToggle } from "../components/theme";

export { shouldRevalidateTripChat as shouldRevalidate } from "../trip-chat";

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const page = await getLiveTripPage(context, request, params.tripId);
  redirectLegacyTripUrl(request, page.trip);
  return data({ ...page, initialNow: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.trip.title} · Travel companion · Kondo` : "Travel companion · Kondo" }];
}

export const headers = () => ({ "Cache-Control": "private, no-store" });

export type LiveTripContext = Route.ComponentProps["loaderData"] & { focus: ReturnType<typeof tripNow>; base: string };
export const useLiveTrip = () => useOutletContext<LiveTripContext>();

export default function TripLiveLayout({ loaderData }: Route.ComponentProps) {
  const { trip, timingColumns, dates } = loaderData;
  const [now, setNow] = useState(() => new Date(loaderData.initialNow));
  const [deviceTimezone, setDeviceTimezone] = useState<string | null>(null);
  useEffect(() => {
    setDeviceTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const focus = tripNow(timingColumns, trip.timezone, deviceTimezone, now);
  const base = `/trips/${encodeURIComponent(trip.code ?? trip.id)}`;
  const day = timingColumns.find((day) => day.id === focus.dayId);
  const current = day?.cards.find((card) => card.id === focus.currentCardId);
  const next = day?.cards.find((card) => card.id === focus.nextCardId);
  return <div className="mx-auto flex min-h-dvh max-w-6xl flex-col pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
    <a href="#live-content" className="fixed -top-24 left-4 z-50 rounded-lg bg-primary p-3 text-primary-foreground focus:top-3">Skip to content</a>
    <header className="border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6 md:border-0 md:pb-5">
      <div className="flex items-center justify-between gap-4">
        <Link to={base} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><Icon name="chevron" className="rotate-180" />Trip planner</Link>
        <ThemeToggle />
      </div>
      <div className="md:flex md:items-end md:justify-between md:gap-6">
        <div className="min-w-0">
          <p className="mt-3 flex items-center gap-2 text-xs font-medium text-primary"><Icon name="compass" width="16" height="16" />Travel companion</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight wrap-anywhere">{trip.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{formatTripDates(dates.start, dates.end)}</p>
        </div>
        <div className="mt-4 min-w-0 rounded-xl border border-border bg-surface p-3 text-[13px] md:w-full md:max-w-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{day ? `Day ${timingColumns.findIndex((column) => column.id === day.id) + 1}` : "No itinerary for today"} · {focus.date}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon name="clock" width="14" height="14" />{focus.time} · {focus.timezone}</p>
          </div>
          {(current || next) && <p className="mt-2 wrap-anywhere text-muted-foreground">{current ? "Around now" : "Up next"}: <span className="text-foreground">{(current ?? next)?.title}</span> <span className="text-xs">· estimated</span></p>}
        </div>
      </div>
    </header>
    <nav aria-label="On the trip tabs" className="fixed inset-x-0 bottom-0 z-30 mx-auto grid grid-cols-2 gap-1 border-t border-border bg-surface px-3 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-(--shadow) md:static md:mx-6 md:flex md:self-start md:rounded-lg md:border md:p-0.75">
      {([[`${base}/live`, "Chat", "compass"], [`${base}/live/journal`, "Journal", "notes"]] satisfies [string, string, IconName][]).map(([to, label, icon]) => <NavLink end to={to} key={to} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted md:min-h-8.5 md:flex-row md:gap-1.75 md:rounded-[5px] md:px-3 md:py-1.75 [&.active]:bg-muted [&.active]:text-foreground"><Icon name={icon} width="16" height="16" />{label}</NavLink>)}
    </nav>
    <main id="live-content" tabIndex={-1} className="min-w-0 px-4 pt-5 sm:px-6 md:pt-6">
      <Outlet context={{ ...loaderData, focus, base } satisfies LiveTripContext} />
    </main>
  </div>;
}

export function ErrorBoundary() {
  const error = useRouteError();
  return <main className="mx-auto max-w-lg p-6"><h1 className="text-xl font-semibold">Could not open this trip</h1><p className="mt-3 text-muted-foreground">{isRouteErrorResponse(error) && error.status === 404 ? "This trip is unavailable or you no longer have access." : "Please reload and try again."}</p><Link className="mt-5 inline-flex min-h-11 items-center underline" to="/">Back to your trips</Link></main>;
}
