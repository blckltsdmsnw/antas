"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, normalizePhone } from "@/lib/profile/phone";
import { useCopy } from "@/lib/i18n/context";

/**
 * One optional mobile number, saved to the caller's own profile.
 *
 * Shared by /ako and the SOS confirmation screen, which need the same field and
 * very different words around it: on /ako it is a setting, and after an SOS it
 * is the difference between somebody being able to ring you back and not. The
 * copy is passed in for that reason; the validating, normalising and saving are
 * not, because two copies of "which numbers are acceptable" is how one of them
 * ends up storing something that will not dial.
 */

interface PhoneFieldProps {
  title: string;
  note: string;
  /** An already-stored E.164 number, if the caller knows of one. */
  initial?: string | null;
  saveLabel?: string;
  onSaved?: (phone: string) => void;
}

type Stage = "idle" | "saving" | "saved" | "invalid" | "failed";

export function PhoneField({
  title,
  note,
  initial = null,
  saveLabel,
  onSaved,
}: PhoneFieldProps) {
  const copy = useCopy();
  const [phone, setPhone] = useState(initial ? formatPhone(initial) : "");
  const [saved, setSaved] = useState<string | null>(initial);
  const [stage, setStage] = useState<Stage>("idle");

  const save = useCallback(async () => {
    // Validated here and again by a check constraint on the column. A number
    // stored in a shape that will not dial is discovered by somebody failing to
    // reach a person in a flood - far too late to be a bug report.
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setStage("invalid");
      return;
    }

    setStage("saving");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStage("failed");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ phone: normalized })
      .eq("id", auth.user.id);

    if (error) {
      setStage("failed");
      return;
    }

    setSaved(normalized);
    setPhone(formatPhone(normalized));
    setStage("saved");
    onSaved?.(normalized);
  }, [phone, onSaved]);

  return (
    <section className="phone-card">
      <h2 className="my-reports-title" style={{ marginTop: 0 }}>
        {title}
      </h2>
      <p className="phone-note">{note}</p>

      <label className="field">
        <span className="field-label">{copy.screens.phoneLabel}</span>
        <input
          className="field-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0917 123 4567"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setStage("idle");
          }}
        />
      </label>

      <button
        type="button"
        className="btn btn-quiet"
        disabled={stage === "saving" || phone.trim() === ""}
        onClick={() => void save()}
      >
        {stage === "saving"
          ? copy.screens.phoneSaving
          : (saveLabel ?? copy.screens.phoneSave)}
      </button>

      {stage === "invalid" && (
        <p className="alert" role="alert">
          Hindi mukhang Philippine mobile number iyan. Subukan ang anyong{" "}
          <strong>0917 123 4567</strong>.
        </p>
      )}
      {stage === "failed" && (
        <p className="alert" role="alert">
          Hindi na-save ang numero. Subukan ulit.
        </p>
      )}
      {stage === "saved" && (
        <p className="phone-note">{copy.screens.phoneSaved}</p>
      )}
      {stage === "idle" && saved && (
        <p className="phone-note">Naka-save: {formatPhone(saved)}</p>
      )}
    </section>
  );
}
