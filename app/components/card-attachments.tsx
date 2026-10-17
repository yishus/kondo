import { useEffect, useRef, useState } from "react";
import { attachmentFileError, attachmentUrl, formatFileSize, isImageAttachment, MAX_ATTACHMENTS } from "../attachments";
import type { CardAttachment } from "../db/schema";

function ImagePreview({ url, filename }: { url: string; filename: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full overflow-hidden rounded-md bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={`Open image ${filename}`}>
      <img src={url} alt={filename} className="max-h-64 w-full object-contain" loading="lazy" />
    </a>
  );
}

function UploadImagePreview({ file }: { file: File }) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return preview?.file === file ? <ImagePreview url={preview.url} filename={file.name} /> : null;
}

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
    attachments.some((attachment) => attachment.id === coverAttachmentId && isImageAttachment(attachment.contentType))
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
    <fieldset className="grid min-w-0 gap-3 pt-4.5 border-t border-t-border first:border-t-0 [&_>_legend]:float-left [&_>_legend]:w-full [&_>_legend]:mb-0 [&_>_legend_+_*]:clear-both" disabled={disabled}>
      <legend className="text-secondary-foreground text-[12px] font-medium">Attachments <span className="font-normal text-muted-foreground">(optional)</span></legend>
      {attachments.length > 0 && (
        <ul className="grid gap-2" aria-label="Saved attachments">
          {attachments.map((attachment) => {
            const removing = removed.includes(attachment.id);
            const url = attachmentUrl(tripId, attachment.cardId, attachment.id);
            return (
              <li key={attachment.id} className="p-[12px_0] border-b border-b-border flex flex-wrap items-center gap-2">
                {removing && <input type="hidden" name="removeAttachmentId" value={attachment.id} />}
                {!removing && isImageAttachment(attachment.contentType) && <ImagePreview url={url} filename={attachment.filename} />}
                <div className="min-w-0 flex-1">
                  <a href={url} target="_blank" rel="noopener noreferrer" className={`block wrap-break-word text-[13px] font-medium text-primary hover:underline ${removing ? "line-through opacity-50" : ""}`}>{attachment.filename}</a>
                  <p className="mt-1 text-xs text-muted-foreground">{removing ? "Will be removed when you save" : `${attachment.contentType === "application/pdf" ? "PDF" : attachment.contentType === "image/png" ? "PNG" : "JPG"} · ${formatFileSize(attachment.size)}`}</p>
                  {!removing && <a href={`${url}?download=1`} className="mt-1 inline-block text-xs text-secondary-foreground hover:underline" aria-label={`Download ${attachment.filename}`}>Download</a>}
                </div>
                {allowCover && isImageAttachment(attachment.contentType) && !removing && (
                  <label className="flex items-center gap-2 text-secondary-foreground text-[12px] font-normal [&_input]:accent-primary shrink-0">
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
                <button type="button" className="inline-flex min-h-8.5 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed shrink-0" aria-label={`${removing ? "Keep" : "Remove"} ${attachment.filename}`} onClick={() => {
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
      <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">
        Add files
        <input className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" ref={inputRef} name="attachments" type="file" multiple accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" aria-describedby="attachment-help" aria-invalid={Boolean(error)} onChange={(event) => {
          const next = Array.from(event.target.files ?? []);
          setFiles(next);
          if (coverChoice.startsWith("upload:")) setCoverChoice("");
          validate(next, removed);
        }} />
      </label>
      <p id="attachment-help" className="text-xs text-muted-foreground">JPG, PNG or PDF · Up to 5 files per card · 10 MB per file. Files are uploaded when you save.</p>
      {files.length > 0 && (
        <div className="p-[12px_0] border-b border-b-border">
          <ul aria-label="Files to upload" className="grid gap-2 text-sm">
            {files.map((file, index) => (
              <li key={index} className="flex flex-wrap items-center justify-between gap-3 wrap-break-word">
                {/\.(jpe?g|png)$/i.test(file.name) && !attachmentFileError(file) && <UploadImagePreview file={file} />}
                <span className="min-w-0 flex-1">{file.name} <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span></span>
                {allowCover && /\.(jpe?g|png)$/i.test(file.name) && (
                  <label className="flex items-center gap-2 text-secondary-foreground text-[12px] font-normal [&_input]:accent-primary shrink-0">
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
          <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed mt-1" onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            setFiles([]);
            if (coverChoice.startsWith("upload:")) setCoverChoice("");
            validate([], removed);
          }}>Clear selected files</button>
        </div>
      )}
      {allowCover && (
        <label className="flex items-center gap-2 text-secondary-foreground text-[12px] font-normal [&_input]:accent-primary">
          <input type="radio" name="coverAttachment" value="" checked={!coverChoice} onChange={() => setCoverChoice("")} />
          No uploaded cover image
        </label>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}
