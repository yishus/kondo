import { useRef, useState } from "react";
import { attachmentUrl } from "../attachments";
import type { CardAttachment } from "../db/schema";
import { gpxFileError, hikeSummary, parseGpx, type HikeTrack } from "../hike-gpx";
import { HikeMap } from "./hike-map";

export function HikeGpxEditor({ tripId, title, attachment, disabled, distanceKm, elevationGainM }: {
  tripId: string; title: string; attachment?: CardAttachment; disabled: boolean;
  distanceKm: number | null; elevationGainM: number | null;
}) {
  const [track, setTrack] = useState<HikeTrack>();
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const url = attachment ? attachmentUrl(tripId, attachment.cardId, attachment.id) : undefined;

  return <fieldset className="grid min-w-0 gap-3 pt-4.5 border-t border-t-border first:border-t-0 [&_>_legend]:float-left [&_>_legend]:w-full [&_>_legend]:mb-0 [&_>_legend_+_*]:clear-both" disabled={disabled}>
    <legend className="text-secondary-foreground text-[12px] font-medium">Hike route</legend>
    {attachment && <div className="flex items-center justify-between gap-3 text-sm">
      <a href={`${url}?download=1`} className={`break-all text-primary hover:underline ${removed ? "line-through" : ""}`}>{attachment.filename}</a>
      <button type="button" className="inline-flex min-h-8.5 shrink-0 items-center justify-center gap-1.5 py-1.75 px-2.5 border border-transparent rounded-md text-secondary-foreground text-[12px] font-medium leading-normal text-center transition-[background-color,border-color] duration-150 [&:hover:not(:disabled)]:bg-muted [&:hover:not(:disabled)]:text-foreground disabled:opacity-[.45] disabled:cursor-not-allowed" onClick={() => setRemoved(!removed)}>{removed ? "Keep file" : "Remove"}</button>
      {removed && <input type="hidden" name="removeGpx" value="1" />}
    </div>}
    <label className="grid min-w-0 gap-1.5 text-secondary-foreground text-[12px] font-medium">{attachment ? "Replace GPX file" : "GPX file"}
      <input ref={input} type="file" name="gpx" accept=".gpx,application/gpx+xml" className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer"
        aria-describedby="gpx-help" aria-invalid={Boolean(error)} onChange={async (event) => {
          const current = ++request.current;
          const field = event.currentTarget;
          const file = field.files?.[0];
          setTrack(undefined);
          setError("");
          field.setCustomValidity("");
          if (!file) return;
          field.setCustomValidity("Wait for the GPX file to finish loading.");
          try {
            const error = gpxFileError(file);
            if (error) throw new Error(error);
            const parsed = parseGpx(await file.text());
            if (current !== request.current) return;
            setTrack(parsed);
            setRemoved(false);
            field.setCustomValidity("");
          } catch (error) {
            if (current !== request.current) return;
            const message = error instanceof Error ? error.message : "Could not read the GPX file.";
            setError(message);
            field.setCustomValidity(message);
          }
        }} />
    </label>
    <p id="gpx-help" className="text-xs text-muted-foreground">One GPX file, up to 10 MB. Length and elevation gain are calculated from its route points when you save.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {track && <p className="text-sm font-medium">{hikeSummary(track.hikeDistanceKm, track.hikeElevationGainM)}</p>}
    {!track && !removed && (distanceKm !== null || elevationGainM !== null) && <p className="text-sm font-medium">{hikeSummary(distanceKm, elevationGainM)}</p>}
    {(track || (url && !removed)) && <HikeMap track={track} url={url} title={title.trim() || undefined} />}
  </fieldset>;
}
