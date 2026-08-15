"use client";

import { useEffect, useState } from "react";
import type { MapReport } from "@/components/FloodMap";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { ReportFreshness } from "@/components/ReportFreshness";
import { ReporterStanding } from "@/components/ReporterStanding";
import { depthRank, DEPTH_LEVELS } from "@/lib/depth/scale";
import { DEPTH_VAR } from "@/lib/depth/presentation";
import { depthName, depthShortName, depthRangeText } from "@/lib/depth/name";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { clockTime, relativeTime } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

interface ReportDetailProps {
  report: MapReport;
  onClose: () => void;
}

/**
 * One report, opened by tapping its pin.
 *
 * The photo leads because it is the only part of a report that a careless
 * slider drag cannot fake - a picture of knee-deep water is checkable in a way
 * that the word "knee" is not. Everything else on the card is caption.
 */
export function ReportDetail({ report, onClose }: ReportDetailProps) {
  const copy = useCopy();
  const photo = reportPhotoUrl(report.photoPath);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  // A previous pin's photo may have failed; don't blame this one for it.
  // Closing the viewer too, so switching pins never leaves the old photo open.
  useEffect(() => {
    setPhotoFailed(false);
    setZoomed(false);
  }, [report.id]);

  const label = depthName(report.depth, copy.map);
  const rank = depthRank(report.depth);

  return (
    <section className="detail-sheet" aria-label={copy.screens.detailLabel}>
      <button
        type="button"
        className="detail-close"
        onClick={onClose}
        aria-label={copy.screens.detailClose}
      >
        &times;
      </button>

      {photo && !photoFailed ? (
        // A button, not a bare image: opening full screen is a real action and
        // has to be reachable by keyboard as well as by tap.
        <button
          type="button"
          className="detail-photo-button"
          onClick={() => setZoomed(true)}
          aria-label={copy.screens.detailOpenPhoto}
        >
          <img
            className="detail-photo"
            src={photo}
            alt={copy.screens.detailPhotoAlt(label)}
            onError={() => setPhotoFailed(true)}
          />
          <span className="detail-photo-cue" aria-hidden="true">
            {copy.screens.detailZoomCue}
          </span>
        </button>
      ) : (
        // Not an error state. Most reports are a slider drag in the rain, and
        // saying so plainly beats an empty frame or a broken-image icon.
        <p className="detail-nophoto">
          {photoFailed
            ? copy.screens.detailPhotoFailed
            : copy.screens.detailNoPhoto}
        </p>
      )}

      <div className="detail-body">
        {/* Depth colour as a bar, never as the text colour. `ankle` and `knee`
            are pale enough to fail contrast against white, and the display size
            here is exactly where that would bite hardest. */}
        <p className="detail-depth">
          <span
            className="detail-swatch"
            style={{ background: DEPTH_VAR[report.depth] }}
          />
          {label}
        </p>
        {/* The cross-language gloss used to live here - the Tagalog reading with
            its English equivalent underneath. The language toggle now does that
            job properly, so repeating it would only say the same thing twice in
            whichever language is on screen. The centimetre range is the part
            that was never a translation. */}
        <p className="detail-sub">
          {depthShortName(report.depth, copy.map)} ·{" "}
          {depthRangeText(report.depth, copy.map)}
        </p>

        {/* Sits with the reading it qualifies, not down beside the timestamp:
            it is a reason to believe the number above it. Renders nothing at
            all unless the standing was earned. */}
        <ReporterStanding reportId={report.id} />

        {/* Both readings. Someone choosing a route right now needs to know how
            stale this is; someone judging whether the photo still describes the
            street needs the hour it was taken. */}
        <p className="detail-when">
          <strong>{relativeTime(report.reportedAt, copy.screens)}</strong>
          <span className="detail-clock">{clockTime(report.reportedAt)}</span>
        </p>

        <div
          className="depth-meter"
          role="img"
          aria-label={copy.screens.detailMeter(
            label,
            rank + 1,
            DEPTH_LEVELS.length,
          )}
        >
          {DEPTH_LEVELS.map((level, index) => (
            <span
              key={level}
              className={`depth-meter-step${index <= rank ? " is-filled" : ""}`}
              style={index <= rank ? { background: DEPTH_VAR[level] } : undefined}
            />
          ))}
        </div>

        {/* Everything above describes the moment the report was filed. This is
            the only part that can say whether it is still true. */}
        <ReportFreshness reportId={report.id} />
      </div>

      {zoomed && photo && (
        <PhotoLightbox
          src={photo}
          alt={copy.screens.detailPhotoAlt(label)}
          caption={`${label} · ${relativeTime(report.reportedAt, copy.screens)} · ${clockTime(report.reportedAt)}`}
          onClose={() => setZoomed(false)}
        />
      )}
    </section>
  );
}
