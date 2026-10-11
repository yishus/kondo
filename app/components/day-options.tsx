import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { action } from "../routes/trip";
import { Icon } from "./icon";
import { TimezoneField } from "./timezone-field";

export function DayOptions({ dayId, dateLabel, timezone, tripTimezone, refreshing, refreshDisabled, onRefresh }: {
  dayId: string;
  dateLabel: string;
  timezone: string | null;
  tripTimezone: string | null;
  refreshing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editingTimezone, setEditingTimezone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => menu.current?.hidePopover();
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function positionMenu() {
    if (!trigger.current || !menu.current) return;
    const rect = trigger.current.getBoundingClientRect();
    menu.current.style.left = `${Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198))}px`;
    menu.current.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 100))}px`;
  }

  function closeMenu() {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }

  return <>
    <button ref={trigger} className="grid w-8 h-8 place-items-center rounded-md text-muted-foreground [&:hover]:bg-muted [&:hover]:text-foreground shrink-0" type="button" popoverTarget={id}
      aria-label={`Day options for ${dateLabel}`} title="Day options" aria-haspopup="menu" aria-expanded={open}
      onClick={positionMenu}
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        positionMenu();
        menu.current?.showPopover();
      }}>
      <Icon name="more" width="16" height="16" />
    </button>
    <div id={id} ref={menu} popover="auto" role="menu" aria-label={`Day options for ${dateLabel}`} className="fixed inset-auto w-47.5 m-0 p-1 border border-border rounded-lg bg-surface text-foreground shadow-[0_8px_24px_rgb(0_0_0/12%)]"
      onToggle={(event) => {
        const isOpen = event.newState === "open";
        setOpen(isOpen);
        if (isOpen) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
        if (event.key === "Tab") { closeMenu(); return; }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[index]?.focus();
      }}>
      <button type="button" role="menuitem" tabIndex={-1} className="flex items-center gap-2 w-full py-2.25 px-2.5 rounded-[5px] text-[12px] text-left [&:hover:not(:disabled)]:bg-muted focus-visible:bg-muted disabled:opacity-[.4] disabled:cursor-wait" disabled={refreshDisabled}
        onClick={() => { closeMenu(); onRefresh(); }}>
        <Icon name="clock" width="15" height="15" />{refreshing ? "Estimating…" : "Refresh times"}
      </button>
      <button type="button" role="menuitem" tabIndex={-1} className="flex items-center gap-2 w-full py-2.25 px-2.5 rounded-[5px] text-[12px] text-left [&:hover:not(:disabled)]:bg-muted focus-visible:bg-muted disabled:opacity-[.4] disabled:cursor-wait"
        onClick={() => { closeMenu(); setEditingTimezone(true); }}>
        <Icon name="globe" width="15" height="15" />Set time zone
      </button>
    </div>
    {editingTimezone && <DayTimezoneDialog dayId={dayId} dateLabel={dateLabel} timezone={timezone} tripTimezone={tripTimezone}
      onClose={() => { setEditingTimezone(false); trigger.current?.focus({ preventScroll: true }); }} />}
  </>;
}

function DayTimezoneDialog({ dayId, dateLabel, timezone, tripTimezone, onClose }: {
  dayId: string;
  dateLabel: string;
  timezone: string | null;
  tripTimezone: string | null;
  onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitted = useRef(false);
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  function closeDialog() {
    dialog.current?.close();
    onClose();
  }

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input[name="timezone"]')?.focus();
  }, []);
  useEffect(() => {
    if (!busy && submitted.current) {
      submitted.current = false;
      if (fetcher.data?.ok) {
        dialog.current?.close();
        onClose();
      }
    }
  }, [busy, fetcher.data, onClose]);

  return <dialog ref={dialog} className="w-full max-h-[calc(100dvh-32px)] overflow-y-auto p-5 border border-border rounded-[10px] bg-surface text-foreground text-[13px] shadow-[0_8px_36px_rgb(0_0_0/12%)] [dialog]:fixed [dialog]:inset-0 [dialog]:w-[calc(100%-32px)] [dialog]:m-auto backdrop:[background:rgb(0_0_0/25%)] max-w-sm" aria-labelledby={id}
    onCancel={(event) => { event.preventDefault(); if (!busy) closeDialog(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || busy) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
    }}>
    <div className="flex [align-items:start] justify-between gap-3 mb-5 [&_h2]:pt-1 [&_h2]:text-[15px] [&_h2]:font-[550] [&_h2]:tracking-[-.02em] [&_p]:mb-0.5 [&_p]:text-muted-foreground [&_p]:text-[11px]">
      <div><h2 id={id}>Day time zone</h2><p>{dateLabel}</p></div>
      <button type="button" className="grid w-8 h-8 place-items-center rounded-md text-muted-foreground [&:hover]:bg-muted [&:hover]:text-foreground text-[20px] leading-none" aria-label="Close day time zone" disabled={busy} onClick={closeDialog}>×</button>
    </div>
    <fetcher.Form method="post" className="grid min-w-0 gap-4.5" onSubmit={() => { submitted.current = true; }}>
      <input type="hidden" name="intent" value="update-day-timezone" />
      <input type="hidden" name="dayId" value={dayId} />
      <TimezoneField label="Day time zone" timezone={timezone} placeholder={tripTimezone ? `Trip default: ${tripTimezone}` : "Use trip default"} disabled={busy} />
      <p className="text-xs text-muted-foreground">Leave blank to use the trip default{tripTimezone ? ` (${tripTimezone})` : ""}.</p>
      {fetcher.data?.error && <p role="alert" className="text-xs text-destructive">{fetcher.data.error}</p>}
      <div className="flex flex-wrap [justify-content:end] gap-1.5 pt-4 border-t border-t-border">
        <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" disabled={busy} onClick={closeDialog}>Cancel</button>
        <button className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary" disabled={busy}>{busy ? "Saving…" : "Save time zone"}</button>
      </div>
    </fetcher.Form>
  </dialog>;
}
