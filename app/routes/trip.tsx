import { resolveTripId } from "../trip-url.server";
import { env } from "cloudflare:workers";
import { and, asc, eq, sql } from "drizzle-orm";
import { useEffect, useRef, useState } from "react";
import { data, Link, useFetcher } from "react-router";
import { v7 as uuidv7 } from "uuid";

import type { Route } from "./+types/trip";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { getTripPage } from "../trip-page.server";
import { photoForCardLocation } from "../place-photo.server";
import { cards, cityCardLocations, tripDays, trips } from "../db/schema";
import { cardTypes, locationCategories, transportModes, readCardDetails, type CardType } from "../card-types";
import { placeLocationCategory, readCardLocation, type CardLocation } from "../card-location";
import { readCityLocations } from "../city-locations";
import { CityLocationsEditor } from "../components/city-locations-editor";
import { CityLocationsMap } from "../components/city-locations-map";
import { CardLocationPicker } from "../components/card-location";
import { CardSearch } from "../components/card-search";
import { CardChat } from "../components/card-chat";
import { TripChat } from "../components/trip-chat";
import { TransportLocationPicker } from "../components/transport-location-picker";
import { TransportRouteMap } from "../components/transport-route-map";
import { isMappableTransportMode } from "../transport-route";
import { TimezoneField } from "../components/timezone-field";
import { DayOptions } from "../components/day-options";
import { effectiveTimezone, readTimezone, transportTimezone } from "../timezones";
import { TransportEstimateSummary } from "../components/transport-estimate-summary";
import { fetchTransportEstimate } from "../transport-estimate.server";
import { saveCardWithAttachments } from "../attachments.server";
import { HikeGpxEditor } from "../components/hike-gpx-editor";
import { GPX_CONTENT_TYPE } from "../hike-gpx";
import { CardAttachments } from "../components/card-attachments";
import { moveCard } from "../card-move.server";
import { nextCardRank } from "../card-rank.server";
import { deleteCard } from "../card-delete.server";
import { previewCardMove, UNSCHEDULED_COLUMN_ID, type CardMove, type TripCard, type TripColumn } from "../card-order";
import { CardDragBoard, CardDropSlot, DraggableCard } from "../components/card-drag";
import { CardMoveDialog } from "../components/card-move-dialog";
import { CardEditorTitle } from "../components/card-editor-title";
import { Icon } from "../components/icon";
import { TripMap } from "../components/trip-map";
import { MarkdownEditor } from "../components/markdown-editor";
import { dayEstimateSlots, type DayEstimate } from "../day-estimate";
import { refreshDayEstimate } from "../day-estimate.server";

type ActiveCard =
  | { mode: "create"; tripDayId: string }
  | { mode: "edit"; tripDayId: string; cardId: string };

const cardTypePillClasses: Record<CardType, string> = {
  location: "bg-[light-dark(#e6f5f2,#173b36)] text-[light-dark(#0f766e,#5eead4)]",
  hike: "bg-[light-dark(#eaf6eb,#193a25)] text-[light-dark(#15803d,#86efac)]",
  city: "bg-[light-dark(#e7f5fa,#163744)] text-[light-dark(#0e7490,#67e8f9)]",
  transport: "bg-[light-dark(#eaf0ff,#1d2e52)] text-[light-dark(#1d4ed8,#93c5fd)]",
};

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsedDate = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}

function isUniqueConstraintError(error: unknown) {
  let currentError: unknown = error;

  while (currentError instanceof Error) {
    if (currentError.message.includes("UNIQUE constraint")) return true;
    currentError = currentError.cause;
  }

  return false;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function formatTripDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00`));
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { trip, tripColumns, confirmedStays } = await getTripPage(context, request, params.tripId);
  const mapsEnv = env as typeof env & { GOOGLE_MAPS_BROWSER_API_KEY?: string; GOOGLE_MAPS_API_KEY?: string };
  return {
    trip,
    tripColumns,
    confirmedStays,
    googleMapsBrowserApiKey: mapsEnv.GOOGLE_MAPS_BROWSER_API_KEY?.trim() ?? "",
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const db = getDb(env.DB);
  const tripId = await resolveTripId(db, params.tripId);
  await requireTripOwner(request, db, tripId);
  if (Number(request.headers.get("Content-Length")) > 51 * 1024 * 1024) {
    return data({ ok: false as const, error: "Choose up to 5 files, 10 MB or smaller each." }, { status: 413 });
  }
  const formData = await request.formData();
  const intent = formString(formData, "intent");
  const tripRows = await db
    .select({ id: trips.id, timezone: trips.timezone })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const trip = tripRows[0];

  if (!trip) {
    return data(
      { ok: false as const, error: "That trip no longer exists." },
      { status: 404 },
    );
  }

  if (intent === "refresh-day-estimate") {
    try {
      const result = await refreshDayEstimate(db, trip.id, formString(formData, "dayId"), trip.timezone, formData.get("deviceTimezone"), {
        apiKey: (env as typeof env & { TYPESAFE_API_KEY?: string }).TYPESAFE_API_KEY,
      });
      return data({ ok: result.ok, error: result.error }, { status: result.status });
    } catch {
      return data({ ok: false as const, error: "Could not refresh times. Your previous estimates are still saved. Please try again." }, { status: 500 });
    }
  }

  if (intent === "delete-card") {
    try {
      return await deleteCard(db, env.ATTACHMENTS, trip.id, formString(formData, "cardId"));
    } catch {
      return data({ ok: false as const, error: "Could not delete this card. Please try again." }, { status: 500 });
    }
  }

  if (intent === "move-card") {
    try {
      return await moveCard(db, trip.id, formData);
    } catch (error) {
      console.error("Could not save move", error);
      return data(
        { ok: false as const, error: "Could not save that move. Please try again." },
        { status: 500 },
      );
    }
  }

  if (intent === "add-day") {
    const date = formString(formData, "date");
    const timezone = readTimezone(formData.get("timezone"));
    if (!timezone.ok) return data(timezone, { status: 400 });

    if (!isValidDate(date)) {
      return data(
        { ok: false as const, error: "Choose a valid date." },
        { status: 400 },
      );
    }

    try {
      await db.insert(tripDays).values({
        id: uuidv7(),
        tripId: trip.id,
        tripDate: date,
        timezone: timezone.timezone,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return data(
          { ok: false as const, error: "That day is already on your trip." },
          { status: 409 },
        );
      }

      throw error;
    }

    return { ok: true as const, error: null };
  }

  if (intent === "update-day-timezone") {
    const timezone = readTimezone(formData.get("timezone"));
    if (!timezone.ok) return data(timezone, { status: 400 });
    const updated = await db.update(tripDays).set({ timezone: timezone.timezone })
      .where(and(eq(tripDays.id, formString(formData, "dayId")), eq(tripDays.tripId, trip.id)))
      .returning({ id: tripDays.id });
    if (!updated.length) return data({ ok: false as const, error: "That trip day no longer exists." }, { status: 404 });
    return { ok: true as const, error: null };
  }

  if (intent === "update-day") {
    const dayId = formString(formData, "dayId");
    const date = formString(formData, "date");

    if (!dayId || !isValidDate(date)) {
      return data(
        { ok: false as const, error: "Choose a valid date." },
        { status: 400 },
      );
    }

    try {
      const updatedDays = await db
        .update(tripDays)
        .set({ tripDate: date })
        .where(and(eq(tripDays.id, dayId), eq(tripDays.tripId, trip.id)))
        .returning({ id: tripDays.id });

      if (updatedDays.length === 0) {
        return data(
          { ok: false as const, error: "That trip day no longer exists." },
          { status: 404 },
        );
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return data(
          { ok: false as const, error: "That day already has a column." },
          { status: 409 },
        );
      }

      throw error;
    }

    return { ok: true as const, error: null };
  }

  if (intent === "add-card") {
    const columnId = formString(formData, "tripDayId");
    const tripDayId = columnId === UNSCHEDULED_COLUMN_ID ? null : columnId;


    if (!columnId) {
      return data(
        { ok: false as const, error: "Card title cannot be empty." },
        { status: 400 },
      );
    }

    let tripDate: string | null = null;
    let timezone = trip.timezone;
    if (tripDayId !== null) {
      const dayRows = await db
        .select({ id: tripDays.id, tripDate: tripDays.tripDate, timezone: tripDays.timezone })
        .from(tripDays)
        .where(and(eq(tripDays.id, tripDayId), eq(tripDays.tripId, trip.id)))
        .limit(1);

      if (dayRows.length === 0) {
        return data(
          { ok: false as const, error: "That trip day no longer exists." },
          { status: 404 },
        );
      }
      tripDate = dayRows[0].tripDate;
      timezone = effectiveTimezone(trip.timezone, dayRows[0].timezone);
    }
    const details = readCardDetails(formData);
    if (!details.ok) return data({ ok: false as const, error: details.error }, { status: 400 });
    const location = readCardLocation((details.details.type === "location" || details.details.type === "hike") ? formData : new FormData());
    if (!location.ok) return data({ ok: false as const, error: location.error }, { status: 400 });
    const areaLocations = readCityLocations(formData, details.details.type);
    if (!areaLocations.ok) return data({ ok: false as const, error: areaLocations.error }, { status: 400 });

    const transportEstimate = await fetchTransportEstimate({
      card: details.details, date: tripDate, timezone,
      utcOffsetMinutes: formString(formData, "transportUtcOffset"), apiKey: env.GOOGLE_MAPS_API_KEY,
    });
    const cardId = uuidv7();
    const googlePhoto = await photoForCardLocation(details.details.type, location.location.googlePlaceId, undefined, env.GOOGLE_MAPS_API_KEY, request.signal);
    return saveCardWithAttachments(db, env.ATTACHMENTS, cardId, formData, (coverAttachmentId) => [
      db.insert(cards).values({
        ...location.location,
        googlePhoto,
        id: cardId,
        tripId: trip.id,
        tripDayId,
        ...details.details,
        transportEstimate,
        coverAttachmentId,
        position: nextCardRank(trip.id, tripDayId),
      }),
      ...areaLocations.locations.map((areaLocation, position) => db.insert(cityCardLocations).values({
        id: uuidv7(),
        cardId,
        ...areaLocation,
        position,
      })),
    ],
      { allowCover: details.details.type === "location" || details.details.type === "transport", allowGpx: details.details.type === "hike", previewReferer: new URL(request.url).origin },
    );
  }

  if (intent === "update-card") {
    const cardId = formString(formData, "cardId");


    if (!cardId) {
      return data(
        { ok: false as const, error: "Card title cannot be empty." },
        { status: 400 },
      );
    }

    const [card] = await db.select().from(cards)
      .where(and(eq(cards.id, cardId), eq(cards.tripId, trip.id))).limit(1);
    if (!card) return data({ ok: false as const, error: "That card no longer exists." }, { status: 404 });

    const details = readCardDetails(formData, card);
    if (!details.ok) return data({ ok: false as const, error: details.error }, { status: 400 });
    const location = readCardLocation((details.details.type === "location" || details.details.type === "hike") ? formData : new FormData(), card);
    if (!location.ok) return data({ ok: false as const, error: location.error }, { status: 400 });
    const savedAreaLocations = card.type === "city"
      ? await db.select().from(cityCardLocations).where(eq(cityCardLocations.cardId, cardId)).orderBy(asc(cityCardLocations.position))
      : [];
    const areaLocations = readCityLocations(formData, details.details.type, savedAreaLocations);
    if (!areaLocations.ok) return data({ ok: false as const, error: areaLocations.error }, { status: 400 });

    const [day] = card.tripDayId
      ? await db.select({ tripDate: tripDays.tripDate, timezone: tripDays.timezone }).from(tripDays)
        .where(and(eq(tripDays.id, card.tripDayId), eq(tripDays.tripId, trip.id))).limit(1)
      : [];
    const transportEstimate = await fetchTransportEstimate({
      card: details.details, date: day?.tripDate ?? null, timezone: effectiveTimezone(trip.timezone, day?.timezone ?? null),
      utcOffsetMinutes: formString(formData, "transportUtcOffset"), apiKey: env.GOOGLE_MAPS_API_KEY,
    });

    const googlePhoto = await photoForCardLocation(details.details.type, location.location.googlePlaceId, card, env.GOOGLE_MAPS_API_KEY, request.signal);
    return saveCardWithAttachments(db, env.ATTACHMENTS, cardId, formData, (coverAttachmentId) => [
      db.update(cards)
        .set({
          ...location.location,
          googlePhoto,
          ...details.details,
          transportEstimate,
          coverAttachmentId,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(eq(cards.id, cardId), eq(cards.tripId, trip.id)),
        )
        .returning({ id: cards.id }),
      db.delete(cityCardLocations).where(eq(cityCardLocations.cardId, cardId)),
      ...areaLocations.locations.map((areaLocation, position) => db.insert(cityCardLocations).values({
        id: uuidv7(),
        cardId,
        ...areaLocation,
        position,
      })),
    ], {
      allowCover: details.details.type === "location" || details.details.type === "transport",
      currentCoverAttachmentId: card.coverAttachmentId,
      allowGpx: card.type === "hike",
      previewReferer: new URL(request.url).origin,
    });
  }

  return data(
    { ok: false as const, error: "Unknown board action." },
    { status: 400 },
  );
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: loaderData ? `${loaderData.trip.title} | kondo` : "kondo" },
    {
      name: "description",
      content: "A simple board for planning your next trip.",
    },
  ];
}

function UnscheduledColumn({ column, onAddCard, onOpenCard, onRequestMove, moving }: {
  column: TripColumn;
  onAddCard: (tripDayId: string) => void;
  onOpenCard: (card: TripCard) => void;
  onRequestMove: (card: TripCard) => void;
  moving: boolean;
}) {
  const destination = { tripDayId: column.id };
  return (
    <section className="min-w-0" aria-label="Unscheduled cards">
      <div className="flex items-center justify-between gap-2 min-h-9.5 p-[0_6px_8px] border-b border-b-border [&_>_svg]:hidden">
        <h2 className="flex items-center gap-2 py-1 text-[13px] font-semibold"><Icon name="compass" width="16" height="16" className="text-muted-foreground" />Unscheduled</h2>
        <span className="inline-grid min-w-5 h-5 place-items-center p-[0_4px] text-muted-foreground text-[11px] font-normal tabular-nums bg-surface" aria-label={`${column.cards.length} cards`}>
          {column.cards.length}
        </span>
      </div>
      <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground">Park ideas here. Pick a day when you’re ready.</p>
      <div className="grid">
        {column.cards.map((card) => (
          <CardDropSlot key={card.id} destination={{ ...destination, beforeCardId: card.id }} label={`Before ${card.title}, Unscheduled`} disabled={moving}>
            <DraggableCard card={card} disabled={moving} onOpen={() => onOpenCard(card)} onRequestMove={onRequestMove} />
          </CardDropSlot>
        ))}
        <CardDropSlot destination={{ ...destination, beforeCardId: null }} label="End of Unscheduled" disabled={moving}>
          {column.cards.length === 0 && (
            <p className="mb-2 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Drop cards here to plan them later.</p>
          )}
          <button className="inline-flex min-h-8.5 shrink-0 items-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed w-full justify-start text-left" type="button" aria-haspopup="dialog" onClick={() => onAddCard(column.id)}>
            <span aria-hidden="true">＋</span> Add card
          </button>
        </CardDropSlot>
      </div>
    </section>
  );
}

function EstimateLabel({ time, explanation }: { time: string; explanation: string }) {
  return (
    <div className="flex items-center gap-[0.65rem] p-[0.25rem_0.35rem_0.8rem] text-muted-foreground text-[0.7rem] tabular-nums" title={explanation}>
      <span className="flex-1 h-px bg-border" aria-hidden="true" />
      <span aria-label={`Estimated time ${time}. ${explanation}`}>≈ {time}</span>
      <span className="flex-1 h-px bg-border" aria-hidden="true" />
    </div>
  );
}

function EstimateLabels({ labels }: { labels: DayEstimate["labels"] }) {
  return labels.map((label) => <EstimateLabel key={label.afterCardId} time={label.time} explanation={label.explanation} />);
}

function DayColumn({
  column,
  tripId,
  tripTimezone,
  confirmedStays,
  onAddCard,
  onOpenCard,
  onRequestMove,
  moving,
}: {
  column: TripColumn & { date: string };
  tripId: string;
  tripTimezone: string | null;
  confirmedStays: Route.ComponentProps["loaderData"]["confirmedStays"];
  onAddCard: (tripDayId: string) => void;
  onOpenCard: (card: TripCard) => void;
  onRequestMove: (card: TripCard) => void;
  moving: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const estimateFetcher = useFetcher<typeof action>();
  const cityCardIds = new Set(column.cards.filter((card) => card.type === "city").map((card) => card.id));
  const visibleEstimate = column.timeEstimate ? { ...column.timeEstimate,
    labels: column.timeEstimate.labels.filter((label) => !cityCardIds.has(label.afterCardId)),
  } : null;
  const estimateSlots = dayEstimateSlots(column.cards.map((card) => card.id), visibleEstimate);
  const pendingDate = fetcher.formData?.get("date");
  const displayedDate =
    typeof pendingDate === "string" ? pendingDate : column.date;
  const error = fetcher.state === "idle" ? fetcher.data?.error : null;
  const errorId = `column-date-error-${column.id}`;

  function renderCards() {
    const destination = { tripDayId: column.id };
    const firstActivityIndex = column.cards.findIndex((card) => card.type !== "city");
    const startLabel = visibleEstimate && visibleEstimate.labels.length > 0
      ? <EstimateLabel time={visibleEstimate.startLabel} explanation={`Estimated start of day · ${visibleEstimate.timezone}`} />
      : null;
    return (
      <div className="grid">
        {column.cards.map((card, index) => (
          <CardDropSlot
            key={card.id}
            destination={{ ...destination, beforeCardId: card.id }}
            label={`Before ${card.title}, ${formatTripDate(column.date)}`}
            disabled={moving}
          >
            {index === firstActivityIndex && startLabel}
            <EstimateLabels labels={estimateSlots[index]} />
            <DraggableCard card={card} disabled={moving} onOpen={() => onOpenCard(card)} onRequestMove={onRequestMove} />
          </CardDropSlot>
        ))}
        <CardDropSlot
          destination={{ ...destination, beforeCardId: null }}
          label={`End of ${formatTripDate(column.date)}`}
          disabled={moving}
        >
          {firstActivityIndex === -1 && startLabel}
          <EstimateLabels labels={estimateSlots[column.cards.length]} />
          <button className="inline-flex min-h-8.5 shrink-0 items-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed w-full justify-start text-left" type="button" aria-haspopup="dialog" onClick={() => onAddCard(column.id)}>
            <span aria-hidden="true">＋</span> Add card
          </button>
        </CardDropSlot>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
    <section
      className="min-w-0"
      aria-label={`Itinerary for ${formatTripDate(column.date)}`}
    >
      <div className="flex items-center justify-between gap-2 min-h-9.5 p-[0_6px_8px] border-b border-b-border [&_>_svg]:hidden">
        <Icon name="calendar" width="16" height="16" className="shrink-0 text-muted-foreground" />
        <input
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-[13px] font-semibold text-foreground outline-none transition hover:bg-surface/60 focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 aria-invalid:border-destructive disabled:cursor-wait"
          type="date"
          value={displayedDate}
          disabled={fetcher.state !== "idle"}
          aria-label={`Change date for ${formatTripDate(column.date)}`}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            if (!event.target.value || event.target.value === column.date) {
              return;
            }

            fetcher.submit(
              {
                intent: "update-day",
                dayId: column.id,
                date: event.target.value,
              },
              { method: "post" },
            );
          }}
        />
        <DayOptions dayId={column.id} dateLabel={formatTripDate(column.date)} timezone={column.timezone} tripTimezone={tripTimezone}
          refreshing={estimateFetcher.state !== "idle"}
          refreshDisabled={estimateFetcher.state !== "idle" || moving || (!column.cards.length && !column.timeEstimate?.labels.length)}
          onRefresh={() => estimateFetcher.submit({ intent: "refresh-day-estimate", dayId: column.id,
            deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }, { method: "post" })} />
        <span
          className="inline-grid min-w-5 h-5 place-items-center p-[0_4px] text-muted-foreground text-[11px] font-normal tabular-nums shrink-0 bg-surface"
          aria-label={`${column.cards.length} cards`}
        >
          {column.cards.length}
        </span>
      </div>

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground">{column.effectiveTimezone ?? "Time zone not set"}{column.timezone ? " · Day override" : " · Trip default"}</p>

      {error && (
        <p className="mb-3 px-1 text-xs font-medium text-destructive" id={errorId}>
          {error}
        </p>
      )}

      {estimateFetcher.state === "idle" && estimateFetcher.data?.error && <p role="alert" className="mb-2 text-xs text-destructive">{estimateFetcher.data.error}</p>}
      <p role="status" className="sr-only">{estimateFetcher.state !== "idle" ? "Estimating times." : estimateFetcher.data?.ok ? "Estimated times refreshed." : ""}</p>
      {renderCards()}
    </section>
    {confirmedStays.filter((stay) => stay.checkIn <= displayedDate && displayedDate < stay.checkOut).map((stay) => (
      <article key={stay.id} aria-label={`Confirmed accommodation: ${stay.name}`} className="min-w-0 p-4 border border-border rounded-[7px] bg-surface shadow-(--shadow)">
        <p className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-normal"><Icon name="bed" width="13" height="13" />Confirmed stay</p>
        <h3 className="mt-2 text-[13px] font-medium wrap-break-word">{stay.name}</h3>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3.5 pt-2.5 border-t border-t-border text-xs text-secondary-foreground">
          <a href={stay.mapsUrl} target="_blank" rel="noreferrer" draggable={false} className="hover:underline">Google Maps ↗</a>
          <Link to={`/trips/${encodeURIComponent(tripId)}/accommodations?edit=${encodeURIComponent(stay.id)}`} draggable={false} aria-label={`Edit ${stay.name}`} className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed">Edit</Link>
        </div>
      </article>
    ))}
    </div>
  );
}

export function TripPage({ loaderData, view = "itinerary" }: Pick<Route.ComponentProps, "loaderData"> & { view?: "itinerary" | "map" }) {
  const { trip, tripColumns, confirmedStays, googleMapsBrowserApiKey } = loaderData;
  const addDayFetcher = useFetcher<typeof action>();
  const cardFetcher = useFetcher<typeof action>();
  const moveFetcher = useFetcher<typeof action>();
  const movedCardRef = useRef<string | null>(null);
  const moving = moveFetcher.state !== "idle";
  const pendingMove: CardMove | null = moving && moveFetcher.formData?.get("intent") === "move-card" ? {
    cardId: formString(moveFetcher.formData, "cardId"),
    fromDayId: formString(moveFetcher.formData, "fromDayId"),
    tripDayId: formString(moveFetcher.formData, "tripDayId"),
    beforeCardId: formString(moveFetcher.formData, "beforeCardId") || null,
  } : null;
  const displayedColumns = pendingMove ? previewCardMove(tripColumns, pendingMove) : tripColumns;
  const [movingCard, setMovingCard] = useState<TripCard | null>(null);
  const boardRef = useRef<HTMLElement>(null);

  function scrollToColumn(columnId: string) {
    const board = boardRef.current;
    const column = board?.querySelector<HTMLElement>(`[data-trip-column="${CSS.escape(columnId)}"]`);
    if (board && column) board.scrollTo({ left: column.offsetLeft - 2 });
  }

  useEffect(() => {
    if (moving) return;
    if (!movedCardRef.current) return;
    const cardId = movedCardRef.current;
    // Follow the saved card, including its original column if the move failed.
    requestAnimationFrame(() => {
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      const button = document.querySelector<HTMLButtonElement>(`[${mobile ? "data-card-move" : "data-card-handle"}="${CSS.escape(cardId)}"]`);
      const columnId = button?.closest<HTMLElement>("[data-trip-column]")?.dataset.tripColumn;
      if (mobile && columnId) scrollToColumn(columnId);
      button?.focus({ preventScroll: true });
    });
    movedCardRef.current = null;
  }, [moving]);

  function submitMove(move: CardMove) {
    if (moving) return;
    movedCardRef.current = move.cardId;
    moveFetcher.submit({
      intent: "move-card",
      ...move,
      beforeCardId: move.beforeCardId ?? "",
    }, { method: "post" });
  }
  const [selectedDate, setSelectedDate] = useState("");
  const [addServerError, setAddServerError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);
  const [cardPanel, setCardPanel] = useState<"details" | "attachments" | "chat">("details");
  const [cardDraft, setCardDraft] = useState({ type: "location" as CardType, title: "", description: "", locationCategory: "", transportMode: "train", startLocation: "", endLocation: "", startLocationName: "", endLocationName: "", departureTime: "", arrivalTime: "", departureTimezone: "", arrivalTimezone: "", serviceNumber: "" });
  const [locationDetailsOpen, setLocationDetailsOpen] = useState(false);
  const [cardLocation, setCardLocation] = useState<CardLocation>({ googlePlaceId: null, googleMapsQuery: null });
  const [cardErrorFor, setCardErrorFor] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const addSubmissionStarted = useRef(false);
  const cardSubmissionKey = useRef<string | null>(null);
  const dateAlreadyAdded = tripColumns.some(
    (column) => column.date === selectedDate,
  );
  const addError = dateAlreadyAdded
    ? "That day is already on your trip."
    : addServerError;
  const activeCardKey = activeCard
    ? activeCard.mode === "create"
      ? `create:${activeCard.tripDayId}`
      : `edit:${activeCard.cardId}`
    : null;
  const activeCardDate = activeCard
    ? tripColumns.find((column) => column.id === activeCard.tripDayId)?.date ?? null
    : null;
  const activeCardTimezone = activeCard
    ? tripColumns.find((column) => column.id === activeCard.tripDayId)?.effectiveTimezone ?? null
    : null;
  const activeSavedCard = activeCard?.mode === "edit"
    ? tripColumns.flatMap((column) => column.cards).find((card) => card.id === activeCard.cardId) ?? null
    : null;

  useEffect(() => {
    if (addDayFetcher.state !== "idle") {
      addSubmissionStarted.current = true;
      return;
    }

    if (!addSubmissionStarted.current) return;

    addSubmissionStarted.current = false;
    if (addDayFetcher.data?.ok) {
      const addedDay = tripColumns.find((column) => column.date === selectedDate);
      if (addedDay) scrollToColumn(addedDay.id);
      setSelectedDate("");
      setAddServerError(null);
    } else {
      setAddServerError(addDayFetcher.data?.error ?? "Could not add that day.");
    }
  }, [addDayFetcher.data, addDayFetcher.state]);

  useEffect(() => {
    if (cardFetcher.state !== "idle") return;

    const submittedCardKey = cardSubmissionKey.current;
    if (!submittedCardKey) return;

    cardSubmissionKey.current = null;
    if (cardFetcher.data?.ok) {
      setActiveCard(null);
      setCardErrorFor(null);
    } else {
      setCardErrorFor(submittedCardKey);
    }
  }, [cardFetcher.data, cardFetcher.state]);

  useEffect(() => {
    if (!activeCard) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const placeInput = activeCard.mode === "create"
      ? document.querySelector<HTMLInputElement>('[data-card-dialog] input[type="search"]')
      : null;
    if (window.matchMedia("(max-width: 760px)").matches) {
      document.querySelector<HTMLButtonElement>('[data-card-dialog] button[aria-label^="Close"]')?.focus({ preventScroll: true });
    } else (placeInput ?? titleInputRef.current ?? document.querySelector<HTMLButtonElement>('[data-card-dialog] button[aria-label^="Close"]'))?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) setActiveCard(null);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [activeCard]);

  function openCard(card: TripCard) {
    setCardPanel("details");
    setCardLocation({ googlePlaceId: card.googlePlaceId, googleMapsQuery: card.googleMapsQuery, googlePlaceName: card.googlePlaceName });
    setActiveCard({ mode: "edit", cardId: card.id, tripDayId: card.tripDayId });
    setCardDraft({ ...card, departureTimezone: card.departureTimezone ?? "", arrivalTimezone: card.arrivalTimezone ?? "", locationCategory: card.locationCategory ?? "", transportMode: card.transportMode ?? "train" });
    setCardErrorFor(null);
  }

  function addCard(tripDayId: string) {
    setCardPanel("details");
    setLocationDetailsOpen(false);
    setCardLocation({ googlePlaceId: null, googleMapsQuery: null });
    setActiveCard({ mode: "create", tripDayId });
    setCardDraft({ type: "location", title: "", description: "", locationCategory: "", transportMode: "train", startLocation: "", endLocation: "", startLocationName: "", endLocationName: "", departureTime: "", arrivalTime: "", departureTimezone: "", arrivalTimezone: "", serviceNumber: "" });
    setCardErrorFor(null);
  }

  function closeCard() {
    setActiveCard(null);
    setCardErrorFor(null);
  }

  function confirmDeleteCard() {
    if (activeCard?.mode !== "edit" || cardFetcher.state !== "idle") return;
    const card = tripColumns.flatMap((column) => column.cards).find((card) => card.id === activeCard.cardId);
    if (!window.confirm(`Delete “${card?.title ?? "this card"}”? This also deletes its attachments and cannot be undone.`)) return;
    cardSubmissionKey.current = `edit:${activeCard.cardId}`;
    setCardErrorFor(null);
    cardFetcher.submit({ intent: "delete-card", cardId: activeCard.cardId }, { method: "post" });
  }

  return (
    <>
      {view === "map" && <CardSearch key={trip.id} tripId={trip.code ?? trip.id} columns={tripColumns} onOpenCard={openCard} />}
      {view === "map" ? <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_--spacing(96)]">
        <div className="min-w-0"><TripMap columns={tripColumns} apiKey={googleMapsBrowserApiKey} onOpenCard={openCard} /></div>
        <TripChat key={trip.id} tripId={trip.code ?? trip.id} columns={tripColumns} onOpenCard={openCard} />
      </div> : <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p className="sr-only">Drag a card’s handle to reorder it or move it between days and Unscheduled.</p>
        <p role="status">{moving ? "Saving move…" : moveFetcher.data?.ok ? "Move saved." : ""}</p>
        {!moving && moveFetcher.data?.error && <p role="alert" className="text-destructive">{moveFetcher.data.error}</p>}
      </div>
      <CardDragBoard onMove={submitMove}>
      <section
        className="relative grid grid-flow-col [align-items:start] gap-7 overflow-x-auto p-[2px_2px_20px] auto-cols-[min(--spacing(80),90%)] [@media(max-width:_760px)]:gap-4 [@media(max-width:_760px)]:snap-x [@media(max-width:_760px)]:snap-proximity"
        ref={boardRef}
        tabIndex={0}
        aria-label={`${trip.title} planning board`}
      >
        {displayedColumns.map((column) => <div key={column.id} data-trip-column={column.id} className="min-w-0 [@media(max-width:_760px)]:snap-start">{column.date === null ? (
          <UnscheduledColumn column={column} onAddCard={addCard} onOpenCard={openCard} onRequestMove={setMovingCard} moving={moving} />
        ) : (
          <DayColumn
            column={{ ...column, date: column.date }}
            tripId={trip.code ?? trip.id}
            tripTimezone={trip.timezone}
            confirmedStays={confirmedStays}
            key={column.id}
            onAddCard={addCard}
            onOpenCard={openCard}
            onRequestMove={setMovingCard}
            moving={moving}
          />
        )}</div>)}
        <section aria-label="Add a day" className="min-w-0 [@media(max-width:_760px)]:snap-start">
          <div className="flex min-h-9.5 items-center gap-2 border-b border-border p-[0_6px_8px]">
            <Icon name="plus" width="16" height="16" className="text-muted-foreground" />
            <h2 className="py-1 text-[13px] font-semibold">Add a day</h2>
          </div>
          <addDayFetcher.Form id="add-trip-day" method="post" className="mt-3 grid gap-3 rounded-lg border border-dashed border-border bg-surface p-4">
            <input name="intent" type="hidden" value="add-day" />
            <label htmlFor="trip-date" className="text-xs font-medium text-secondary-foreground">Date</label>
            <input
              id="trip-date"
              name="date"
              type="date"
              aria-label="Add a day"
              className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] aria-invalid:border-destructive [@media(max-width:_760px)]:min-h-11 [@media(max-width:_760px)]:text-base"
              value={selectedDate}
              aria-describedby={addError ? "date-error" : undefined}
              aria-invalid={Boolean(addError)}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setAddServerError(null);
              }}
            />
            <button type="submit" className="inline-flex min-h-8.5 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.75 text-[12px] font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-[.45] [@media(max-width:_760px)]:min-h-11" disabled={!selectedDate || dateAlreadyAdded || addDayFetcher.state !== "idle"}>
              <Icon name="plus" width="16" height="16" />{addDayFetcher.state === "idle" ? "Add day" : "Adding…"}
            </button>
            {addError && <p role="alert" id="date-error" className="text-sm font-medium text-destructive">{addError}</p>}
          </addDayFetcher.Form>
        </section>
      </section>
      </CardDragBoard>
      </>}

      {movingCard && <CardMoveDialog card={movingCard} columns={displayedColumns} onClose={() => setMovingCard(null)} onMove={submitMove} />}
      {activeCard && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4 [background:rgb(0_0_0/25%)] [@media(max-width:_760px)]:p-0 [@media(max-width:_760px)]:items-stretch"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCard();
          }}
        >
          <section
            className="max-h-[calc(100dvh-32px)] overflow-y-auto p-5 border border-border rounded-[10px] bg-surface text-foreground text-[13px] shadow-[0_8px_36px_rgb(0_0_0/12%)] min-w-0 w-full max-w-full sm:w-3xl sm:max-w-9/10 [@media(max-width:_760px)]:w-full [@media(max-width:_760px)]:max-w-full [@media(max-width:_760px)]:h-dvh [@media(max-width:_760px)]:max-h-dvh [@media(max-width:_760px)]:rounded-none [@media(max-width:_760px)]:border-0 [@media(max-width:_760px)]:pt-[max(1.25rem,env(safe-area-inset-top))] [@media(max-width:_760px)]:[&_button]:min-h-11 [@media(max-width:_760px)]:[&_:is(input,select,textarea)]:text-[13px]"
            role="dialog"
            aria-modal="true"
            aria-label={activeCard.mode === "create" ? "Add card" : "Card details"}
            data-card-dialog
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              {activeCard.mode === "create" ? <h2 className="pt-1 text-[18px] font-[550] tracking-[-.02em]">Add card</h2> : <CardEditorTitle
                key={activeCardKey}
                value={cardDraft.type === "transport"
                  ? [cardDraft.startLocationName || cardDraft.startLocation, cardDraft.endLocationName || cardDraft.endLocation].filter(Boolean).join(" → ") || "Transport"
                  : cardDraft.title}
                label={cardDraft.type === "city" ? "City / area / region name" : "Title"}
                editable={cardDraft.type !== "transport"} disabled={cardFetcher.state !== "idle"}
                onEdit={() => setCardPanel("details")} onChange={(title) => setCardDraft((draft) => ({ ...draft, title }))}
              />}
              <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={activeCard.mode === "create" ? "Close add card dialog" : "Close card details"} onClick={closeCard}><Icon name="close" /></button>
            </div>

            {activeCard.mode === "edit" && <div className="mb-4.5 flex flex-wrap items-center gap-3 border-b border-border pb-3">
              <div className="flex gap-1" role="tablist" aria-label="Card view">
                {([ ["details", "Details"], ...(cardDraft.type === "city" ? [] : [["attachments", "Attachments"]]), ["chat", "Chat"] ] as [typeof cardPanel, string][]).map(([panel, label], index, tabs) => <button
                  key={panel} id={`card-${panel}-tab`} type="button" role="tab" aria-selected={cardPanel === panel} aria-controls={`card-${panel}-panel`}
                  tabIndex={cardPanel === panel ? 0 : -1}
                  className="inline-flex min-h-8.5 items-center rounded-md px-2.5 py-1.75 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-selected:bg-muted aria-selected:text-foreground"
                  onClick={() => setCardPanel(panel)} onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                    setCardPanel(tabs[next][0]);
                    document.getElementById(`card-${tabs[next][0]}-tab`)?.focus();
                  }}>{label}</button>)}
              </div>
            </div>}

            <div hidden={cardPanel === "chat"}>
            <cardFetcher.Form className="grid min-w-0 gap-4.5" method="post" encType="multipart/form-data"
              onInvalidCapture={(event) => {
                const field = event.target;
                if (field instanceof HTMLElement && field.closest("#card-attachments-panel")) {
                  event.preventDefault(); setCardPanel("attachments");
                  requestAnimationFrame(() => field.focus());
                }
              }}
              onSubmit={() => {
                cardSubmissionKey.current = activeCard.mode === "create" ? `create:${activeCard.tripDayId}` : `edit:${activeCard.cardId}`;
                setCardErrorFor(null);
              }}>
              <input name="intent" type="hidden" value={activeCard.mode === "create" ? "add-card" : "update-card"} />
              {activeCard.mode === "create" ? <input name="tripDayId" type="hidden" value={activeCard.tripDayId} /> : <input name="cardId" type="hidden" value={activeCard.cardId} />}
              <input type="hidden" name="type" value={cardDraft.type} />
              {(activeCard.mode === "edit" || cardDraft.type === "location" && !locationDetailsOpen) && <input type="hidden" name="title" value={cardDraft.title} />}

              <div id="card-details-panel" role={activeCard.mode === "edit" ? "tabpanel" : undefined} aria-labelledby={activeCard.mode === "edit" ? "card-details-tab" : undefined} hidden={cardPanel !== "details"}>
              <div className="grid min-w-0 gap-4.5">
                {activeCard.mode === "edit" && <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${cardTypePillClasses[cardDraft.type]}`} aria-label="Card type">{cardTypes[cardDraft.type]}</span>}
                {activeCard.mode === "create" && <label className="grid min-w-0 gap-1.5 text-xs font-medium text-secondary-foreground">Card type
                  <select className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] font-normal" value={cardDraft.type}
                    onChange={(event) => { setCardDraft((draft) => ({ ...draft, type: event.target.value as CardType })); setCardPanel("details"); }}>
                    {Object.entries(cardTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>}

                {activeCard.mode === "create" && cardDraft.type === "location" && <>
                  <CardLocationPicker key={`create-location:${activeCardKey}`} tripId={trip.code ?? trip.id} location={cardLocation} optional={false}
                    disabled={cardFetcher.state !== "idle"} onChange={(location) => {
                      setCardLocation(location);
                      if (!location.googlePlaceId) setCardDraft((draft) => ({ ...draft, title: "", locationCategory: "" }));
                    }} onPlaceSelected={(place) => setCardDraft((draft) => ({ ...draft, title: place.name, locationCategory: placeLocationCategory(place) }))} />
                  <div className="min-w-0 rounded-md border border-border">
                    <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-secondary-foreground hover:bg-muted"
                      aria-expanded={locationDetailsOpen} aria-controls="location-card-fields" onClick={() => {
                        setLocationDetailsOpen(!locationDetailsOpen);
                      }}>
                      <Icon name="chevron" className={`size-3.5 shrink-0 transition-transform ${locationDetailsOpen ? "rotate-90" : ""}`} />
                      No Google maps location
                    </button>
                    {locationDetailsOpen && <div id="location-card-fields" className="grid min-w-0 gap-4 px-3 pb-3 pt-1">
                      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-secondary-foreground" htmlFor="card-title">Title
                        <input id="card-title" name="title" ref={titleInputRef} className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] font-normal"
                          value={cardDraft.title} required onChange={(event) => setCardDraft((draft) => ({ ...draft, title: event.target.value }))} />
                      </label>
                      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-secondary-foreground">Subcategory
                        <select className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] font-normal" name="locationCategory" value={cardDraft.locationCategory}
                          onChange={(event) => setCardDraft((draft) => ({ ...draft, locationCategory: event.target.value }))}>
                          <option value="">No subcategory</option>
                          {Object.entries(locationCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    </div>}
                  </div>
                </>}

                {activeCard.mode === "create" && (cardDraft.type === "hike" || cardDraft.type === "city") && <label className="grid min-w-0 gap-1.5 text-xs font-medium text-secondary-foreground" htmlFor="card-title">
                  {cardDraft.type === "city" ? "City / area / region name" : "Title"}
                  <input id="card-title" name="title" ref={titleInputRef} className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] font-normal"
                    value={cardDraft.title} required onChange={(event) => setCardDraft((draft) => ({ ...draft, title: event.target.value }))} />
                </label>}

                {cardDraft.type === "location" && activeCard.mode === "edit" && <label className="grid min-w-0 gap-1.5 text-xs font-medium text-secondary-foreground">Subcategory
                  <select className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] font-normal" name="locationCategory" value={cardDraft.locationCategory}
                    onChange={(event) => setCardDraft((draft) => ({ ...draft, locationCategory: event.target.value }))}>
                    <option value="">No subcategory</option>
                    {Object.entries(locationCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>}
                {activeCard.mode === "create" && cardDraft.type === "location" && !locationDetailsOpen && <input type="hidden" name="locationCategory" value={cardDraft.locationCategory} />}

                {cardDraft.type === "transport" && <>
                  <input type="hidden" name="transportUtcOffset" value={activeCardDate && (cardDraft.departureTime || cardDraft.arrivalTime)
                    ? new Date(`${activeCardDate}T${cardDraft.departureTime || cardDraft.arrivalTime}:00`).getTimezoneOffset() : ""} />
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium text-secondary-foreground">Mode of transport
                    <select className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] font-normal" name="transportMode" value={cardDraft.transportMode}
                      onChange={(event) => setCardDraft((draft) => ({ ...draft, transportMode: event.target.value }))}>
                      {Object.entries(transportModes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <div className="grid min-w-0 items-start gap-4 [@media(min-width:_761px)]:grid-cols-2">
                    {([ ["startLocation", "Start location", "departureTime", "departureTimezone", "Departure"], ["endLocation", "End location", "arrivalTime", "arrivalTimezone", "Arrival"] ] as const).map(([field, label, time, zone, timeLabel]) => <div key={field} className="grid min-w-0 gap-3">
                      <TransportLocationPicker key={`${activeCardKey}:${field}`} tripId={trip.code ?? trip.id} name={field} label={label} value={cardDraft[field]} placeName={cardDraft[`${field}Name`]}
                        disabled={cardFetcher.state !== "idle"} onChange={(value, placeName) => setCardDraft((draft) => ({ ...draft, [field]: value, [`${field}Name`]: placeName }))} />
                      {activeCard.mode === "edit" && <>
                        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-secondary-foreground">{timeLabel} time
                          <input className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] font-normal" name={time} type="time" value={cardDraft[time]}
                            onChange={(event) => setCardDraft((draft) => ({ ...draft, [time]: event.target.value }))} />
                        </label>
                        <TimezoneField name={zone} label={`${timeLabel} time zone (optional)`} timezone={cardDraft[zone]}
                          placeholder={activeCardTimezone ? `Default: ${activeCardTimezone}` : "Use device time zone"}
                          onChange={(value) => setCardDraft((draft) => ({ ...draft, [zone]: value }))} disabled={cardFetcher.state !== "idle"} />
                      </>}
                    </div>)}
                  </div>
                  {activeCard.mode === "edit" && <>
                    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-secondary-foreground">Service number
                      <input className="min-h-9 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] font-normal" name="serviceNumber" value={cardDraft.serviceNumber}
                        onChange={(event) => setCardDraft((draft) => ({ ...draft, serviceNumber: event.target.value }))} />
                    </label>
                    {activeSavedCard?.transportEstimate && <div className="grid gap-1">
                      <p className="text-xs font-medium text-secondary-foreground">Last saved travel-time estimate</p>
                      <TransportEstimateSummary estimate={activeSavedCard.transportEstimate} />
                    </div>}
                    {isMappableTransportMode(cardDraft.transportMode) && <TransportRouteMap key={`route:${activeCardKey}`} apiKey={googleMapsBrowserApiKey}
                      arrivalTime={cardDraft.arrivalTime} departureTime={cardDraft.departureTime} date={activeCardDate} timezone={transportTimezone(cardDraft, activeCardTimezone)}
                      destination={cardDraft.endLocation} origin={cardDraft.startLocation} mode={cardDraft.transportMode} />}
                  </>}
                </>}

                {activeCard.mode === "create" && cardDraft.type === "hike" && <HikeGpxEditor key={`gpx:${activeCardKey}`} tripId={trip.code ?? trip.id} title={cardDraft.title}
                  distanceKm={null} elevationGainM={null} disabled={cardFetcher.state !== "idle"} />}

                {activeCard.mode === "edit" && cardDraft.type !== "city" && <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-secondary-foreground" htmlFor="card-description">Description</label>
                  <MarkdownEditor key={activeCardKey} id="card-description" name="description" value={cardDraft.description}
                    editWhenEmpty disabled={cardFetcher.state !== "idle"}
                    onChange={(description) => setCardDraft((draft) => ({ ...draft, description }))} />
                </div>}

                {activeCard.mode === "edit" && cardDraft.type === "city" && <>
                  {!!activeSavedCard?.cityLocations.length && <CityLocationsMap apiKey={googleMapsBrowserApiKey} locations={activeSavedCard.cityLocations} />}
                  <CityLocationsEditor key={`city-locations:${activeCardKey}`} tripId={trip.code ?? trip.id} locations={activeSavedCard?.cityLocations ?? []} disabled={cardFetcher.state !== "idle"} />
                </>}

                {activeCard.mode === "edit" && (cardDraft.type === "location" || cardDraft.type === "hike") && <CardLocationPicker
                  key={`location:${activeCardKey}`} tripId={trip.code ?? trip.id} location={cardLocation} onChange={setCardLocation} disabled={cardFetcher.state !== "idle"} />}
              </div>
              </div>

              {activeCard.mode === "edit" && cardDraft.type !== "city" && <div id="card-attachments-panel" role="tabpanel" aria-labelledby="card-attachments-tab" hidden={cardPanel !== "attachments"}>
                <div className="grid min-w-0 gap-4.5">
                  {cardDraft.type === "hike" && <HikeGpxEditor key={`gpx:${activeCardKey}`} tripId={trip.code ?? trip.id} title={cardDraft.title}
                    attachment={activeSavedCard?.attachments.find((item) => item.contentType === GPX_CONTENT_TYPE)}
                    distanceKm={activeSavedCard?.hikeDistanceKm ?? null} elevationGainM={activeSavedCard?.hikeElevationGainM ?? null} disabled={cardFetcher.state !== "idle"} />}
                  <CardAttachments key={`attachments:${activeCardKey}`} tripId={trip.code ?? trip.id}
                    attachments={activeSavedCard?.attachments.filter((item) => item.contentType !== GPX_CONTENT_TYPE) ?? []}
                    coverAttachmentId={activeSavedCard?.coverAttachmentId ?? null} allowCover={cardDraft.type === "location" || cardDraft.type === "transport"} disabled={cardFetcher.state !== "idle"} />
                </div>
              </div>}

              {cardErrorFor === activeCardKey && cardFetcher.data?.error && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {cardFetcher.data.error}
                </p>
              )}

              <div className="flex flex-wrap [justify-content:end] gap-1.5 pt-4 border-t border-t-border [@media(max-width:_760px)]:sticky [@media(max-width:_760px)]:-bottom-5 [@media(max-width:_760px)]:-mx-5 [@media(max-width:_760px)]:bg-surface [@media(max-width:_760px)]:px-5 [@media(max-width:_760px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
                {activeCard.mode === "edit" && (
                  <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-destructive text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-destructive disabled:opacity-[.45] disabled:cursor-not-allowed mr-auto"
                    disabled={cardFetcher.state !== "idle"} onClick={confirmDeleteCard}>
                    {cardFetcher.state !== "idle" && cardFetcher.formData?.get("intent") === "delete-card" ? "Deleting…" : "Delete card"}
                  </button>
                )}
                <button
                  className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed"
                  type="button"
                  onClick={closeCard}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary"
                  type="submit"
                  disabled={
                    (cardDraft.type === "transport" ? !cardDraft.startLocation.trim() || !cardDraft.endLocation.trim() : !cardDraft.title.trim())
                    || cardFetcher.state !== "idle"
                  }
                >
                  {cardFetcher.state !== "idle"
                    ? activeCard.mode === "create"
                      ? "Adding…"
                      : "Saving…"
                    : activeCard.mode === "create"
                      ? "Add card"
                      : "Save changes"}
                </button>
              </div>
            </cardFetcher.Form>
            </div>
            {activeCard.mode === "edit" && activeSavedCard && <div id="card-chat-panel" role="tabpanel" aria-labelledby="card-chat-tab" hidden={cardPanel !== "chat"}>
              <CardChat key={activeCard.cardId} tripId={trip.code ?? trip.id} cardId={activeCard.cardId} type={activeSavedCard.type}
                active={cardPanel === "chat"} date={activeCardDate} timezone={activeCardTimezone} />
            </div>}
          </section>
        </div>
      )}
    </>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <TripPage loaderData={loaderData} />;
}
