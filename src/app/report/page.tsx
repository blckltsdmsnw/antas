"use client";

import { useState } from "react";
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
    return <p>Salamat. Naitala na ang report mo.</p>;
  }

  return (
    <main>
      <h1>Gaano kalalim ang tubig?</h1>
      <DepthSlider value={depth} onChange={setDepth} />
      <button onClick={handleSubmit} disabled={status === "sending"}>
        {status === "sending" ? "Ipinapadala..." : "I-report"}
      </button>
      {errors.map((code) => (
        <p key={code} role="alert">
          {ERROR_MESSAGES[code]}
        </p>
      ))}
    </main>
  );
}
