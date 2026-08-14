"use client";

import { useCallback, useState } from "react";

/**
 * Take me to where I am.
 *
 * Search answers "show me Malanday". This answers "show me *here*", which is
 * the more common question and the one a stranger to the interface reaches for
 * first. Between them, the two ways anybody actually arrives at their own
 * street are covered.
 *
 * DOES NOT ASK ON LOAD, and that is the whole discipline of it. A permission
 * prompt earned by merely opening the map is the mistake the camera used to
 * make and the weather strip was written to avoid; the same rule applies here.
 * Nothing is stored and nothing is sent - the coordinate goes to the map and
 * nowhere else.
 */

/** Long enough for a cold GPS fix indoors, short enough to admit defeat. */
const TIMEOUT_MS = 10_000;

/** A minute-old fix is still where you are, and it saves a cold start. */
const MAX_AGE_MS = 60_000;

type Stage = "idle" | "locating" | "denied" | "unavailable";

interface LocateButtonProps {
  onLocate: (position: { lat: number; lon: number }) => void;
}

export function LocateButton({ onLocate }: LocateButtonProps) {
  const [stage, setStage] = useState<Stage>("idle");

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStage("unavailable");
      return;
    }

    setStage("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStage("idle");
        onLocate({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        // Denial holds until the user changes it in browser settings, so it is
        // worth saying differently from a fix that merely timed out.
        setStage(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  }, [onLocate]);

  const label =
    stage === "denied"
      ? "Naka-off ang lokasyon"
      : stage === "unavailable"
        ? "Hindi makuha ang lokasyon"
        : "Hanapin ang kinaroroonan ko";

  return (
    <div className="locate-wrap">
      <button
        type="button"
        className="locate"
        data-stage={stage}
        onClick={locate}
        disabled={stage === "locating"}
        aria-label={label}
        title={label}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" />
          {/* Crosshair arms - what makes it read as "centre on me" rather than
              as a target or a record button. */}
          <path
            d="M12 1.6v3.2M12 19.2v3.2M1.6 12h3.2M19.2 12h3.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Failures are stated, never silent. A control that does nothing when
          pressed is indistinguishable from a broken one. */}
      {(stage === "denied" || stage === "unavailable") && (
        <p className="locate-note" role="status">
          {label}
        </p>
      )}
    </div>
  );
}
