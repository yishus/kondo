import { useRef, useState } from "react";

export function CardEditorTitle({ value, label = "Title", editable, disabled, onChange, onEdit }: {
  value: string; label?: string; editable: boolean; disabled: boolean;
  onChange: (value: string) => void; onEdit: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const previous = useRef(value);

  function finish() {
    if (!value.trim()) onChange(previous.current);
    setEditing(false);
  }

  return <h2 aria-label={value} className="min-w-0 flex-1 text-[18px] font-[550] leading-snug tracking-[-.02em] wrap-anywhere">
    {editing ? <input autoFocus aria-label={label} value={value} disabled={disabled}
      className="min-h-9 w-full min-w-0 rounded-md border border-input bg-surface px-2 py-1 text-[inherit] font-[inherit]"
      onChange={(event) => onChange(event.target.value)} onBlur={finish}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); finish(); }
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation();
          onChange(previous.current); setEditing(false);
        }
      }} />
      : editable ? <button type="button" aria-label={`Edit ${label.toLowerCase()}`} disabled={disabled}
        className="w-full rounded-md text-left wrap-anywhere hover:text-secondary-foreground" title="Click to edit"
        onClick={() => { previous.current = value; onEdit(); setEditing(true); }}>{value}</button>
        : value}
  </h2>;
}
