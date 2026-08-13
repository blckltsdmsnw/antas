"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_MS = 3000;
const TICK_MS = 50;

interface HoldToConfirmProps {
  label: string;
  onConfirm: () => void;
}

/**
 * Three seconds of deliberate pressure. The fire-alarm problem is a cheap
 * action with a visible consequence; this makes the consequential action
 * expensive without making it slow enough to matter in an emergency.
 */
export function HoldToConfirm({ label, onConfirm }: HoldToConfirmProps) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fired = useRef(false);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (!fired.current) setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  function start() {
    if (timer.current !== null || fired.current) return;
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

  return (
    <button
      type="button"
      className="hold"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      style={{ "--hold-progress": `${progress * 100}%` } as React.CSSProperties}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{label}</span>
    </button>
  );
}
