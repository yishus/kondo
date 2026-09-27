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
  maxLength,
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
}) {
  const [editing, setEditing] = useState(false);
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
    <div className="markdown-content">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
      }}>{value}</Markdown>
    </div>
  ) : <p className="text-muted-foreground">{emptyMessage}</p>;

  if (!editing) {
    return (
      <div className="min-w-0 text-sm">
        <input type="hidden" name={name} value={value} />
        <div className="mb-2 flex justify-end">
          <button id={id} type="button" className="ui-button" disabled={disabled}
            aria-label={`Edit ${label.toLowerCase()}`} onClick={() => { setTab("write"); setEditing(true); }}>
            Edit
          </button>
        </div>
        {renderedContent}
      </div>
    );
  }

  return (
    <div className="markdown-editor">
      <div className="markdown-editor-header">
        <div role="tablist" aria-label={`${label} editor`} className="markdown-editor-tabs">
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
          <div className="markdown-editor-tools" role="group" aria-label="Markdown formatting">
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
          className="markdown-editor-input"
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
        hidden={tab !== "preview"} tabIndex={0} className="markdown-editor-preview">
        {tab === "preview" && renderedContent}
      </div>
      <div className="markdown-editor-hint flex items-center justify-between gap-2">
        <p id={`${id}-hint`}>Markdown supported. {saveHint}</p>
        <button type="button" className="ui-button" disabled={disabled} onClick={() => {
          setEditing(false);
          requestAnimationFrame(() => document.getElementById(id)?.focus());
        }}>Done</button>
      </div>
    </div>
  );
}
