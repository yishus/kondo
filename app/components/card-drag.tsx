import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useId, useState, type ReactNode } from "react";

import { googleMapsUrl } from "../card-location";
import type { CardDestination, CardMove, TripCard } from "../card-order";
import { cardTypes, transportModes } from "../card-types";

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
        {draggedCard && <div className="trip-card trip-card-overlay flex min-w-0 items-stretch rounded-[10px] border border-[#dcdfe4] bg-white text-[0.9rem] leading-[1.45] text-[#172b4d] hover:border-[#b6beca] cursor-grabbing px-4 py-3.5 wrap-anywhere shadow-[0_8px_24px_rgb(9_30_66_/_25%)]">{draggedCard.title}</div>}
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
      {isOver && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[3px] h-[3px] rounded-[2px] bg-[#0c66e4]" />}
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
  return (
    <div ref={setNodeRef} className="trip-card flex min-w-0 items-stretch rounded-[10px] border border-[#dcdfe4] bg-white text-[0.9rem] leading-[1.45] text-[#172b4d] hover:border-[#b6beca] shadow-[0_1px_2px_rgb(9_30_66_/_12%)] data-[dragging]:opacity-30 data-[card-type=city]:border-l-[3px] data-[card-type=city]:border-l-[#4b9270] data-[card-type=city]:bg-[#e5f2ec] data-[card-type=transport]:border-l-[3px] data-[card-type=transport]:border-l-[#6088c5] data-[card-type=transport]:bg-[#eaf1fc]" data-card-type={card.type} data-dragging={isDragging || undefined}>
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="grid w-8 shrink-0 cursor-grab touch-none place-items-center rounded-l-[9px] text-[#8590a2] hover:bg-[#f1f2f4] hover:text-[#44546f] active:cursor-grabbing disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4]"
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
        <span className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#626f86]">
          {card.type === "transport" ? transportModes[card.transportMode as keyof typeof transportModes] ?? "Transport" : cardTypes[card.type]}
        </span>
        <button type="button" className="trip-card-title min-w-0 flex-1 cursor-pointer rounded-r-[9px] pt-1 pr-3 pb-3 text-left wrap-anywhere disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4]" aria-haspopup="dialog" onClick={onOpen} disabled={disabled}>
          {card.title}
        </button>
        {card.type === "transport" && (card.departureTime || card.arrivalTime || card.serviceNumber) && (
          <span className="mb-2 text-xs text-[#626f86]">{[card.departureTime && `Dep. ${card.departureTime}`, card.arrivalTime && `Arr. ${card.arrivalTime}`, card.serviceNumber].filter(Boolean).join(" · ")}</span>
        )}
        {card.attachments.length > 0 && <span className="mb-2 text-xs text-[#626f86]">📎 {card.attachments.length} {card.attachments.length === 1 ? "attachment" : "attachments"}</span>}
        {card.googlePlaceId && (
          <a href={googleMapsUrl(card.googlePlaceId, card.googleMapsQuery ?? card.title)} target="_blank" rel="noopener noreferrer"
            className="mb-3 mr-3 w-fit rounded text-xs font-semibold text-[#0c66e4] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4]"
            aria-label={`View ${card.title} on Google Maps`}>
            View on Google Maps <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </div>
  );
}
