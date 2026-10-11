import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { attachmentFileError, formatFileSize, MAX_TRIP_FILES_PER_UPLOAD, tripAttachmentUrl } from "../attachments";
import type { TripAttachment } from "../db/schema";
import type { action } from "../routes/notes";

function TripFile({ tripId, attachment }: { tripId: string; attachment: TripAttachment }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const url = tripAttachmentUrl(tripId, attachment.id);
  return <li className="p-[12px_0] border-b border-b-border">
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 basis-40">
        <a href={url} target="_blank" rel="noopener noreferrer" className="wrap-break-word text-sm font-medium text-primary hover:underline">{attachment.filename}</a>
        <p className="mt-1 text-xs text-muted-foreground">{attachment.contentType === "application/pdf" ? "PDF" : attachment.contentType === "image/png" ? "PNG" : "JPG"} · {formatFileSize(attachment.size)}</p>
      </div>
      <a href={`${url}?download=1`} className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" aria-label={`Download ${attachment.filename}`}>Download</a>
      <fetcher.Form method="post" onSubmit={(event) => {
        if (!window.confirm(`Remove “${attachment.filename}” from this trip? This cannot be undone.`)) event.preventDefault();
      }}>
        <input type="hidden" name="intent" value="remove-file" />
        <input type="hidden" name="attachmentId" value={attachment.id} />
        <button type="submit" disabled={busy} className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 disabled:opacity-[.45] disabled:cursor-not-allowed text-destructive hover:bg-destructive-soft" aria-label={`Remove ${attachment.filename}`}>{busy ? "Removing…" : "Remove"}</button>
      </fetcher.Form>
    </div>
    {fetcher.data?.error && <p role="alert" className="mt-2 text-sm text-destructive">{fetcher.data.error}</p>}
  </li>;
}

export function TripFiles({ tripId, attachments }: { tripId: string; attachments: TripAttachment[] }) {
  const fetcher = useFetcher<typeof action>();
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && submitted.current) {
      submitted.current = false;
      if (fetcher.data?.ok) {
        form.current?.reset();
        setFiles([]);
        setError(null);
      }
    }
  }, [fetcher.state, fetcher.data]);

  return <section className="min-w-0" aria-labelledby="trip-files-heading">
    <h2 id="trip-files-heading" className="text-[15px] font-medium tracking-[-.02em]">Trip files</h2>
    <p className="mt-1.5 text-muted-foreground text-[12px] leading-[1.6]">Keep tickets, documents, and photos together for everyone on this trip.</p>
    {attachments.length
      ? <ul className="mt-5 grid" aria-label="Trip files">{attachments.map((attachment) => <TripFile key={attachment.id} tripId={tripId} attachment={attachment} />)}</ul>
      : <p className="p-[18px_0] text-muted-foreground text-[12px] mt-5">No trip files yet. Upload your first file below.</p>}
    <fetcher.Form ref={form} method="post" encType="multipart/form-data" className="mt-5 grid gap-3" onSubmit={() => { submitted.current = true; }}>
      <input type="hidden" name="intent" value="upload-files" />
      <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">Add trip files
        <input type="file" name="attachments" className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" multiple required disabled={busy}
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" aria-describedby="trip-files-help" aria-invalid={Boolean(error)}
          onChange={(event) => {
            const next = Array.from(event.target.files ?? []);
            const nextError = next.map(attachmentFileError).find(Boolean)
              ?? (next.length > MAX_TRIP_FILES_PER_UPLOAD ? `Upload up to ${MAX_TRIP_FILES_PER_UPLOAD} files at a time.` : null);
            event.target.setCustomValidity(nextError ?? "");
            setFiles(next);
            setError(nextError);
          }} />
      </label>
      <p id="trip-files-help" className="text-xs text-muted-foreground">JPG, PNG or PDF · Up to {MAX_TRIP_FILES_PER_UPLOAD} files per upload · 10 MB per file.</p>
      {files.length > 0 && <ul className="grid gap-1 text-xs text-muted-foreground" aria-label="Files to upload">
        {files.map((file, index) => <li key={index} className="wrap-break-word">{file.name} · {formatFileSize(file.size)}</li>)}
      </ul>}
      {(error || fetcher.data?.error) && <p role="alert" className="text-sm text-destructive">{error || fetcher.data?.error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">{busy ? "Uploading…" : !files.length && fetcher.data?.ok ? "Files uploaded." : ""}</p>
        <button type="submit" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-primary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-primary-hover [&:hover:not(:disabled)]:text-primary-foreground disabled:opacity-[.45] disabled:cursor-not-allowed bg-primary" disabled={busy || !files.length || Boolean(error)}>{busy ? "Uploading…" : "Upload files"}</button>
      </div>
    </fetcher.Form>
  </section>;
}
