"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RESPONDER_UNITS, isResponderUnit, unitLabel, type ResponderUnit } from "@/lib/responder/types";
import { useCopy } from "@/lib/i18n/context";

/**
 * Saying you are a responder.
 *
 * Three fields on the caller's own profile: a name, a unit, a barangay. Set
 * them and the master admin's roster lists you; leave them and you are an
 * ordinary user. There is no approval step - this is a demonstration build,
 * and the vetting that a real deployment would put here is an operational
 * question about that deployment, not a design question about this one.
 *
 * The name is `profiles.display_name`, which every row has carried as the
 * literal 'Anonymous' since 0001 because nothing wrote it. It is treated as
 * empty here, never shown as a name.
 */

/** The database's own placeholder, from handle_new_user() in 0001. */
const PLACEHOLDER_NAME = "Anonymous";

interface ResponderFieldProps {
  initial: { name: string | null; unit: string | null; barangay: string | null };
}

type Stage = "idle" | "saving" | "saved" | "needs_name" | "needs_unit" | "failed";

export function ResponderField({ initial }: ResponderFieldProps) {
  const copy = useCopy();
  const [name, setName] = useState(
    initial.name && initial.name !== PLACEHOLDER_NAME ? initial.name : "",
  );
  const [unit, setUnit] = useState<ResponderUnit | "">(
    isResponderUnit(initial.unit) ? initial.unit : "",
  );
  const [barangay, setBarangay] = useState(initial.barangay ?? "");
  const [barangays, setBarangays] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const registered = isResponderUnit(initial.unit);

  useEffect(() => {
    let cancelled = false;
    // Public reference data (0009). Loaded once; there are under a hundred.
    void createClient()
      .from("barangays")
      .select("name")
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setBarangays(((data as { name: string }[]) ?? []).map((b) => b.name));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    if (name.trim() === "") {
      setStage("needs_name");
      return;
    }
    if (unit === "") {
      setStage("needs_unit");
      return;
    }

    setStage("saving");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStage("failed");
      return;
    }

    // Own row only: the update grant is column-scoped (0032 §3) and the
    // policy is id = auth.uid(), so this can never touch anybody else.
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim(),
        responder_unit: unit,
        responder_barangay: barangay === "" ? null : barangay,
      })
      .eq("id", auth.user.id);

    setStage(error ? "failed" : "saved");
  }, [name, unit, barangay]);

  return (
    <section className="phone-card">
      <h2 className="my-reports-title" style={{ marginTop: 0 }}>
        {copy.board.responderTitle}
      </h2>
      <p className="phone-note">{copy.board.responderNote}</p>
      {registered && <p className="phone-note">{copy.board.responderRegistered}</p>}

      <label className="field">
        <span className="field-label">{copy.board.responderName}</span>
        <input
          className="field-input"
          type="text"
          autoComplete="name"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setStage("idle");
          }}
        />
      </label>

      <label className="field">
        <span className="field-label">{copy.board.responderUnit}</span>
        <select
          className="field-input"
          value={unit}
          onChange={(e) => {
            setUnit(isResponderUnit(e.target.value) ? e.target.value : "");
            setStage("idle");
          }}
        >
          <option value="">{copy.board.responderChoose}</option>
          {RESPONDER_UNITS.map((u) => (
            <option key={u} value={u}>
              {unitLabel(u, copy.board)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">{copy.board.responderBarangay}</span>
        <select
          className="field-input"
          value={barangay}
          onChange={(e) => {
            setBarangay(e.target.value);
            setStage("idle");
          }}
        >
          <option value="">{copy.board.responderChoose}</option>
          {barangays.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="btn btn-quiet"
        disabled={stage === "saving"}
        onClick={() => void save()}
      >
        {stage === "saving" ? copy.board.responderSaving : copy.board.responderSave}
      </button>

      {stage === "needs_name" && <p className="alert" role="alert">{copy.board.responderNeedsName}</p>}
      {stage === "needs_unit" && <p className="alert" role="alert">{copy.board.responderNeedsUnit}</p>}
      {stage === "failed" && <p className="alert" role="alert">{copy.board.responderFailed}</p>}
      {stage === "saved" && <p className="phone-note">{copy.board.responderSaved}</p>}
    </section>
  );
}
