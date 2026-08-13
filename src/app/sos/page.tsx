"use client";

import { useState } from "react";
import Link from "next/link";
import { DepthSlider } from "@/components/DepthSlider";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { LiveCamera } from "@/components/LiveCamera";
import { createClient } from "@/lib/supabase/client";
import { submitSos, type SosErrorCode } from "@/app/actions/submit-sos";
import type { DepthLevel } from "@/lib/depth/scale";

type PageErrorCode = SosErrorCode | "no_location" | "upload_failed";

const ERROR_MESSAGES: Record<PageErrorCode, string> = {
  invalid_depth: "Pumili ng lalim ng tubig.",
  invalid_coordinates: "Hindi mabasa ang lokasyon mo.",
  outside_pilot_area: "Sa ngayon, Marikina lang ang saklaw ng Antas.",
  not_signed_in: "Mag-sign in muna bago humingi ng tulong.",
  already_active: "May aktibo ka nang SOS. Hinihintay pa itong suriin.",
  insert_failed: "May problema sa pagpapadala. Subukan ulit.",
  upload_failed: "Hindi naipadala ang larawan. Subukan ulit.",
  no_location: "Buksan ang location para makapagpadala ng SOS.",
};

export default function SosPage() {
  const [depth, setDepth] = useState<DepthLevel>("chest");
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errors, setErrors] = useState<PageErrorCode[]>([]);

  async function handleConfirm() {
    if (!photo) return;
    setStatus("sending");
    setErrors([]);

    const position = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 10_000,
      }),
    );

    if (!position) {
      setErrors(["no_location"]);
      setStatus("idle");
      return;
    }

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setErrors(["not_signed_in"]);
      setStatus("idle");
      return;
    }

    const path = `${userData.user.id}/${Date.now()}.jpg`;
    const upload = await supabase.storage
      .from("sos-photos")
      .upload(path, photo, { contentType: "image/jpeg" });

    if (upload.error) {
      setErrors(["upload_failed"]);
      setStatus("idle");
      return;
    }

    const result = await submitSos({
      depth,
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      gpsAccuracyM: position.coords.accuracy ?? null,
      photoPath: path,
      note: note.trim() === "" ? null : note.trim(),
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
          <h1 className="done-title">Naipadala na ang SOS mo.</h1>
          <p className="done-body">
            Susuriin ito ng barangay. Manatiling ligtas at kung kaya, pumunta sa
            mas mataas na lugar.
          </p>
        </div>
        <p className="notice" style={{ marginTop: 24 }}>
          Demonstrasyon lamang ito. Walang tunay na rescue service na
          nakakatanggap nito. Sa totoong emergency, tumawag sa 911.
        </p>
      </main>
    );
  }

  return (
    <main className="task-page">
      <h1 className="task-title">Humingi ng tulong</h1>

      <p className="notice">
        Demonstrasyon lamang ito. Walang tunay na rescue service na nakakatanggap
        nito. Sa totoong emergency, tumawag sa 911.
      </p>

      <p className="task-lede">
        Kailangan ng larawan ng tubig ngayon. Hindi puwedeng galing sa gallery.
      </p>

      {photo ? (
        <p className="notice">May larawan na. Handa nang ipadala.</p>
      ) : (
        <LiveCamera onCapture={setPhoto} />
      )}

      <div style={{ marginTop: 28 }}>
        <DepthSlider value={depth} onChange={setDepth} />
      </div>

      <label className="field" style={{ marginTop: 24 }}>
        <span className="field-label">Dagdag na detalye (opsyonal)</span>
        <input
          className="field-input"
          type="text"
          value={note}
          maxLength={140}
          placeholder="Halimbawa: tatlo kami, may matanda"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div style={{ marginTop: 8 }}>
        <HoldToConfirm
          label={
            status === "sending"
              ? "Ipinapadala..."
              : "Pindutin nang 3 segundo para humingi ng tulong"
          }
          onConfirm={handleConfirm}
        />
      </div>

      {!photo && (
        <p className="task-lede" style={{ marginTop: 12 }}>
          Kumuha muna ng larawan bago magpadala.
        </p>
      )}

      {errors.map((code) => (
        <p key={code} className="alert" role="alert">
          {ERROR_MESSAGES[code]}
        </p>
      ))}

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
