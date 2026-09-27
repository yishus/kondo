import { useFetcher, useRouteLoaderData } from "react-router";
import type { action as timezoneAction, loader as tripLoader } from "./trip-layout";
import type { action as ownersAction } from "./trip-owners";
import { TimezoneField } from "../components/timezone-field";

export function meta() { return [{ title: "Settings · Kondo" }]; }

export default function TripSettings() {
  // The parent loader authenticates ownership and revalidates after either form.
  const page = useRouteLoaderData<typeof tripLoader>("routes/trip-layout");
  const timezoneFetcher = useFetcher<typeof timezoneAction>();
  const ownerFetcher = useFetcher<typeof ownersAction>();
  if (!page) throw new Error("Trip settings require a trip.");
  const { trip, owners, currentUser } = page;
  const base = `/trips/${encodeURIComponent(trip.id)}`;
  const ownerError = ownerFetcher.data && !ownerFetcher.data.ok ? ownerFetcher.data.error : null;

  return <div className="grid max-w-2xl gap-10">
    <section aria-labelledby="trip-timezone-heading">
      <h2 id="trip-timezone-heading" className="section-heading">Time zone</h2>
      <p className="section-description">The default for every day in this trip. Individual days can use their own time zone.</p>
      <timezoneFetcher.Form action={base} method="post" className="mt-5 grid max-w-sm gap-3">
        <input type="hidden" name="intent" value="update-timezone" />
        <TimezoneField key={`${trip.id}:${trip.timezone}`} label="Trip time zone" timezone={trip.timezone}
          placeholder="e.g. Asia/Tokyo" disabled={timezoneFetcher.state !== "idle"} />
        <p className="text-xs text-muted-foreground">Leave blank to keep it unset. Entered clock times stay the same.</p>
        <button className="ui-button ui-button-primary justify-self-start" disabled={timezoneFetcher.state !== "idle"}>
          {timezoneFetcher.state === "idle" ? "Save time zone" : "Saving…"}
        </button>
        {timezoneFetcher.state === "idle" && timezoneFetcher.data?.error && <p role="alert" className="text-sm text-destructive">{timezoneFetcher.data.error}</p>}
        {timezoneFetcher.state === "idle" && timezoneFetcher.data?.ok && <p role="status" className="text-xs text-success">Time zone saved.</p>}
      </timezoneFetcher.Form>
    </section>

    <section aria-labelledby="trip-owners-heading" className="border-t border-border pt-8">
      <h2 id="trip-owners-heading" className="section-heading">Trip owners ({owners.length})</h2>
      <p className="section-description">Add someone with a Kondo account to plan together. All owners can edit the trip.</p>
      <ul className="mt-4 grid gap-2">
        {owners.map((owner) => <li key={owner.id} className="rounded-lg bg-muted px-3 py-2 text-sm">
          <p>{owner.name}{owner.id === currentUser.id ? " (you)" : ""}</p>
          <p className="break-all text-xs text-muted-foreground">{owner.email}</p>
        </li>)}
      </ul>
      <ownerFetcher.Form action={`${base}/owners`} method="post" className="mt-4 flex flex-wrap items-end gap-2">
        <label className="ui-field min-w-0 flex-1 basis-64">Add an owner by account email
          <input className="ui-input" name="email" type="email" autoComplete="email" required disabled={ownerFetcher.state !== "idle"} />
        </label>
        <button className="ui-button ui-button-primary" type="submit" disabled={ownerFetcher.state !== "idle"}>
          {ownerFetcher.state === "idle" ? "Add owner" : "Adding…"}
        </button>
      </ownerFetcher.Form>
      {ownerFetcher.state === "idle" && ownerError && <p role="alert" className="mt-2 text-sm text-destructive">{ownerError}</p>}
      {ownerFetcher.state === "idle" && ownerFetcher.data?.ok && <p role="status" className="mt-2 text-sm text-success">Owner added.</p>}
    </section>
  </div>;
}
