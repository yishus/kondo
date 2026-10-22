import { useId, useState } from "react";
import { useFetcher } from "react-router";
import type { action } from "../routes/trip-layout";

export function TripTitle({ tripId, title }: { tripId: string; title: string }) {
  const fetcher = useFetcher<typeof action>({ key: `trip-title:${tripId}` });
  const [draft, setDraft] = useState<string | null>(null);
  const errorId = useId();
  const saving = fetcher.state !== "idle";
  const pendingTitle = saving ? fetcher.formData?.get("title") : null;
  const error = !saving && draft === null ? fetcher.data?.error : null;

  function finish() {
    const nextTitle = draft?.trim();
    setDraft(null);
    if (!nextTitle || nextTitle === title || saving) return;
    fetcher.submit({ intent: "update-title", title: nextTitle }, {
      action: `/trips/${encodeURIComponent(tripId)}`, method: "post",
    });
  }

  return <>
    <h1>
      {draft !== null ? <input autoFocus aria-label="Trip title" value={draft} maxLength={100}
        className="min-h-9 w-full min-w-0 rounded-md border border-input bg-surface px-2 py-1 text-[inherit] font-[inherit]"
        onChange={(event) => setDraft(event.target.value)} onBlur={finish}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") {
            event.preventDefault(); event.stopPropagation(); setDraft(null);
          }
        }} />
        : <button type="button" aria-label="Edit trip title" title="Click to edit" disabled={saving}
          aria-describedby={error ? errorId : undefined}
          className="w-full rounded-md text-left wrap-anywhere hover:text-secondary-foreground disabled:opacity-50"
          onClick={() => setDraft(title)}>{typeof pendingTitle === "string" ? pendingTitle : title}</button>}
    </h1>
    {saving && <p role="status" className="mt-1.5 text-xs text-muted-foreground">Saving…</p>}
    {error && <p id={errorId} role="alert" className="mt-1.5 text-sm text-destructive">{error}</p>}
  </>;
}
