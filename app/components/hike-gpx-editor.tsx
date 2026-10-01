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

  return <fieldset className="ui-section" disabled={disabled}>
    <legend className="ui-label">Hike route</legend>
    {attachment && <div className="flex items-center justify-between gap-3 text-sm">
      <a href={`${url}?download=1`} className={`break-all text-primary hover:underline ${removed ? "line-through" : ""}`}>{attachment.filename}</a>
      <button type="button" className="ui-button" onClick={() => setRemoved(!removed)}>{removed ? "Keep file" : "Remove"}</button>
      {removed && <input type="hidden" name="removeGpx" value="1" />}
    </div>}
    <label className="ui-field">{attachment ? "Replace GPX file" : "GPX file"}
      <input ref={input} type="file" name="gpx" accept=".gpx,application/gpx+xml" className="ui-input"
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
