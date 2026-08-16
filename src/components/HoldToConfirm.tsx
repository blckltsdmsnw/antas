"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCopy } from "@/lib/i18n/context";
import { PULSE_HOLD, stopPulse, vibrate } from "@/lib/haptics/pulse";

/** Exported so the haptic ramp can be pinned to finish inside it. */
export const HOLD_MS = 3000;
const TICK_MS = 50;

interface HoldToConfirmProps {
  label: string;
  onConfirm: () => void;
}

/** The keys a button is expected to activate on. */
const HOLD_KEYS = new Set([" ", "Spacebar", "Enter"]);

/**
 * Three seconds of deliberate pressure. The fire-alarm problem is a cheap
 * action with a visible consequence; this makes the consequential action
 * expensive without making it slow enough to matter in an emergency.
 *
 * REACHABLE BY KEYBOARD, which it was not. The control listened only for
 * pointer events, so somebody using a keyboard, a switch or voice control could
 * focus this button, press it, and have nothing whatever happen - on the one
 * control in the product that calls for help. Holding Space or Enter now does
 * exactly what holding a thumb does.
 */
export function HoldToConfirm({ label, onConfirm }: HoldToConfirmProps) {
  const copy = useCopy();
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fired = useRef(false);
  const heldKey = useRef(false);

  const stop = useCallback(() => {
    heldKey.current = false;
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    // The ramp was requested as a single three-second pattern, so the phone
    // will happily finish it after the thumb has gone. Letting it run on would
    // tell somebody who just cancelled that their SOS is still counting down.
    stopPulse();
    if (!fired.current) setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  function start() {
    if (timer.current !== null || fired.current) return;

    /**
     * The whole three seconds, requested in one go.
     *
     * One call rather than a beat per tick of the interval below: the phone
     * schedules the rhythm itself, so it cannot drift or stutter if the main
     * thread is busy - and `stop()` can cancel the remainder in a single call
     * the instant the thumb lifts.
     *
     * Nothing marks the completion. That instant is "submitting", not "sent",
     * and a beat there would feel the same whether the signal reached the
     * database or the upload failed a second later. The confirming pattern
     * lives on the page, after the write. Sitting behind the guard above, this
     * also cannot restart under key auto-repeat.
     */
    vibrate(PULSE_HOLD);

    const startedAt = Date.now();

    timer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.min(elapsed / HOLD_MS, 1);
      setProgress(next);

      if (next >= 1) {
        fired.current = true;
        stop();
        onConfirm();
      }
    }, TICK_MS);
  }

  /**
   * Auto-repeat is the trap here. Holding a key fires keydown over and over,
   * and without this guard each repeat would restart the three seconds, so the
   * hold could never complete by keyboard - failing in a way that looks like
   * the control simply not working.
   */
  function keyDown(event: React.KeyboardEvent) {
    if (!HOLD_KEYS.has(event.key)) return;
    // Space would otherwise scroll the page out from under the control.
    event.preventDefault();
    if (heldKey.current) return;
    heldKey.current = true;
    start();
  }

  function keyUp(event: React.KeyboardEvent) {
    if (!HOLD_KEYS.has(event.key)) return;
    stop();
  }

  return (
    <button
      type="button"
      className="hold"
      // The ARIA progress attributes are NOT here. `aria-valuenow` and its
      // siblings are not supported on role=button, which a <button> has
      // implicitly, so a screen reader discarded them entirely and announced no
      // progress at all. They belong on the element below, which claims the
      // role that actually accepts them.
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      // Tabbing away mid-hold must not leave a timer running behind a control
      // that no longer has focus.
      onBlur={stop}
      style={{ "--hold-progress": `${progress * 100}%` } as React.CSSProperties}
    >
      <span
        className="hold-fill"
        role="progressbar"
        aria-label={copy.screens.holdProgress}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      <span className="hold-label">{label}</span>
    </button>
  );
}
