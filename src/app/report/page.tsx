"use client";

import { useState } from "react";
import Link from "next/link";
import { DepthSlider } from "@/components/DepthSlider";
import { PhotoCapture } from "@/components/PhotoCapture";
import { submitReport, type SubmitErrorCode } from "@/app/actions/submit-report";
import {
  formatAccuracy,
  needsLocationConfirmation,
} from "@/lib/reports/accuracy";
import { reportPhotoPath, REPORT_PHOTO_BUCKET } from "@/lib/reports/photo";
import { createClient } from "@/lib/supabase/client";
import type { DepthLevel } from "@/lib/depth/scale";

/** Everything the page can display, including the failures it detects itself. */
type PageErrorCode = SubmitErrorCode | "no_location" | "upload_failed";

const ERROR_MESSAGES: Record<PageErrorCode, string> = {
  invalid_depth: "Pumili ng lalim ng tubig.",
  invalid_coordinates: "Hindi mabasa ang lokasyon mo.",
  outside_pilot_area: "Sa ngayon, Metro Manila lang ang saklaw ng Antas.",
  not_signed_in: "Mag-sign in muna bago mag-report.",
  insert_failed: "May problema sa pag-save. Subukan ulit.",
  no_location: "Buksan ang location para makapag-report.",
  upload_failed: "Hindi naipadala ang larawan. Subukan ulit.",
};

/** A single geolocation reading, kept while the user confirms it. */
interface Fix {
  lat: number;
  lon: number;
  accuracyM: number | null;
}

export default function ReportPage() {
  const [depth, setDepth] = useState<DepthLevel>("knee");
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
      depth,
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
          <h1 className="done-title">Salamat. Naitala na ang report mo.</h1>
          <p className="done-body">
            Makikita na ito ng iba sa mapa. Mag-ingat.
          </p>
        </div>
        <p style={{ marginTop: 24 }}>
          <Link href="/" className="quiet-link">
            Bumalik sa mapa
          </Link>
        </p>
      </main>
    );
  }

  if (status === "confirming" && fix) {
    return (
      <main className="task-page">
        <h1 className="task-title">Malabo ang lokasyon mo</h1>
        <p className="task-lede">
          Hindi sigurado ang telepono mo kung nasaan ka — mga{" "}
          <strong>{formatAccuracy(fix.accuracyM)}</strong> ang puwedeng pagkakamali.
          Ang report mo ay puwedeng mapunta sa maling kalye.
        </p>
        <p className="task-lede">
          Kung nasa loob ka ng gusali, lumabas o lumapit sa bintana, pagkatapos
          subukan ulit. Kung tama naman ang lugar, ituloy mo.
        </p>

        <div style={{ marginTop: 28, display: "grid", gap: 12 }}>
          <button className="btn" onClick={() => void handleSubmit()}>
            Subukan ulit ang lokasyon
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => void send(fix)}
          >
            Ituloy — tama ang lugar
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
            Kanselahin
          </button>
        </p>
      </main>
    );
  }

  const isBusy = status === "locating" || status === "sending";

  return (
    <main className="task-page">
      <h1 className="task-title">Gaano kalalim ang tubig?</h1>
      <p className="task-lede">
        Pindutin kung saan umaabot ang tubig sa katawan ngayon.
      </p>

      <DepthSlider value={depth} onChange={setDepth} />

      {/* Optional, and second - the slider is the report. A photo makes it
          checkable by someone who was not there, which is worth a lot, but
          demanding one would lose every report made in heavy rain. */}
      {photo ? (
        <figure className="capture-card capture-card--shot">
          <img className="capture-shot" src={photo.url} alt="Ang larawang kinuha mo" />
          <figcaption className="capture-actions">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                URL.revokeObjectURL(photo.url);
                setPhoto(null);
              }}
            >
              Alisin ang larawan
            </button>
          </figcaption>
        </figure>
      ) : (
        <PhotoCapture
          prompt="Magdagdag ng larawan ng tubig"
          note="Opsyonal. Makikita ito ng lahat sa mapa."
          openLabel="Kumuha ng larawan"
          variant="secondary"
          source="native"
          onCapture={(file) =>
            setPhoto({ file, url: URL.createObjectURL(file) })
          }
        />
      )}

      <div style={{ marginTop: 28 }}>
        <button className="btn" onClick={handleSubmit} disabled={isBusy}>
          {status === "locating"
            ? "Hinahanap ang lokasyon..."
            : status === "sending"
              ? "Ipinapadala..."
              : "I-report"}
        </button>
      </div>

      {errors.map((code) => (
        <p key={code} className="alert" role="alert">
          {ERROR_MESSAGES[code]}
        </p>
      ))}

      {/* Without this the primary flow dead-ends: the message tells you to sign
          in but gives you no way to get there. */}
      {errors.includes("not_signed_in") && (
        <p style={{ marginTop: 16 }}>
          <Link href="/login" className="btn">
            Mag-sign in
          </Link>
        </p>
      )}
    </main>
  );
}
