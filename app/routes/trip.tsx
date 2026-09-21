import { env } from "cloudflare:workers";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { useEffect, useRef, useState } from "react";
import { data, Link, useFetcher } from "react-router";
import { v7 as uuidv7 } from "uuid";

import type { Route } from "./+types/trip";
import { requireTripOwner } from "../auth.server";
import { getDb } from "../db.server";
import { accommodations, accommodationPlaces, cards, cardAttachments, cityCardLocations, tripDays, trips } from "../db/schema";
import { cardTypes, locationCategories, transportModes, readCardDetails, type CardType } from "../card-types";
import { googleMapsUrl, readCardLocation, type CardLocation } from "../card-location";
import { readCityLocations } from "../city-locations";
import { CityLocationsEditor } from "../components/city-locations-editor";
import { CityLocationsMap } from "../components/city-locations-map";
import { CardLocationPicker } from "../components/card-location";
import { TransportRouteMap } from "../components/transport-route-map";
import { saveCardWithAttachments } from "../attachments.server";
import { CardAttachments } from "../components/card-attachments";
import { moveCard } from "../card-move.server";
import { deleteCard } from "../card-delete.server";
import { previewCardMove, UNSCHEDULED_COLUMN_ID, type CardMove, type TripCard, type TripColumn } from "../card-order";
import { CardDragBoard, CardDropSlot, DraggableCard } from "../components/card-drag";
import { Icon } from "../components/icon";

type ActiveCard =
  | { mode: "create"; tripDayId: string }
  | { mode: "edit"; tripDayId: string; cardId: string };

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

export async function loader({ params, request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);

  const tripRows = await db
    .select()
    .from(trips)
    .where(eq(trips.id, params.tripId))
    .limit(1);
  const trip = tripRows[0];

  if (!trip) {
    throw new Response("Trip not found", { status: 404 });
  }

  const [dayRows, cardRows, attachmentRows, cityLocationRows, stayRows] = await Promise.all([
    db
      .select({ id: tripDays.id, date: tripDays.tripDate })
      .from(tripDays)
      .where(eq(tripDays.tripId, trip.id))
      .orderBy(asc(tripDays.tripDate)),
    db
      .select()
      .from(cards)
      .where(eq(cards.tripId, trip.id))
      .orderBy(asc(cards.position), asc(cards.id)),
    db.select({ attachment: cardAttachments }).from(cardAttachments)
      .innerJoin(cards, eq(cards.id, cardAttachments.cardId))
      .where(eq(cards.tripId, trip.id))
      .orderBy(asc(cardAttachments.createdAt), asc(cardAttachments.id)),
    db.select({ location: cityCardLocations }).from(cityCardLocations)
      .innerJoin(cards, eq(cards.id, cityCardLocations.cardId))
      .where(eq(cards.tripId, trip.id))
      .orderBy(asc(cityCardLocations.position), asc(cityCardLocations.id)),
    db.select({ accommodation: accommodations, placeName: accommodationPlaces.name })
      .from(accommodations)
      .innerJoin(accommodationPlaces, eq(accommodations.placeId, accommodationPlaces.id))
      .where(and(eq(accommodationPlaces.tripId, trip.id), isNotNull(accommodations.confirmedOptionId)))
      .orderBy(asc(accommodations.name), asc(accommodations.id)),
  ]);

  const cardsByDay = new Map<string, TripCard[]>();

  for (const { cityGroupId: _legacyGroupId, ...card } of cardRows) {
    const columnId = card.tripDayId ?? UNSCHEDULED_COLUMN_ID;
    const cards = cardsByDay.get(columnId) ?? [];
    cards.push({
      ...card,
      tripDayId: columnId,
      attachments: attachmentRows.filter(({ attachment }) => attachment.cardId === card.id).map(({ attachment }) => attachment),
      cityLocations: cityLocationRows.filter(({ location }) => location.cardId === card.id).map(({ location }) => location),
    });
    cardsByDay.set(columnId, cards);
  }

  const tripColumns: TripColumn[] = dayRows.map((day) => ({
    id: day.id,
    date: day.date,
    cards: cardsByDay.get(day.id) ?? [],
  }));

  tripColumns.unshift({
    id: UNSCHEDULED_COLUMN_ID,
    date: null,
    cards: cardsByDay.get(UNSCHEDULED_COLUMN_ID) ?? [],
  });

  const confirmedStays = stayRows.flatMap(({ accommodation, placeName }) => {
    const dates = accommodation.dateOptions.find((option) => option.id === accommodation.confirmedOptionId);
    if (!dates) return [];
    const query = accommodation.googleMapsQuery || `${accommodation.name}, ${placeName}`;
    return [{
      id: accommodation.id,
      name: accommodation.name,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      mapsUrl: accommodation.googlePlaceId
        ? googleMapsUrl(accommodation.googlePlaceId, query)
        : `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`,
    }];
  });

  const googleMapsBrowserApiKey = (env as typeof env & { GOOGLE_MAPS_BROWSER_API_KEY?: string })
    .GOOGLE_MAPS_BROWSER_API_KEY?.trim() ?? "";

  return { trip, tripColumns, confirmedStays, googleMapsBrowserApiKey };
}

export async function action({ params, request }: Route.ActionArgs) {
  const db = getDb(env.DB);
  await requireTripOwner(request, db, params.tripId);
  if (Number(request.headers.get("Content-Length")) > 51 * 1024 * 1024) {
    return data({ ok: false as const, error: "Choose up to 5 files, 10 MB or smaller each." }, { status: 413 });
  }
  const formData = await request.formData();
  const intent = formString(formData, "intent");
  const tripRows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.id, params.tripId))
    .limit(1);
  const trip = tripRows[0];

  if (!trip) {
    return data(
      { ok: false as const, error: "That trip no longer exists." },
      { status: 404 },
    );
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

    if (tripDayId !== null) {
      const dayRows = await db
        .select({ id: tripDays.id })
        .from(tripDays)
        .where(and(eq(tripDays.id, tripDayId), eq(tripDays.tripId, trip.id)))
        .limit(1);

      if (dayRows.length === 0) {
        return data(
          { ok: false as const, error: "That trip day no longer exists." },
          { status: 404 },
        );
      }
    }
    const details = readCardDetails(formData);
    if (!details.ok) return data({ ok: false as const, error: details.error }, { status: 400 });
    const location = readCardLocation(details.details.type === "location" ? formData : new FormData());
    if (!location.ok) return data({ ok: false as const, error: location.error }, { status: 400 });
    const areaLocations = readCityLocations(formData, details.details.type);
    if (!areaLocations.ok) return data({ ok: false as const, error: areaLocations.error }, { status: 400 });

    const cardId = uuidv7();
    return saveCardWithAttachments(db, env.ATTACHMENTS, cardId, formData, (coverAttachmentId) => [
      db.insert(cards).values({
        ...location.location,
        id: cardId,
        tripId: trip.id,
        tripDayId,
        ...details.details,
        coverAttachmentId,
        position: sql<number>`(
          SELECT COALESCE(MAX(position) + 1, 0)
          FROM cards
          WHERE trip_id = ${trip.id} AND ${tripDayId === null ? isNull(cards.tripDayId) : eq(cards.tripDayId, tripDayId)}
        )`,
      }),
      ...areaLocations.locations.map((areaLocation, position) => db.insert(cityCardLocations).values({
        id: uuidv7(),
        cardId,
        ...areaLocation,
        position,
      })),
    ],
      { allowCover: details.details.type === "location" },
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
    const location = readCardLocation(details.details.type === "location" ? formData : new FormData(), card);
    if (!location.ok) return data({ ok: false as const, error: location.error }, { status: 400 });
    const savedAreaLocations = card.type === "city"
      ? await db.select().from(cityCardLocations).where(eq(cityCardLocations.cardId, cardId)).orderBy(asc(cityCardLocations.position))
      : [];
    const areaLocations = readCityLocations(formData, details.details.type, savedAreaLocations);
    if (!areaLocations.ok) return data({ ok: false as const, error: areaLocations.error }, { status: 400 });

    return saveCardWithAttachments(db, env.ATTACHMENTS, cardId, formData, (coverAttachmentId) => [
      db.update(cards)
        .set({
          ...location.location,
          ...details.details,
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
      allowCover: details.details.type === "location",
      currentCoverAttachmentId: card.coverAttachmentId,
    });
  }

  return data(
    { ok: false as const, error: "Unknown board action." },
    { status: 400 },
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Trip Board" },
    {
      name: "description",
      content: "A simple board for planning your next trip.",
    },
  ];
}

function UnscheduledColumn({ column, onAddCard, onOpenCard, moving }: {
  column: TripColumn;
  onAddCard: (tripDayId: string) => void;
  onOpenCard: (card: TripCard) => void;
  moving: boolean;
}) {
  const destination = { tripDayId: column.id };
  return (
    <section className="board-column" aria-label="Unscheduled cards">
      <div className="board-column-header">
        <h2 className="flex items-center gap-2 py-1 text-[13px] font-semibold"><Icon name="compass" width="16" height="16" className="text-muted-foreground" />Unscheduled</h2>
        <span className="count-badge bg-surface" aria-label={`${column.cards.length} cards`}>
          {column.cards.length}
        </span>
      </div>
      <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground">Park ideas here. Pick a day when you’re ready.</p>
      <div className="grid">
        {column.cards.map((card) => (
          <CardDropSlot key={card.id} destination={{ ...destination, beforeCardId: card.id }} label={`Before ${card.title}, Unscheduled`} disabled={moving}>
            <DraggableCard card={card} disabled={moving} onOpen={() => onOpenCard(card)} />
          </CardDropSlot>
        ))}
        <CardDropSlot destination={{ ...destination, beforeCardId: null }} label="End of Unscheduled" disabled={moving}>
          {column.cards.length === 0 && (
            <p className="mb-2 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Drop cards here to plan them later.</p>
          )}
          <button className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary w-full text-left text-secondary-foreground" type="button" aria-haspopup="dialog" onClick={() => onAddCard(column.id)}>
            <span aria-hidden="true">＋</span> Add card
          </button>
        </CardDropSlot>
      </div>
    </section>
  );
}

function DayColumn({
  column,
  tripId,
  confirmedStays,
  onAddCard,
  onOpenCard,
  moving,
}: {
  column: TripColumn & { date: string };
  tripId: string;
  confirmedStays: Route.ComponentProps["loaderData"]["confirmedStays"];
  onAddCard: (tripDayId: string) => void;
  onOpenCard: (card: TripCard) => void;
  moving: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const pendingDate = fetcher.formData?.get("date");
  const displayedDate =
    typeof pendingDate === "string" ? pendingDate : column.date;
  const error = fetcher.state === "idle" ? fetcher.data?.error : null;
  const errorId = `column-date-error-${column.id}`;

  function renderCards() {
    const destination = { tripDayId: column.id };
    return (
      <div className="grid">
        {column.cards.map((card) => (
          <CardDropSlot
            key={card.id}
            destination={{ ...destination, beforeCardId: card.id }}
            label={`Before ${card.title}, ${formatTripDate(column.date)}`}
            disabled={moving}
          >
            <DraggableCard card={card} disabled={moving} onOpen={() => onOpenCard(card)} />
          </CardDropSlot>
        ))}
        <CardDropSlot
          destination={{ ...destination, beforeCardId: null }}
          label={`End of ${formatTripDate(column.date)}`}
          disabled={moving}
        >
          <button className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary w-full text-left text-secondary-foreground" type="button" aria-haspopup="dialog" onClick={() => onAddCard(column.id)}>
            <span aria-hidden="true">＋</span> Add card
          </button>
        </CardDropSlot>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
    <section
      className="board-column"
      aria-label={`Itinerary for ${formatTripDate(column.date)}`}
    >
      <div className="board-column-header">
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
        <span
          className="count-badge shrink-0 bg-surface"
          aria-label={`${column.cards.length} cards`}
        >
          {column.cards.length}
        </span>
      </div>

      {error && (
        <p className="mb-3 px-1 text-xs font-medium text-destructive" id={errorId}>
          {error}
        </p>
      )}

      {renderCards()}
    </section>
    {confirmedStays.filter((stay) => stay.checkIn <= displayedDate && displayedDate < stay.checkOut).map((stay) => (
      <article key={stay.id} aria-label={`Confirmed accommodation: ${stay.name}`} className="rounded-[14px] border border-success-border bg-success-soft p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-success">CONFIRMED STAY</p>
        <h3 className="font-semibold break-words">{stay.name}</h3>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-primary">
          <a href={stay.mapsUrl} target="_blank" rel="noreferrer" draggable={false} className="hover:underline">Google Maps ↗</a>
          <Link to={`/trips/${encodeURIComponent(tripId)}/accommodations?edit=${encodeURIComponent(stay.id)}`} draggable={false} aria-label={`Edit ${stay.name}`} className="rounded-lg px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Edit</Link>
        </div>
      </article>
    ))}
    </div>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
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

  useEffect(() => {
    if (moving) return;
    if (!movedCardRef.current) return;
    document.querySelector<HTMLButtonElement>(
      `[data-card-handle="${CSS.escape(movedCardRef.current)}"]`,
    )?.focus({ preventScroll: true });
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
  const [cardDraft, setCardDraft] = useState({ type: "location" as CardType, title: "", description: "", locationCategory: "", transportMode: "train", startLocation: "", endLocation: "", departureTime: "", arrivalTime: "", serviceNumber: "" });
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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleInputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveCard(null);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeCard]);

  function openCard(card: TripCard) {
    setCardLocation({ googlePlaceId: card.googlePlaceId, googleMapsQuery: card.googleMapsQuery });
    setActiveCard({ mode: "edit", cardId: card.id, tripDayId: card.tripDayId });
    setCardDraft({ ...card, locationCategory: card.locationCategory ?? "", transportMode: card.transportMode ?? "train" });
    setCardErrorFor(null);
  }

  function addCard(tripDayId: string) {
    setCardLocation({ googlePlaceId: null, googleMapsQuery: null });
    setActiveCard({ mode: "create", tripDayId });
    setCardDraft({ type: "location", title: "", description: "", locationCategory: "", transportMode: "train", startLocation: "", endLocation: "", departureTime: "", arrivalTime: "", serviceNumber: "" });
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
      <div className="board-toolbar">
      <div><h2>Day by day</h2><p>{tripColumns.filter((column) => column.date !== null).length} days · {tripColumns.reduce((count, column) => count + column.cards.length, 0)} cards in your itinerary</p></div>
      <addDayFetcher.Form
        className="flex flex-wrap items-end gap-2.5"
        method="post"
      >
        <input name="intent" type="hidden" value="add-day" />
        <div className="flex flex-col gap-1.5">
          <label className="sr-only" htmlFor="trip-date">
            Add a day
          </label>
          <input
            className="h-10 rounded-[10px] border border-input bg-surface px-3 text-sm text-foreground shadow-[0_1px_2px_rgb(9_30_66_/_8%)] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 aria-invalid:border-destructive"
            id="trip-date"
            name="date"
            type="date"
            value={selectedDate}
            aria-describedby={addError ? "date-error" : undefined}
            aria-invalid={Boolean(addError)}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setAddServerError(null);
            }}
          />
        </div>
        <button
          className="h-10 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-input"
          type="submit"
          disabled={
            !selectedDate ||
            dateAlreadyAdded ||
            addDayFetcher.state !== "idle"
          }
        >
          {addDayFetcher.state === "idle" ? "Add day" : "Adding…"}
        </button>
        {addError && (
          <p className="w-full text-sm font-medium text-destructive" id="date-error">
            {addError}
          </p>
        )}
      </addDayFetcher.Form>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p>Drag a card’s handle to reorder it or move it between days and Unscheduled.</p>
        <p role="status">{moving ? "Saving move…" : moveFetcher.data?.ok ? "Move saved." : ""}</p>
        {!moving && moveFetcher.data?.error && <p role="alert" className="text-destructive">{moveFetcher.data.error}</p>}
      </div>
      <CardDragBoard onMove={submitMove}>
      <section
        className="planning-board"
        aria-label={`${trip.title} planning board`}
      >
        {displayedColumns.map((column) => column.date === null ? (
          <UnscheduledColumn key={column.id} column={column} onAddCard={addCard} onOpenCard={openCard} moving={moving} />
        ) : (
          <DayColumn
            column={{ ...column, date: column.date }}
            tripId={trip.id}
            confirmedStays={confirmedStays}
            key={column.id}
            onAddCard={addCard}
            onOpenCard={openCard}
            moving={moving}
          />
        ))}
      </section>
      </CardDragBoard>

      {activeCard && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-overlay/60 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCard();
          }}
        >
          <section
            className={`max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl bg-surface p-6 shadow-[0_20px_48px_rgb(9_30_66_/_30%)] ${cardDraft.type === "transport" ? "max-w-3xl" : "max-w-xl"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-dialog-heading"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2
                className="text-xl font-semibold tracking-[-0.02em]"
                id="card-dialog-heading"
              >
                {activeCard.mode === "create" ? "Add card" : "Card details"}
              </h2>
              <button
                className="grid size-8 cursor-pointer place-items-center rounded-full text-2xl leading-none text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                type="button"
                aria-label={
                  activeCard.mode === "create"
                    ? "Close add card dialog"
                    : "Close card details"
                }
                onClick={closeCard}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <cardFetcher.Form
              className="grid gap-5"
              method="post"
              encType="multipart/form-data"
              onSubmit={() => {
                cardSubmissionKey.current =
                  activeCard.mode === "create"
                    ? `create:${activeCard.tripDayId}`
                    : `edit:${activeCard.cardId}`;
                setCardErrorFor(null);
              }}
            >
              <input
                name="intent"
                type="hidden"
                value={activeCard.mode === "create" ? "add-card" : "update-card"}
              />
              {activeCard.mode === "create" ? (
                <input
                  name="tripDayId"
                  type="hidden"
                  value={activeCard.tripDayId}
                />
              ) : (
                <input name="cardId" type="hidden" value={activeCard.cardId} />
              )}

              <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
                Card type
                <select className="min-w-0 w-full rounded-[10px] border border-input bg-surface px-3 py-2.5 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" value={cardDraft.type} disabled={activeCard.mode === "edit"}
                  onChange={(event) => setCardDraft((draft) => ({ ...draft, type: event.target.value as CardType }))}>
                  {Object.entries(cardTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input type="hidden" name="type" value={cardDraft.type} />
              </label>

              {cardDraft.type === "transport" && <>
                <label className="grid min-w-0 gap-1.5 text-sm font-semibold">Mode of transport
                  <select className="min-w-0 w-full rounded-[10px] border border-input bg-surface px-3 py-2.5 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" name="transportMode" value={cardDraft.transportMode} onChange={(event) => setCardDraft((draft) => ({ ...draft, transportMode: event.target.value }))}>
                    {Object.entries(transportModes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {([ ["startLocation", "Start location"], ["endLocation", "End location"] ] as const).map(([field, label]) => (
                  <label key={field} className="grid min-w-0 gap-1.5 text-sm font-semibold">{label}
                    <input className="min-w-0 w-full rounded-[10px] border border-input bg-surface px-3 py-2.5 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" name={field} required value={cardDraft[field]} onChange={(event) => setCardDraft((draft) => ({ ...draft, [field]: event.target.value }))} />
                  </label>
                ))}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-secondary-foreground">Times and service details</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {([ ["departureTime", "Departure time"], ["arrivalTime", "Arrival time"], ["serviceNumber", "Service number"] ] as const).map(([field, label]) => (
                      <label key={field} className="grid min-w-0 gap-1.5 text-sm font-semibold">{label}
                        <input className="min-w-0 w-full rounded-[10px] border border-input bg-surface px-3 py-2.5 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" name={field} type={field === "serviceNumber" ? "text" : "time"} value={cardDraft[field]} onChange={(event) => setCardDraft((draft) => ({ ...draft, [field]: event.target.value }))} />
                      </label>
                    ))}
                  </div>
                </details>
                {(cardDraft.transportMode === "train" || cardDraft.transportMode === "subway") && (
                  <TransportRouteMap
                    key={`route:${activeCardKey}`}
                    apiKey={googleMapsBrowserApiKey}
                    arrivalTime={cardDraft.arrivalTime}
                    date={activeCardDate}
                    departureTime={cardDraft.departureTime}
                    destination={cardDraft.endLocation}
                    mode={cardDraft.transportMode}
                    origin={cardDraft.startLocation}
                  />
                )}
              </>}

              {cardDraft.type !== "transport" && (
              <div className="grid gap-1.5">
                <label className="text-sm font-semibold" htmlFor="card-title">
                  {cardDraft.type === "city" ? "City / area / region name" : "Title"}
                </label>
                <input
                  className="rounded-[10px] border border-input px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  id="card-title"
                  name="title"
                  ref={titleInputRef}
                  value={cardDraft.title}
                  required
                  onChange={(event) =>
                    setCardDraft((draft) => ({
                      ...draft,
                      title: event.target.value,
                    }))
                  }
                />
              </div>

              )}

              {cardDraft.type === "location" && (
                <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
                  Subcategory
                  <select
                    className="min-w-0 w-full rounded-[10px] border border-input bg-surface px-3 py-2.5 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    name="locationCategory"
                    value={cardDraft.locationCategory}
                    onChange={(event) => setCardDraft((draft) => ({ ...draft, locationCategory: event.target.value }))}
                  >
                    <option value="">No subcategory</option>
                    {Object.entries(locationCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              )}

              {cardDraft.type === "city" && (
                <>
                  {activeSavedCard && activeSavedCard.cityLocations.length > 0 && (
                    <CityLocationsMap
                      apiKey={googleMapsBrowserApiKey}
                      locations={activeSavedCard.cityLocations}
                    />
                  )}
                  <CityLocationsEditor
                    key={`city-locations:${activeCardKey}`}
                    tripId={trip.id}
                    locations={activeSavedCard?.cityLocations ?? []}
                    disabled={cardFetcher.state !== "idle"}
                  />
                </>
              )}

              {cardDraft.type !== "city" && <>
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-semibold"
                  htmlFor="card-description"
                >
                  Description
                </label>
                <textarea
                  className="min-h-32 resize-y rounded-[10px] border border-input px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  id="card-description"
                  name="description"
                  value={cardDraft.description}
                  onChange={(event) =>
                    setCardDraft((draft) => ({
                      ...draft,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <CardAttachments key={`attachments:${activeCardKey}`} tripId={trip.id}
                attachments={activeCard.mode === "edit" ? tripColumns.flatMap((column) => column.cards).find((card) => card.id === activeCard.cardId)?.attachments ?? [] : []}
                coverAttachmentId={activeCard.mode === "edit" ? tripColumns.flatMap((column) => column.cards).find((card) => card.id === activeCard.cardId)?.coverAttachmentId ?? null : null}
                allowCover={cardDraft.type === "location"}
                disabled={cardFetcher.state !== "idle"} />

              {cardDraft.type === "location" && <CardLocationPicker key={activeCardKey} tripId={trip.id} location={cardLocation} onChange={setCardLocation} disabled={cardFetcher.state !== "idle"} />}
              </>}

              {cardErrorFor === activeCardKey && cardFetcher.data?.error && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {cardFetcher.data.error}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2.5 border-t border-border pt-4">
                {activeCard.mode === "edit" && (
                  <button type="button" className="mr-auto h-10 cursor-pointer rounded-[10px] px-3 text-sm font-semibold text-destructive hover:bg-destructive-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:cursor-wait disabled:opacity-50"
                    disabled={cardFetcher.state !== "idle"} onClick={confirmDeleteCard}>
                    {cardFetcher.state !== "idle" && cardFetcher.formData?.get("intent") === "delete-card" ? "Deleting…" : "Delete card"}
                  </button>
                )}
                <button
                  className="h-10 cursor-pointer rounded-[10px] px-4 text-sm font-semibold text-secondary-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  type="button"
                  onClick={closeCard}
                >
                  Cancel
                </button>
                <button
                  className="h-10 cursor-pointer rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-input"
                  type="submit"
                  disabled={
                    (cardDraft.type === "transport" ? !cardDraft.startLocation.trim() || !cardDraft.endLocation.trim() : !cardDraft.title.trim()) || cardFetcher.state !== "idle"
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
          </section>
        </div>
      )}
    </>
  );
}
