"use client";

import { useState } from "react";
import Link from "next/link";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { PhotoCapture } from "@/components/PhotoCapture";
import { createClient } from "@/lib/supabase/client";
import { submitSos, type SosErrorCode } from "@/app/actions/submit-sos";
import {
  formatAccuracy,
  needsLocationConfirmation,
} from "@/lib/reports/accuracy";

type PageErrorCode = SosErrorCode | "no_location" | "upload_failed";

const ERROR_MESSAGES: Record<PageErrorCode, string> = {
  invalid_coordinates: "Hindi mabasa ang lokasyon mo.",
  outside_pilot_area: "Sa ngayon, Metro Manila lang ang saklaw ng Antas.",
  not_signed_in: "Mag-sign in muna bago humingi ng tulong.",
  already_active: "May aktibo ka nang SOS. Hinihintay pa itong suriin.",
  insert_failed: "May problema sa pagpapadala. Subukan ulit.",
  upload_failed: "Hindi naipadala ang larawan. Subukan ulit.",
  no_location: "Buksan ang location para makapagpadala ng SOS.",
};

export default function SosPage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errors, setErrors] = useState<PageErrorCode[]>([]);
  /** Accuracy of the fix that was actually sent, so the confirmation screen can
   *  be honest about how well the map found them. */
  const [sentAccuracyM, setSentAccuracyM] = useState<number | null>(null);

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
    // Deliberately never blocked on accuracy. Someone chest-deep in water is
    // not going to walk outside for a better fix, and a signal placed one
    // barangay off is still worth far more than no signal. We send, then say so.
    setSentAccuracyM(position.coords.accuracy ?? null);
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

        {needsLocationConfirmation(sentAccuracyM) && (
          <p className="alert" role="alert" style={{ marginTop: 20 }}>
            Malabo ang lokasyon mo — mga {formatAccuracy(sentAccuracyM)} ang
            puwedeng pagkakamali. Naipadala pa rin ang SOS mo. Kung may
            makakausap ka, sabihin mo ang eksaktong kalye o palatandaan.
          </p>
        )}

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

      {photo ? (
        <p className="notice">May larawan na. Handa nang ipadala.</p>
      ) : (
        <PhotoCapture
          prompt="Kailangan ng larawan ng tubig ngayon"
          note="Hindi puwedeng galing sa gallery. Ang barangay lang ang makakakita nito."
          openLabel="Buksan ang camera"
          onCapture={setPhoto}
        />
      )}


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
