import { useEffect, useId, useRef, useState } from "react";
import { activeTodoMention, memberMention, type TodoMember } from "../todo-mentions";

export function TodoMentionInput({ members, disabled }: { members: TodoMember[]; disabled: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [mention, setMention] = useState<ReturnType<typeof activeTodoMention>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = mention ? members.filter((member) =>
    member.name.toLowerCase().includes(mention.query) || member.email.toLowerCase().includes(mention.query),
  ) : [];
  const open = !!mention && !disabled;
  const selectedIndex = Math.min(activeIndex, suggestions.length - 1);

  useEffect(() => { if (disabled) setMention(null); }, [disabled]);
  useEffect(() => {
    if (open && selectedIndex >= 0) document.getElementById(`${id}-option-${selectedIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [id, open, selectedIndex]);

  function updateMention() {
    const field = input.current;
    if (!field) return;
    setMention(activeTodoMention(field.value, field.selectionStart ?? field.value.length));
    setActiveIndex(0);
  }

  function choose(member: TodoMember) {
    const field = input.current;
    if (!field || !mention) return;
    // Replace the remainder of an existing mention when editing in its middle.
    const suffix = field.value.slice(mention.start);
    const existing = members.map((item) => memberMention(item, members))
      .sort((a, b) => b.length - a.length)
      .find((token) => suffix.toLowerCase().startsWith(token.toLowerCase()));
    const end = existing ? Math.max(mention.end, mention.start + existing.length) : mention.end;
    const token = `${memberMention(member, members)} `;
    const next = field.value.slice(0, mention.start) + token + field.value.slice(end).replace(/^ /, "");
    if (next.length > field.maxLength) return;
    field.value = next;
    field.focus();
    field.setSelectionRange(mention.start + token.length, mention.start + token.length);
    setMention(null);
  }

  return <div className="relative min-w-0 flex-1 basis-48">
    <label htmlFor={id} className="ui-field">New to-do</label>
    <input ref={input} id={id} className="ui-input mt-1.5" name="title" required maxLength={500} disabled={disabled}
      placeholder="Add a task, @name to tag" autoComplete="off" role="combobox" aria-autocomplete="list"
      aria-expanded={open} aria-controls={open ? `${id}-suggestions` : undefined}
      aria-activedescendant={open && selectedIndex >= 0 ? `${id}-option-${selectedIndex}` : undefined}
      onChange={updateMention} onClick={updateMention}
      onBlur={() => setMention(null)}
      onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateMention(); }}
      onKeyDown={(event) => {
        if (!open || event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); setMention(null); }
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
          event.preventDefault();
          setActiveIndex((selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
        }
        if (event.key === "Enter" && selectedIndex >= 0) {
          event.preventDefault();
          choose(suggestions[selectedIndex]);
        }
      }} />
    {open && <div className="todo-mention-menu">
      <ul id={`${id}-suggestions`} role="listbox" aria-label="Board members" className="todo-member-list">
        {suggestions.map((member, index) => <li key={member.id} id={`${id}-option-${index}`} role="option"
          aria-selected={selectedIndex === index} className="todo-member-option"
          onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(member)}>
          <span className="todo-avatar" aria-hidden="true">{Array.from(member.name.trim() || member.email)[0].toUpperCase()}</span>
          <span className="min-w-0"><span className="block truncate">{member.name}</span><span className="block truncate text-xs text-muted-foreground">{member.email}</span></span>
        </li>)}
      </ul>
      {!suggestions.length && <p role="status" className="px-3 py-2 text-xs text-muted-foreground">No matching board members.</p>}
    </div>}
  </div>;
}
