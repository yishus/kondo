import { MarkdownContent } from "./markdown-content";
import { useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const formats = [
  { label: "Bold", icon: <strong>B</strong>, before: "**", after: "**", placeholder: "bold text" },
  { label: "Italic", icon: <em>I</em>, before: "_", after: "_", placeholder: "italic text" },
  { label: "Heading", icon: "H", before: "### ", after: "", placeholder: "Heading", block: true },
  { label: "Quote", icon: "❞", before: "> ", after: "", placeholder: "Quote", block: true },
  { label: "Code", icon: "<>", before: "`", after: "`", placeholder: "code" },
  { label: "Link", icon: "↗", before: "[", after: "](https://)", placeholder: "link text" },
  { label: "Bulleted list", icon: "• ≡", before: "- ", after: "", placeholder: "List item", block: true },
  { label: "Task list", icon: "☑", before: "- [ ] ", after: "", placeholder: "Task", block: true },
];

export function MarkdownEditor({
  id, name, value, onChange, disabled = false,
  label = "Description", placeholder = "Add a description…",
  emptyMessage = "No description yet.", saveHint = "Save the card to keep your changes.",
  maxLength, editWhenEmpty = false,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  emptyMessage?: string;
  saveHint?: string;
  maxLength?: number;
  editWhenEmpty?: boolean;
}) {
  const [editing, setEditing] = useState(editWhenEmpty && !value.trim());
  const [tab, setTab] = useState<"write" | "preview">("write");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function format(index: number) {
    const input = textarea.current;
    if (!input || disabled) return;
    const { before, after, placeholder, block } = formats[index];
    const start = block && input.selectionStart > 0 ? value.lastIndexOf("\n", input.selectionStart - 1) + 1 : input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const replacement = block ? selected.split("\n").map((line) => before + line).join("\n") : before + selected + after;
    const nextValue = value.slice(0, start) + replacement + value.slice(end);
    if (maxLength !== undefined && nextValue.length > maxLength) return;
    onChange(nextValue);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + replacement.length - after.length);
    });
  }

  const renderedContent = value.trim() ? (
    <MarkdownContent>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
      }}>{value}</Markdown>
    </MarkdownContent>
  ) : <p className="text-muted-foreground">{emptyMessage}</p>;

  if (!editing) {
    return (
      <div className="min-w-0 text-sm">
        <input type="hidden" name={name} value={value} />
        <div className="mb-2 flex justify-end">
          <button id={id} type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" disabled={disabled}
            aria-label={`Edit ${label.toLowerCase()}`} onClick={() => { setTab("write"); setEditing(true); }}>
            Edit
          </button>
        </div>
        {renderedContent}
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden border border-border rounded-md bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-[4px_12px] p-[6px_8px_0] border-b border-b-border bg-background">
        <div role="tablist" aria-label={`${label} editor`} className="flex gap-1 [&_button]:-mb-px [&_button]:py-2 [&_button]:px-2.5 [&_button]:border [&_button]:border-transparent [&_button]:rounded-[5px_5px_0_0] [&_button]:text-muted-foreground [&_button]:text-[12px] [&_button[aria-selected='true']]:border-border [&_button[aria-selected='true']]:border-b-surface [&_button[aria-selected='true']]:bg-surface [&_button[aria-selected='true']]:text-foreground [&_button:focus-visible]:outline-offset-[-3px]">
          {(["write", "preview"] as const).map((mode, index) => (
            <button
              key={mode}
              ref={(element) => { tabs.current[index] = element; }}
              type="button"
              role="tab"
              id={`${id}-${mode}-tab`}
              aria-controls={`${id}-${mode}-panel`}
              aria-selected={tab === mode}
              tabIndex={tab === mode ? 0 : -1}
              onClick={() => setTab(mode)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
                setTab(next === 0 ? "write" : "preview");
                tabs.current[next]?.focus();
              }}
            >
              {mode === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        {tab === "write" && (
          <div className="[&_button:focus-visible]:outline-offset-[-3px] flex flex-wrap gap-0.5 pb-1.25 [&_button]:grid [&_button]:w-7 [&_button]:h-7 [&_button]:place-items-center [&_button]:rounded-sm [&_button]:text-secondary-foreground [&_button]:text-[13px] [&_button:hover:not(:disabled)]:bg-muted [&_button:hover:not(:disabled)]:text-foreground [&_button:disabled]:opacity-[.45] [&_button:disabled]:cursor-not-allowed" role="group" aria-label="Markdown formatting">
            {formats.map((item, index) => (
              <button key={item.label} type="button" aria-label={item.label} title={item.label}
                disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format(index)}>
                {item.icon}
              </button>
            ))}
          </div>
        )}
      </div>
      <div role="tabpanel" id={`${id}-write-panel`} aria-labelledby={`${id}-write-tab`} hidden={tab !== "write"}>
        <textarea
          ref={textarea}
          autoFocus
          className="block w-full min-h-45 resize-y p-3 border-0 font-[ui-monospace,monospace] text-[13px] leading-[1.65] focus-visible:-outline-offset-2 read-only:opacity-[.6]"
          id={id}
          name={name}
          value={value}
          readOnly={disabled}
          aria-describedby={`${id}-hint`}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && !event.altKey && ["b", "i", "k"].includes(event.key.toLowerCase())) {
              event.preventDefault();
              format(event.key.toLowerCase() === "b" ? 0 : event.key.toLowerCase() === "i" ? 1 : 5);
            }
          }}
        />
      </div>
      <div role="tabpanel" id={`${id}-preview-panel`} aria-labelledby={`${id}-preview-tab`}
        hidden={tab !== "preview"} tabIndex={0} className="min-h-45 p-3 text-[13px] leading-[1.65] wrap-anywhere focus-visible:-outline-offset-2">
        {tab === "preview" && renderedContent}
      </div>
      <div className="py-2 px-3 border-t border-t-border text-muted-foreground text-[11px] flex items-center justify-between gap-2">
        <p id={`${id}-hint`}>Markdown supported. {saveHint}</p>
        <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" disabled={disabled} onClick={() => {
          setEditing(editWhenEmpty && !value.trim());
          requestAnimationFrame(() => document.getElementById(id)?.focus());
        }}>Done</button>
      </div>
    </div>
  );
}
