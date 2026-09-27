import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useId, useState, type ReactNode } from "react";

import { googleMapsUrl } from "../card-location";
import type { CardDestination, CardMove, TripCard } from "../card-order";
import { cardTypes, locationCategories, transportModes } from "../card-types";
import { CardCover } from "./card-cover";
import { Icon } from "./icon";
import { TransportEstimateSummary } from "./transport-estimate-summary";
import { HikeMap } from "./hike-map";
import { GPX_CONTENT_TYPE, hikeSummary } from "../hike-gpx";
import { attachmentUrl } from "../attachments";

// Pointer drops must actually be inside a target. Keyboard movement snaps to
// measured targets, including empty days.
const collisionDetection: CollisionDetection = (args) => {
  const filtered = { ...args, droppableContainers: args.droppableContainers.filter((container) =>
    Boolean(container.data.current?.destination),
  ) };
  return args.pointerCoordinates ? pointerWithin(filtered) : closestCenter(filtered);
};

export const cardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) return;
  event.preventDefault();
  const currentRect = context.collisionRect;
  if (!currentRect) return;
  const x = currentRect.left + currentRect.width / 2;
  const y = currentRect.top + currentRect.height / 2;
  const horizontal = event.code === "ArrowLeft" || event.code === "ArrowRight";
  const currentDay = context.over?.data.current?.destination.tripDayId
    ?? context.active?.data.current?.card.tripDayId;
  const candidates = context.droppableContainers.getEnabled().flatMap((container) => {
    if (!container.data.current?.destination) return [];
    const rect = context.droppableRects.get(container.id);
    if (!rect || container.id === context.over?.id) return [];
    const dx = rect.left + rect.width / 2 - x;
    const dy = rect.top + rect.height / 2 - y;
    const day = container.data.current?.destination.tripDayId;
    const matches = event.code === "ArrowDown" ? dy > 1 && day === currentDay
      : event.code === "ArrowUp" ? dy < -1 && day === currentDay
      : event.code === "ArrowRight" ? dx > 1 && day !== currentDay
      : dx < -1 && day !== currentDay;
    return matches ? [{ rect, score: horizontal ? Math.abs(dx) * 1000 + Math.abs(dy) : Math.abs(dy) }] : [];
  });
  const target = candidates.sort((a, b) => a.score - b.score)[0];
  if (!target) return;
  return {
    x: currentCoordinates.x + target.rect.left + target.rect.width / 2 - x,
    y: currentCoordinates.y + target.rect.top + target.rect.height / 2 - y,
  };
};

export function CardDragBoard({ children, onMove }: {
  children: ReactNode;
  onMove: (move: CardMove) => void;
}) {
  const id = useId();
  const [draggedCard, setDraggedCard] = useState<TripCard | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: cardKeyboardCoordinates }),
  );

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Press Space or Enter to pick up. Use up and down to choose a position. Use left and right to change columns, including Unscheduled. Press Space or Enter to drop, or Escape to cancel.",
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${active.data.current?.card?.title}.`,
          onDragOver: ({ over }) => over ? over.data.current?.label : "Outside a drop area. Release to cancel.",
          onDragEnd: ({ over }) => over ? `Dropped: ${over.data.current?.label}. Saving move.` : "Move cancelled.",
          onDragCancel: () => "Move cancelled.",
        },
      }}
      onDragStart={({ active }) => {
        setDraggedCard(active.data.current?.card ?? null);
      }}
      onDragCancel={() => { setDraggedCard(null); }}
      onDragEnd={({ active, over }) => {
        setDraggedCard(null);
       
        const card = active.data.current?.card as TripCard | undefined;
        const destination = over?.data.current?.destination as CardDestination | undefined;
        if (card && destination && destination.beforeCardId !== card.id) {
          onMove({ cardId: card.id, fromDayId: card.tripDayId, ...destination });
        }
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {draggedCard && <div className="trip-card trip-card-overlay flex min-w-0 items-stretch rounded-[10px] border border-border bg-surface text-[0.9rem] leading-[1.45] text-foreground hover:border-input cursor-grabbing px-4 py-3.5 wrap-anywhere shadow-[0_8px_24px_rgb(9_30_66_/_25%)]">{draggedCard.title}</div>}
      </DragOverlay>
    </DndContext>
  );
}

export function CardDropSlot({ destination, label, disabled, children }: {
  destination: CardDestination;
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${destination.tripDayId}:${destination.beforeCardId ?? "end"}`,
    data: { destination, label },
    disabled,
  });
  return (
    <div ref={setNodeRef} className="card-drop-slot relative min-w-0 pt-2.5" data-over={isOver || undefined}>
      {isOver && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[3px] h-[3px] rounded-[2px] bg-primary" />}
      {children}
    </div>
  );
}

export function DraggableCard({ card, disabled, onOpen }: {
  card: TripCard;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: card.id, data: { card }, disabled,
  });
  const gpx = card.attachments.find((item) => item.contentType === GPX_CONTENT_TYPE);
  const attachmentCount = card.attachments.filter((item) => item.contentType !== GPX_CONTENT_TYPE).length;
  return (
    <div ref={setNodeRef} className="trip-card flex min-w-0 items-stretch rounded-[9px] border border-border bg-surface text-[0.9rem] leading-[1.45] text-foreground transition-colors hover:border-input data-[dragging]:opacity-30" data-card-type={card.type} data-dragging={isDragging || undefined}>
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="grid w-8 shrink-0 cursor-grab touch-none place-items-center rounded-l-[9px] text-muted-foreground hover:bg-muted hover:text-secondary-foreground active:cursor-grabbing disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        {...attributes}
        {...listeners}
        disabled={disabled}
        data-card-handle={card.id}
        aria-label={`Move ${card.title}`}
        title="Drag to move. Or press Space, then use arrow keys."
      >
        <svg aria-hidden="true" width="16" height="20" viewBox="0 0 16 20" fill="currentColor">
          {[5, 10, 15].map((y) => <g key={y}><circle cx="5" cy={y} r="1.4" /><circle cx="11" cy={y} r="1.4" /></g>)}
        </svg>
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <CardCover card={card} />
        <span className="card-type-label" data-card-label={card.type === "location" ? card.locationCategory ?? "location" : card.type}>
          <Icon name={card.type === "transport" ? "route" : card.type === "city" ? "compass" : "pin"} width="11" height="11" />
          {card.type === "transport"
            ? transportModes[card.transportMode as keyof typeof transportModes] ?? "Transport"
            : card.type === "location" && card.locationCategory
              ? `${cardTypes.location} · ${locationCategories[card.locationCategory]}`
              : cardTypes[card.type]}
        </span>
        <button type="button" className={`trip-card-title min-w-0 flex-1 cursor-pointer rounded-r-[9px] pt-1 pr-3 text-left wrap-anywhere disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${card.type === "city" ? "pb-1" : "pb-3"}`} aria-haspopup="dialog" onClick={onOpen} disabled={disabled}>
          {card.title}
        </button>
        {card.type === "city" && (
          <span className="mb-3 text-xs text-muted-foreground">
            {card.cityLocations.length} {card.cityLocations.length === 1 ? "location" : "locations"}
          </span>
        )}
        {card.type === "transport" && (card.departureTime || card.arrivalTime || card.serviceNumber) && (
          <span className="mb-2 text-xs text-muted-foreground">{[card.departureTime && `Dep. ${card.departureTime}${card.departureTimezone ? ` (${card.departureTimezone})` : ""}`, card.arrivalTime && `Arr. ${card.arrivalTime}${card.arrivalTimezone ? ` (${card.arrivalTimezone})` : ""}`, card.serviceNumber].filter(Boolean).join(" · ")}</span>
        )}
        {card.type === "transport" && card.transportEstimate && (
          <div className="mb-2 pr-3"><TransportEstimateSummary estimate={card.transportEstimate} /></div>
        )}
        {card.type === "hike" && <>
          {gpx && <div className="mb-2 mr-3"><HikeMap compact url={attachmentUrl(card.tripId, card.id, gpx.id)} /></div>}
          {(card.hikeDistanceKm !== null || card.hikeElevationGainM !== null) && (
            <span className="mb-2 text-xs text-muted-foreground">{hikeSummary(card.hikeDistanceKm, card.hikeElevationGainM)}</span>
          )}
        </>}
        {attachmentCount > 0 && <span className="mb-2 text-xs text-muted-foreground">📎 {attachmentCount} {attachmentCount === 1 ? "attachment" : "attachments"}</span>}
        {card.googlePlaceId && (
          <a href={googleMapsUrl(card.googlePlaceId, card.googleMapsQuery ?? card.title)} target="_blank" rel="noopener noreferrer"
            className="mb-3 mr-3 w-fit rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={`View ${card.title} on Google Maps`}>
            View on Google Maps <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </div>
  );
}
