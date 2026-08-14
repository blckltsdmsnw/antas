"use client";

import { useState } from "react";
import Link from "next/link";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { PhotoCapture } from "@/components/PhotoCapture";
import { PhoneField } from "@/components/PhoneField";
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
  // An SOS no longer requires an account, so this code no longer means "sign in
  // first". It means the silent anonymous sign-in itself failed - the project
  // has anonymous sign-ins switched off, or the per-IP limit was hit.
  //
  // The wording still points at signing in because that is the only route left
  // when it happens, so a project without anonymous sign-ins enabled degrades
  // to exactly the behaviour it had before rather than to a dead end.
  not_signed_in:
    "Hindi nakagawa ng pansamantalang account. Mag-sign in para makapagpadala ng SOS.",
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
  const [storedPhone, setStoredPhone] = useState<string | null>(null);
  // Whether the lookup has happened at all. Without it the field would flash on
  // for a moment for somebody who already has a number saved.
  const [knowsPhone, setKnowsPhone] = useState(false);

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
    const { data: existing } = await supabase.auth.getUser();
    let user = existing.user;

    /**
     * No account required, and none asked for.
     *
     * Sign-in everywhere else here is a magic link: type an email, wait for it,
     * open the mail app, click the link, come back. Anywhere else that is minor
     * friction. On this screen it is minutes, needing signal and a working
     * inbox, from somebody standing in rising water - so the product would be
     * refusing a call for help over paperwork, at the exact moment it exists to
     * avoid doing that.
     *
     * An anonymous session is still a real account as far as the database is
     * concerned, so reporter_id stays non-null and every policy, index and
     * audit row keeps working unchanged. It costs one silent round trip and no
     * typing. The trust score already docks brand-new accounts, so a signal
     * sent this way is ranked lower for a moderator rather than refused -
     * ranking is the honest answer to knowing less; refusing is not.
     */
    if (!user) {
      const anon = await supabase.auth.signInAnonymously();
      if (anon.error || !anon.data.user) {
        setErrors(["not_signed_in"]);
        setStatus("idle");
        return;
      }
      user = anon.data.user;
    }

    const path = `${user.id}/${Date.now()}.jpg`;
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

    /**
     * Only now, and never before.
     *
     * The number is worth asking for - most senders are anonymous, so there is
     * otherwise no way to ring them back at all - but not at the cost of a
     * single second before the signal goes out. So the lookup happens after
     * "sent" is on screen, and the field appears underneath it.
     */
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    setStoredPhone((profile?.phone as string | null) ?? null);
    setKnowsPhone(true);
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

        {/* Only when they have none. Most senders are anonymous - no email, no
            number - so without this the barangay has no way to reach them at
            all, and the call button in the console reads "walang numero" on
            almost every signal.

            The wording promises nothing. It says what the number is FOR, not
            that anybody will ring. */}
        {knowsPhone && !storedPhone && (
          <PhoneField
            title="Mag-iwan ng numero (opsyonal)"
            note="Kung may kailangang linawin tungkol sa lokasyon mo, ito ang gagamitin. Hindi ito nakikita sa mapa at walang ibang user ang makakakita nito. Puwede mo ring laktawan ito."
            saveLabel="I-save ang numero ko"
          />
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
