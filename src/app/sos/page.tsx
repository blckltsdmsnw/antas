"use client";

import { useState } from "react";
import Link from "next/link";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { PhotoCapture } from "@/components/PhotoCapture";
import { PhoneField } from "@/components/PhoneField";
import { SignalStatus } from "@/components/SignalStatus";
import { createClient } from "@/lib/supabase/client";
import { submitSos, type SosErrorCode } from "@/app/actions/submit-sos";
import {
  formatAccuracy,
  needsLocationConfirmation,
} from "@/lib/reports/accuracy";
import { useCopy } from "@/lib/i18n/context";
import { PULSE_SENT, vibrate } from "@/lib/haptics/pulse";
import type { Copy } from "@/lib/i18n/strings";

type PageErrorCode = SosErrorCode | "no_location" | "upload_failed";

/**
 * Which string each failure shows. Keys, so both languages live in `sos.ts`
 * where the whole set can be read at once by a person checking the wording.
 *
 * `not_signed_in` no longer means "sign in first" - an SOS needs no account.
 * It means the silent anonymous sign-in itself failed, because the project has
 * anonymous sign-ins switched off or the per-IP limit was hit. The wording
 * still points at signing in because that is the only route left when it
 * happens, so a project without anonymous sign-ins degrades to exactly the
 * behaviour it had before rather than to a dead end.
 */
const ERROR_KEY: Record<PageErrorCode, keyof Copy["sos"]> = {
  invalid_coordinates: "errInvalidCoordinates",
  outside_pilot_area: "errOutsidePilotArea",
  not_signed_in: "errNotSignedIn",
  already_active: "errAlreadyActive",
  insert_failed: "errInsertFailed",
  upload_failed: "errUploadFailed",
  no_location: "errNoLocation",
};

export default function SosPage() {
  const copy = useCopy();
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errors, setErrors] = useState<PageErrorCode[]>([]);
  /** Accuracy of the fix that was actually sent, so the confirmation screen can
   *  be honest about how well the map found them. */
  const [sentAccuracyM, setSentAccuracyM] = useState<number | null>(null);
  const [signalId, setSignalId] = useState<string | null>(null);
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
    // Kept rather than discarded: it is what lets the sender watch their own
    // signal instead of being told "naipadala na" and never hearing again.
    setSignalId(result.signalId);
    setStatus("sent");

    /**
     * The second beat, and the only one that means anything went out.
     *
     * It is placed after the row exists rather than when the hold completed,
     * because every failure above returns before reaching here: no photo, no
     * location, no anonymous session, a failed upload, a rejected insert. A
     * buzz on any of those would confirm an SOS that does not exist, which is
     * the notification harm in `design.md` §12 wearing a different coat.
     *
     * It still promises nothing beyond "this was recorded" - `sentBody` and
     * `demoNotice` on the screen below both say outright that nobody is being
     * dispatched.
     */
    vibrate(PULSE_SENT);

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
          <h1 className="done-title">{copy.sos.sentTitle}</h1>
          <p className="done-body">{copy.sos.sentBody}</p>
        </div>

        {needsLocationConfirmation(sentAccuracyM) && (
          <p className="alert" role="alert" style={{ marginTop: 20 }}>
            {copy.sos.inaccurate(formatAccuracy(sentAccuracyM))}
          </p>
        )}

        {/* Directly under the confirmation, because it is the answer to the
            question the sender now has. It shows nothing until there is
            something true to say. */}
        {signalId && <SignalStatus signalId={signalId} />}

        {/* Only when they have none. Most senders are anonymous - no email, no
            number - so without this the barangay has no way to reach them at
            all, and the call button in the console reads "walang numero" on
            almost every signal.

            The wording promises nothing. It says what the number is FOR, not
            that anybody will ring. */}
        {knowsPhone && !storedPhone && (
          <PhoneField
            title={copy.sos.phoneTitle}
            note={copy.sos.phoneNote}
            saveLabel={copy.sos.phoneSave}
          />
        )}

        <p className="notice" style={{ marginTop: 24 }}>
          {copy.sos.demoNotice}
        </p>
      </main>
    );
  }

  return (
    <main className="task-page">
      <h1 className="task-title">{copy.sos.title}</h1>

      <p className="notice">{copy.sos.demoNotice}</p>

      {photo ? (
        <p className="notice">{copy.sos.photoReady}</p>
      ) : (
        <PhotoCapture
          prompt={copy.sos.photoPrompt}
          note={copy.sos.photoNote}
          openLabel={copy.sos.photoOpen}
          onCapture={setPhoto}
        />
      )}


      <label className="field" style={{ marginTop: 24 }}>
        <span className="field-label">{copy.sos.noteLabel}</span>
        <input
          className="field-input"
          type="text"
          value={note}
          maxLength={140}
          placeholder={copy.sos.notePlaceholder}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div style={{ marginTop: 8 }}>
        <HoldToConfirm
          label={status === "sending" ? copy.sos.holdSending : copy.sos.holdLabel}
          onConfirm={handleConfirm}
        />
      </div>

      {!photo && (
        <p className="task-lede" style={{ marginTop: 12 }}>
          {copy.sos.photoFirst}
        </p>
      )}

      {errors.map((code) => (
        <p key={code} className="alert" role="alert">
          {copy.sos[ERROR_KEY[code]] as string}
        </p>
      ))}

      {errors.includes("not_signed_in") && (
        <p style={{ marginTop: 16 }}>
          <Link href="/login" className="btn">
            {copy.sos.signIn}
          </Link>
        </p>
      )}
    </main>
  );
}
