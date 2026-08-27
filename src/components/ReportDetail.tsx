"use client";

import { useEffect, useState } from "react";
import type { MapReport } from "@/components/FloodMap";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { ReportFreshness } from "@/components/ReportFreshness";
import { ReporterStanding } from "@/components/ReporterStanding";
import { depthRank, DEPTH_LEVELS } from "@/lib/depth/scale";
import { DEPTH_VAR, SEVERITY_VAR } from "@/lib/depth/presentation";
import { depthName, depthShortName, depthRangeText } from "@/lib/depth/name";
import { hazardName, severityWord } from "@/lib/hazard/name";
import { passabilityOfDepth, passabilityLabel } from "@/lib/passability/mmda";
import { HazardIcon } from "@/components/HazardIcon";
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

  // Flood shows its exact body reading and keeps the depth meter; every other
  // hazard shows what it is and how bad, with no meter - there is no scale to
  // put five steps on.
  const { depth } = report;
  const label =
    depth !== null ? depthName(depth, copy.map) : hazardName(report.hazard, copy.hazard);
  const subLabel =
    depth !== null
      ? `${depthShortName(depth, copy.map)} · ${depthRangeText(depth, copy.map)}`
      : severityWord(report.hazard, report.severity, copy.hazard);
  const swatchColor = depth !== null ? DEPTH_VAR[depth] : SEVERITY_VAR[report.severity];
  const rank = depth !== null ? depthRank(depth) : null;
  // `detailPhotoAlt` reads "water that is X" - true only for flood. Elsewhere
  // the hazard's own name already says what the photo shows.
  const photoAlt = depth !== null ? copy.screens.detailPhotoAlt(label) : label;

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
            alt={photoAlt}
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
        {/* Colour as a bar, never as the text colour. `ankle` and `knee` are
            pale enough to fail contrast against white, and the display size
            here is exactly where that would bite hardest. */}
        <p className="detail-depth">
          <span className="detail-swatch" style={{ background: swatchColor }} />
          {/* The icon says WHAT - only needed once colour has stopped being
              able to say it, i.e. everything that is not flood. A word
              already sits right beside it, so it carries no title. */}
          {depth === null && <HazardIcon hazard={report.hazard} size="md" />}
          {label}
        </p>
        {/* The cross-language gloss used to live here - the Tagalog reading with
            its English equivalent underneath. The language toggle now does that
            job properly, so repeating it would only say the same thing twice in
            whichever language is on screen. The centimetre range is the part
            that was never a translation. Everything but flood shows how bad
            instead, since there is no centimetre range to give. */}
        <p className="detail-sub">{subLabel}</p>

        {/* MMDA's vehicle-passability verdict for this depth - flood only,
            since it is derived from the depth reading and no other hazard has
            one. See `lib/passability/mmda.ts` for where the categories come
            from. The caution is not a pedestrian verdict - MMDA's standard
            covers vehicles, and there is no official threshold for a person
            on foot to invent one from. */}
        {depth !== null && (
          <>
            <p className="detail-sub">{passabilityLabel(passabilityOfDepth(depth), copy.map)}</p>
            <p className="detail-sub">{copy.map.passSource}</p>
            <p className="detail-sub">{copy.map.passNotForWalking}</p>
          </>
        )}

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

        {/* Flood only - there is no five-step scale for a fire or an
            earthquake, and drawing one would claim a precision that does not
            exist. */}
        {rank !== null && (
          <div
            className="depth-meter"
            role="img"
            aria-label={copy.screens.detailMeter(label, rank + 1, DEPTH_LEVELS.length)}
          >
            {DEPTH_LEVELS.map((level, index) => (
              <span
                key={level}
                className={`depth-meter-step${index <= rank ? " is-filled" : ""}`}
                style={index <= rank ? { background: DEPTH_VAR[level] } : undefined}
              />
            ))}
          </div>
        )}

        {/* Everything above describes the moment the report was filed. This is
            the only part that can say whether it is still true. */}
        <ReportFreshness reportId={report.id} />
      </div>

      {zoomed && photo && (
        <PhotoLightbox
          src={photo}
          alt={photoAlt}
          caption={`${label}${depth === null ? ` · ${subLabel}` : ""} · ${relativeTime(report.reportedAt, copy.screens)} · ${clockTime(report.reportedAt)}`}
          onClose={() => setZoomed(false)}
        />
      )}
    </section>
  );
}
