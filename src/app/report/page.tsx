"use client";

import { useState } from "react";
import Link from "next/link";
import { DepthSlider } from "@/components/DepthSlider";
import { PhotoCapture } from "@/components/PhotoCapture";
import { HazardPicker } from "@/components/HazardPicker";
import { submitReport, type SubmitErrorCode } from "@/app/actions/submit-report";
import {
  formatAccuracy,
  needsLocationConfirmation,
} from "@/lib/reports/accuracy";
import { reportPhotoPath, REPORT_PHOTO_BUCKET } from "@/lib/reports/photo";
import { createClient } from "@/lib/supabase/client";
import type { DepthLevel } from "@/lib/depth/scale";
import { SEVERITIES, isPublicHazard, type HazardType, type Severity } from "@/lib/hazard/types";
import { severityWord } from "@/lib/hazard/name";
import { useCopy } from "@/lib/i18n/context";
import type { Copy } from "@/lib/i18n/strings";

/** Everything the page can display, including the failures it detects itself. */
type PageErrorCode = SubmitErrorCode | "no_location" | "upload_failed";

/**
 * Which string each failure shows.
 *
 * `suspended` is the one to read in `screens.ts` before touching: it says what
 * happened and deliberately does NOT invite a retry, because retrying cannot
 * work. It also says the emergency route is still open, which is true -
 * suspension withdraws the ability to contribute, never the ability to ask for
 * help - and that sentence has to survive into every language.
 */
const ERROR_KEY: Record<PageErrorCode, keyof Copy["screens"]> = {
  missing_hazard: "errMissingHazard",
  invalid_depth: "errInvalidDepth",
  depth_not_allowed: "errDepthNotAllowed",
  missing_severity: "errMissingSeverity",
  invalid_coordinates: "errInvalidCoordinates",
  outside_pilot_area: "errOutsidePilotArea",
  not_signed_in: "errNotSignedIn",
  insert_failed: "errInsertFailed",
  suspended: "errSuspended",
  no_location: "errNoLocation",
  upload_failed: "errUploadFailed",
};

/** A single geolocation reading, kept while the user confirms it. */
interface Fix {
  lat: number;
  lon: number;
  accuracyM: number | null;
}

export default function ReportPage() {
  const copy = useCopy();
  const [hazard, setHazard] = useState<HazardType | null>(null);
  const [depth, setDepth] = useState<DepthLevel>("knee");
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [status, setStatus] = useState<
    "idle" | "locating" | "confirming" | "sending" | "sent"
  >("idle");
  const [fix, setFix] = useState<Fix | null>(null);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [errors, setErrors] = useState<PageErrorCode[]>([]);

  /**
   * Uploads the photo, if there is one, and returns its storage path.
   *
   * `undefined` means "nothing to upload"; `null` means the upload failed and
   * the caller should stop. Collapsing those two into one falsy value would
   * turn a failed upload into a silently photo-less report.
   */
  async function uploadPhoto(): Promise<string | null | undefined> {
    if (!photo) return undefined;

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setErrors(["not_signed_in"]);
      return null;
    }

    const path = reportPhotoPath(userData.user.id);
    const { error } = await supabase.storage
      .from(REPORT_PHOTO_BUCKET)
      .upload(path, photo.file, { contentType: "image/jpeg" });

    if (error) {
      setErrors(["upload_failed"]);
      return null;
    }
    return path;
  }

  async function send(from: Fix) {
    setStatus("sending");

    const photoPath = await uploadPhoto();
    if (photoPath === null) {
      setStatus("idle");
      return;
    }

    const result = await submitReport({
      hazard,
      severity,
      depth: hazard === "flood" ? depth : "",
      lat: from.lat,
      lon: from.lon,
      gpsAccuracyM: from.accuracyM,
      photoPath,
    });

    if (!result.ok) {
      setErrors(result.errors);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  async function handleSubmit() {
    setStatus("locating");
    setErrors([]);

    const position = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(
        resolve,
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000 },
      ),
    );

    if (!position) {
      setErrors(["no_location"]);
      setStatus("idle");
      return;
    }

    const reading: Fix = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? null,
    };

    // A browser with no GPS falls back to IP or Wi-Fi lookup, which can be off
    // by tens of kilometres. Drawn as an ordinary pin, that puts "chest-deep"
    // on a street that is dry, and nobody reading the history can tell.
    if (needsLocationConfirmation(reading.accuracyM)) {
      setFix(reading);
      setStatus("confirming");
      return;
    }

    await send(reading);
  }

  if (status === "sent") {
    return (
      <main className="task-page">
        <div className="done">
          <h1 className="done-title">{copy.screens.reportDoneTitle}</h1>
          <p className="done-body">
            {hazard !== null && !isPublicHazard(hazard)
              ? copy.screens.reportDoneNotOnMap
              : copy.screens.reportDoneBody}
          </p>
        </div>
        <p style={{ marginTop: 24 }}>
          <Link href="/" className="quiet-link">
            {copy.screens.reportBackToMap}
          </Link>
        </p>
      </main>
    );
  }

  if (status === "confirming" && fix) {
    return (
      <main className="task-page">
        <h1 className="task-title">{copy.screens.vagueTitle}</h1>
        <p className="task-lede">
          {copy.screens.vagueLede(formatAccuracy(fix.accuracyM))}
        </p>
        <p className="task-lede">{copy.screens.vagueAdvice}</p>

        <div style={{ marginTop: 28, display: "grid", gap: 12 }}>
          <button className="btn" onClick={() => void handleSubmit()}>
            {copy.screens.vagueRetry}
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => void send(fix)}
          >
            {copy.screens.vagueContinue}
          </button>
        </div>

        <p style={{ marginTop: 20 }}>
          <button
            className="quiet-link"
            onClick={() => {
              setFix(null);
              setStatus("idle");
            }}
          >
            {copy.screens.cancel}
          </button>
        </p>
      </main>
    );
  }

  if (hazard === null) {
    return (
      <main className="task-page">
        <HazardPicker onPick={setHazard} />
      </main>
    );
  }

  const isBusy = status === "locating" || status === "sending";
  const isReportComplete = hazard === "flood" || severity !== null;

  return (
    <main className="task-page">
      <div className="task-header">
        <h1 className="task-title">
          {hazard === "flood" ? copy.screens.reportTitle : copy.hazard.severityPrompt}
        </h1>
        <button
          type="button"
          className="quiet-link task-header-back"
          onClick={() => {
            setHazard(null);
            setSeverity(null);
          }}
        >
          {copy.hazard.back}
        </button>
      </div>
      {hazard === "flood" && <p className="task-lede">{copy.screens.reportLede}</p>}

      {hazard === "flood" ? (
        <DepthSlider value={depth} onChange={setDepth} />
      ) : (
        <>
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              className="btn severity-choice"
              aria-pressed={severity === s}
              onClick={() => setSeverity(s)}
            >
              {severityWord(hazard, s, copy.hazard)}
            </button>
          ))}
        </>
      )}

      {(hazard === "medical" || hazard === "accident") && (
        <p className="notice">{copy.hazard.tellBarangay}</p>
      )}

      {/* Optional, and second - the slider is the report. A photo makes it
          checkable by someone who was not there, which is worth a lot, but
          demanding one would lose every report made in heavy rain. */}
      {photo ? (
        <figure className="capture-card capture-card--shot">
          <img className="capture-shot" src={photo.url} alt={copy.screens.yourPhoto} />
          <figcaption className="capture-actions">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                URL.revokeObjectURL(photo.url);
                setPhoto(null);
              }}
            >
              {copy.screens.reportPhotoRemove}
            </button>
          </figcaption>
        </figure>
      ) : (
        <PhotoCapture
          prompt={copy.screens.reportPhotoPrompt}
          note={copy.screens.reportPhotoNote}
          openLabel={copy.screens.reportPhotoOpen}
          variant="secondary"
          /*
           * The in-page viewfinder, not the phone's camera app.
           *
           * This read `source="native"` until Mr. Peralta reviewed the system
           * and asked that reports be captured with the built-in camera rather
           * than uploaded. Native mode opens a file picker, and every browser
           * that shows it also offers the gallery beside it - so "take a photo"
           * was one tap away from "attach any photo you already had". Live mode
           * is the honest reading of the instruction, and it is the same
           * anti-abuse argument SOS has always made; the only reason report was
           * ever exempt is that a depth photo is optional.
           */
          onCapture={(file) =>
            setPhoto({ file, url: URL.createObjectURL(file) })
          }
        />
      )}

      <div style={{ marginTop: 28 }}>
        <button
          className="btn"
          onClick={handleSubmit}
          disabled={isBusy || !isReportComplete}
        >
          {status === "locating"
            ? copy.screens.reportLocating
            : status === "sending"
              ? copy.screens.reportSending
              : copy.screens.reportSend}
        </button>
      </div>

      {errors.map((code) => (
        <p key={code} className="alert" role="alert">
          {copy.screens[ERROR_KEY[code]] as string}
        </p>
      ))}

      {/* Without this the primary flow dead-ends: the message tells you to sign
          in but gives you no way to get there. */}
      {errors.includes("not_signed_in") && (
        <p style={{ marginTop: 16 }}>
          <Link href="/login" className="btn">
            {copy.screens.loginTitle}
          </Link>
        </p>
      )}
    </main>
  );
}
