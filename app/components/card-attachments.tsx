import { useRef, useState } from "react";
import { attachmentFileError, attachmentUrl, formatFileSize, MAX_ATTACHMENTS } from "../attachments";
import type { CardAttachment } from "../db/schema";

export function CardAttachments({ tripId, attachments, coverAttachmentId, allowCover, disabled }: {
  tripId: string;
  attachments: CardAttachment[];
  coverAttachmentId: string | null;
  allowCover: boolean;
  disabled: boolean;
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [coverChoice, setCoverChoice] = useState(
    attachments.some((attachment) => attachment.id === coverAttachmentId && attachment.contentType === "image/jpeg")
      ? `existing:${coverAttachmentId}`
      : "",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const count = attachments.length - removed.length + files.length;
  const error = files.map(attachmentFileError).find(Boolean)
    ?? (count > MAX_ATTACHMENTS ? `A card can have up to ${MAX_ATTACHMENTS} attachments.` : null);

  function validate(nextFiles: File[], nextRemoved: string[]) {
    const error = nextFiles.map(attachmentFileError).find(Boolean)
      ?? (attachments.length - nextRemoved.length + nextFiles.length > MAX_ATTACHMENTS ? `A card can have up to ${MAX_ATTACHMENTS} attachments.` : "");
    inputRef.current?.setCustomValidity(error ?? "");
  }

  return (
    <fieldset className="grid min-w-0 gap-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold">Attachments <span className="font-normal text-muted-foreground">(optional)</span></legend>
      {attachments.length > 0 && (
        <ul className="grid gap-2" aria-label="Saved attachments">
          {attachments.map((attachment) => {
            const removing = removed.includes(attachment.id);
            const url = attachmentUrl(tripId, attachment.cardId, attachment.id);
            return (
              <li key={attachment.id} className="flex items-center gap-2 rounded-[10px] border border-border p-3">
                {removing && <input type="hidden" name="removeAttachmentId" value={attachment.id} />}
                <div className="min-w-0 flex-1">
                  <a href={url} target="_blank" rel="noopener noreferrer" className={`block break-words text-sm font-semibold text-primary hover:underline ${removing ? "line-through opacity-50" : ""}`}>{attachment.filename}</a>
                  <p className="mt-1 text-xs text-muted-foreground">{removing ? "Will be removed when you save" : `${attachment.contentType === "application/pdf" ? "PDF" : "JPG"} · ${formatFileSize(attachment.size)}`}</p>
                  {!removing && <a href={`${url}?download=1`} className="mt-1 inline-block text-xs font-semibold text-primary hover:underline" aria-label={`Download ${attachment.filename}`}>Download</a>}
                </div>
                {allowCover && attachment.contentType === "image/jpeg" && !removing && (
                  <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-secondary-foreground">
                    <input
                      type="radio"
                      name="coverAttachment"
                      value={`existing:${attachment.id}`}
                      checked={coverChoice === `existing:${attachment.id}`}
                      onChange={(event) => setCoverChoice(event.target.value)}
                    />
                    Cover
                  </label>
                )}
                <button type="button" className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary shrink-0 text-secondary-foreground" aria-label={`${removing ? "Keep" : "Remove"} ${attachment.filename}`} onClick={() => {
                  const next = removing ? removed.filter((id) => id !== attachment.id) : [...removed, attachment.id];
                  setRemoved(next);
                  if (!removing && coverChoice === `existing:${attachment.id}`) setCoverChoice("");
                  validate(files, next);
                }}>{removing ? "Undo" : "Remove"}</button>
              </li>
            );
          })}
        </ul>
      )}
      <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
        Add files
        <input className="min-w-0 w-full rounded-[10px] border border-input bg-surface px-3 py-2.5 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" ref={inputRef} name="attachments" type="file" multiple accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf" aria-describedby="attachment-help" aria-invalid={Boolean(error)} onChange={(event) => {
          const next = Array.from(event.target.files ?? []);
          setFiles(next);
          if (coverChoice.startsWith("upload:")) setCoverChoice("");
          validate(next, removed);
        }} />
      </label>
      <p id="attachment-help" className="text-xs text-muted-foreground">JPG or PDF · Up to 5 files per card · 10 MB per file. Files are uploaded when you save.</p>
      {files.length > 0 && (
        <div className="rounded-[10px] bg-background p-3">
          <ul aria-label="Files to upload" className="grid gap-2 text-sm">
            {files.map((file, index) => (
              <li key={index} className="flex items-center justify-between gap-3 break-words">
                <span>{file.name} <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span></span>
                {allowCover && /\.jpe?g$/i.test(file.name) && (
                  <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-secondary-foreground">
                    <input
                      type="radio"
                      name="coverAttachment"
                      value={`upload:${index}`}
                      checked={coverChoice === `upload:${index}`}
                      onChange={(event) => setCoverChoice(event.target.value)}
                    />
                    Cover
                  </label>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary mt-1 text-secondary-foreground" onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            setFiles([]);
            if (coverChoice.startsWith("upload:")) setCoverChoice("");
            validate([], removed);
          }}>Clear selected files</button>
        </div>
      )}
      {allowCover && (
        <label className="flex items-center gap-2 text-sm text-secondary-foreground">
          <input type="radio" name="coverAttachment" value="" checked={!coverChoice} onChange={() => setCoverChoice("")} />
          No uploaded cover image
        </label>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}
