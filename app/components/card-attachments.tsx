import { useRef, useState } from "react";
import { attachmentFileError, attachmentUrl, formatFileSize, MAX_ATTACHMENTS } from "../attachments";
import type { CardAttachment } from "../db/schema";

export function CardAttachments({ tripId, attachments, disabled }: {
  tripId: string;
  attachments: CardAttachment[];
  disabled: boolean;
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
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
      <legend className="mb-2 text-sm font-bold">Attachments <span className="font-normal text-[#626f86]">(optional)</span></legend>
      {attachments.length > 0 && (
        <ul className="grid gap-2" aria-label="Saved attachments">
          {attachments.map((attachment) => {
            const removing = removed.includes(attachment.id);
            const url = attachmentUrl(tripId, attachment.cardId, attachment.id);
            return (
              <li key={attachment.id} className="flex items-center gap-2 rounded-[10px] border border-[#dcdfe4] p-3">
                {removing && <input type="hidden" name="removeAttachmentId" value={attachment.id} />}
                <div className="min-w-0 flex-1">
                  <a href={url} target="_blank" rel="noopener noreferrer" className={`block break-words text-sm font-semibold text-[#0c66e4] hover:underline ${removing ? "line-through opacity-50" : ""}`}>{attachment.filename}</a>
                  <p className="mt-1 text-xs text-[#626f86]">{removing ? "Will be removed when you save" : `${attachment.contentType === "application/pdf" ? "PDF" : "JPG"} · ${formatFileSize(attachment.size)}`}</p>
                  {!removing && <a href={`${url}?download=1`} className="mt-1 inline-block text-xs font-semibold text-[#0c66e4] hover:underline" aria-label={`Download ${attachment.filename}`}>Download</a>}
                </div>
                <button type="button" className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-[#dcdfe4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4] shrink-0 text-[#44546f]" aria-label={`${removing ? "Keep" : "Remove"} ${attachment.filename}`} onClick={() => {
                  const next = removing ? removed.filter((id) => id !== attachment.id) : [...removed, attachment.id];
                  setRemoved(next);
                  validate(files, next);
                }}>{removing ? "Undo" : "Remove"}</button>
              </li>
            );
          })}
        </ul>
      )}
      <label className="grid min-w-0 gap-1.5 text-sm font-bold">
        Add files
        <input className="min-w-0 w-full rounded-[10px] border border-[#b6beca] bg-white px-3 py-2.5 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4]" ref={inputRef} name="attachments" type="file" multiple accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf" aria-describedby="attachment-help" aria-invalid={Boolean(error)} onChange={(event) => {
          const next = Array.from(event.target.files ?? []);
          setFiles(next);
          validate(next, removed);
        }} />
      </label>
      <p id="attachment-help" className="text-xs text-[#626f86]">JPG or PDF · Up to 5 files per card · 10 MB per file. Files are uploaded when you save.</p>
      {files.length > 0 && (
        <div className="rounded-[10px] bg-[#f4f6f8] p-3">
          <ul aria-label="Files to upload" className="grid gap-1 text-sm">
            {files.map((file, index) => <li key={index} className="break-words">{file.name} <span className="text-xs text-[#626f86]">({formatFileSize(file.size)})</span></li>)}
          </ul>
          <button type="button" className="cursor-pointer rounded-[10px] px-3 py-2.5 text-sm font-semibold hover:bg-[#dcdfe4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c66e4] mt-1 text-[#44546f]" onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            setFiles([]);
            validate([], removed);
          }}>Clear selected files</button>
        </div>
      )}
      {error && <p className="text-sm text-[#ae2a19]" role="alert">{error}</p>}
    </fieldset>
  );
}
