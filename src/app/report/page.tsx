"use client";

import { useState } from "react";
import Link from "next/link";
import { DepthSlider } from "@/components/DepthSlider";
import { submitReport, type SubmitErrorCode } from "@/app/actions/submit-report";
import {
  formatAccuracy,
  needsLocationConfirmation,
} from "@/lib/reports/accuracy";
import type { DepthLevel } from "@/lib/depth/scale";

/** Everything the page can display, including the one failure it detects itself. */
type PageErrorCode = SubmitErrorCode | "no_location";

const ERROR_MESSAGES: Record<PageErrorCode, string> = {
  invalid_depth: "Pumili ng lalim ng tubig.",
  invalid_coordinates: "Hindi mabasa ang lokasyon mo.",
  outside_pilot_area: "Sa ngayon, Metro Manila lang ang saklaw ng Antas.",
  not_signed_in: "Mag-sign in muna bago mag-report.",
  insert_failed: "May problema sa pag-save. Subukan ulit.",
  no_location: "Buksan ang location para makapag-report.",
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
  const [errors, setErrors] = useState<PageErrorCode[]>([]);

  async function send(from: Fix) {
    setStatus("sending");

    const result = await submitReport({
      depth,
      lat: from.lat,
      lon: from.lon,
      gpsAccuracyM: from.accuracyM,
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
        Hilahin pataas ang tubig hanggang sa lalim na nakikita mo ngayon.
      </p>

      <DepthSlider value={depth} onChange={setDepth} />

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
