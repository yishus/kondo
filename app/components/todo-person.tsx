import { useEffect, useId, useRef, useState } from "react";
import type { TodoMember } from "../todo-mentions";
import { Icon } from "./icon";

export function TodoPerson({ members, ownerId, title, disabled, onChange }: {
  members: TodoMember[];
  ownerId: string;
  title: string;
  disabled: boolean;
  onChange: (ownerId: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const owner = members.find((member) => member.id === ownerId);

  useEffect(() => {
    if (!open) return;
    const close = () => popover.current?.hidePopover();
    window.addEventListener("resize", close);
    // A scroll inside the member list should not dismiss it.
    const onScroll = (event: Event) => { if (!(event.target instanceof Node) || !popover.current?.contains(event.target)) close(); };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function choose(nextId: string) {
    popover.current?.hidePopover();
    trigger.current?.focus();
    onChange(nextId);
  }

  return <div className="shrink-0 py-1">
    <button ref={trigger} type="button" popoverTarget={id} disabled={disabled}
      className={`todo-avatar todo-person-trigger ${owner ? "" : "todo-person-empty"}`}
      aria-label={owner ? `Change person tagged to ${title}: ${owner.name}` : `Tag a person to ${title}`}
      title={owner ? `Tagged: ${owner.name}` : "Tag a person"} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => {
        if (!trigger.current || !popover.current) return;
        const rect = trigger.current.getBoundingClientRect();
        const menu = popover.current;
        menu.style.left = `${Math.max(8, Math.min(rect.right - 280, window.innerWidth - 288))}px`;
        const below = window.innerHeight - rect.bottom - 16;
        const above = rect.top - 16;
        const placeBelow = below >= 220 || below >= above;
        menu.style.top = placeBelow ? `${rect.bottom + 6}px` : "auto";
        menu.style.bottom = placeBelow ? "auto" : `${window.innerHeight - rect.top + 6}px`;
        menu.style.maxHeight = `${Math.max(80, placeBelow ? below : above)}px`;
      }}>
      {owner ? Array.from(owner.name.trim() || owner.email)[0].toUpperCase() : <Icon name="plus" width="14" height="14" />}
    </button>
    <div ref={popover} id={id} popover="auto" role="dialog" aria-label={`Tag a person to ${title}`} className="todo-person-popover"
      onToggle={(event) => {
        const isOpen = event.newState === "open";
        setOpen(isOpen);
        if (isOpen) (popover.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? popover.current?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
      }}>
      <p className="px-3 py-2 text-xs font-medium text-muted-foreground">{owner ? "Change tagged person" : "Tag a board member"}</p>
      <div className="todo-member-list">
        {members.map((member) => <button key={member.id} type="button" className="todo-member-option" disabled={disabled}
          aria-pressed={member.id === ownerId} onClick={() => choose(member.id)}>
          <span className="todo-avatar" aria-hidden="true">{Array.from(member.name.trim() || member.email)[0].toUpperCase()}</span>
          <span className="min-w-0 flex-1 text-left"><span className="block truncate">{member.name}</span><span className="block truncate text-xs text-muted-foreground">{member.email}</span></span>
          {member.id === ownerId && <span aria-hidden="true">✓</span>}
        </button>)}
        {!members.length && <p className="px-3 py-2 text-xs text-muted-foreground">No board members available.</p>}
      </div>
      {ownerId && <div className="mt-1 border-t border-border pt-1"><button type="button" disabled={disabled}
        className="todo-member-option text-destructive" onClick={() => choose("")}>Remove tagged person</button></div>}
    </div>
  </div>;
}
