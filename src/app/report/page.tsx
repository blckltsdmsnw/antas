"use client";

import { useState } from "react";
import Link from "next/link";
import { DepthSlider } from "@/components/DepthSlider";
import { submitReport, type SubmitErrorCode } from "@/app/actions/submit-report";
import type { DepthLevel } from "@/lib/depth/scale";

/** Everything the page can display, including the one failure it detects itself. */
type PageErrorCode = SubmitErrorCode | "no_location";

const ERROR_MESSAGES: Record<PageErrorCode, string> = {
  invalid_depth: "Pumili ng lalim ng tubig.",
  invalid_coordinates: "Hindi mabasa ang lokasyon mo.",
  outside_pilot_area: "Sa ngayon, Marikina lang ang saklaw ng Antas.",
  not_signed_in: "Mag-sign in muna bago mag-report.",
  insert_failed: "May problema sa pag-save. Subukan ulit.",
  no_location: "Buksan ang location para makapag-report.",
};

export default function ReportPage() {
  const [depth, setDepth] = useState<DepthLevel>("knee");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errors, setErrors] = useState<PageErrorCode[]>([]);

  async function handleSubmit() {
    setStatus("sending");
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

    const result = await submitReport({
      depth,
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      gpsAccuracyM: position.coords.accuracy ?? null,
    });

    if (!result.ok) {
      setErrors(result.errors);
      setStatus("idle");
      return;
    }
    setStatus("sent");
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

  return (
    <main className="task-page">
      <h1 className="task-title">Gaano kalalim ang tubig?</h1>
      <p className="task-lede">
        Hilahin pataas ang tubig hanggang sa lalim na nakikita mo ngayon.
      </p>

      <DepthSlider value={depth} onChange={setDepth} />

      <div style={{ marginTop: 28 }}>
        <button
          className="btn"
          onClick={handleSubmit}
          disabled={status === "sending"}
        >
          {status === "sending" ? "Ipinapadala..." : "I-report"}
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
