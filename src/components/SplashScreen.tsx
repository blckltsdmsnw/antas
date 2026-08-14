"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AntasMark } from "@/components/AntasMark";
import { DEPTH_LEVELS } from "@/lib/depth/scale";
import { DEPTH_HEX } from "@/lib/depth/presentation";

/**
 * Water rising over the mark while the map loads.
 *
 * The governing constraint is `foundations.md` §8: nobody in a flood wants to
 * wait for an animation. So the water level is bound to real readiness, not to
 * a timer - it covers latency that already exists and never manufactures any.
 * If the map is up in 300ms the splash is gone in 300ms. `MAX_MS` is a ceiling,
 * not a duration.
 *
 * The rise steps through the five depth colours in scale order, so the loading
 * screen teaches the legend before the map is reached, and rising reads as
 * increasing danger rather than as a neutral progress bar.
 *
 * It submerges the mark rather than floating it. A logo bobbing to safety reads
 * as reassurance; this is a warning tool, and being covered is the honest image.
 */

const SESSION_KEY = "antas:splash-shown";

/** Below this the splash strobes rather than reads; much above it and the wait
 *  starts to be felt. Only ever spent while the map is genuinely not ready. */
const MIN_MS = 420;

/** Nothing holds the map behind a splash longer than this, ready or not. A
 *  failed reports fetch must not leave someone staring at a logo. */
const MAX_MS = 2600;

/** How high the water creeps while still loading. Deliberately short of full:
 *  the last of the rise belongs to "the map is actually ready", otherwise the
 *  animation is telling the user something it does not know. */
const CREEP_LEVEL = 74;

/** Past 100 so the crest clears the top edge instead of resting on it. */
const FULL_LEVEL = 112;

/**
 * The rise advances one depth band per step rather than gliding in a single
 * transition. Gliding looked right but was a lie: the colour is a function of
 * the *target* level, so it jumped straight to chest and the scale was never
 * shown. Stepping is also closer to how flooding is actually experienced -
 * it surges, it does not slide.
 */
const STEPS = DEPTH_LEVELS.length;
const STEP_MS = 300;

const SURGE_MS = 420;
const FADE_MS = 320;

/**
 * The surface, as two drifting waves rather than a ruled edge.
 *
 * A straight line reads as a progress bar, which is the one thing this must not
 * look like. Both paths span 200 units and repeat every 50, so a -100 unit
 * drift lands exactly two periods along and loops without a seam.
 */
const WAVE_BACK =
  "M0 13 q12.5 -9 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 L200 24 L0 24 Z";
const WAVE_FRONT =
  "M0 17 q12.5 -7 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 L200 24 L0 24 Z";

/**
 * The splash must be in the server-rendered HTML, or the map paints for a frame
 * before it is covered. That means the "have we already shown this?" check has
 * to run after hydration but before paint, which is `useLayoutEffect` - and
 * that warns when it runs during SSR. Picking the hook once at module scope
 * keeps the call site unconditional.
 */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The band a step is standing in, so the water carries the scale's own colour
 *  rather than a decorative blue. Step 0 has no water to colour yet. */
function bandColour(step: number): string {
  const index = Math.max(0, Math.min(STEPS - 1, step - 1));
  return DEPTH_HEX[DEPTH_LEVELS[index]];
}

type Stage = "idle" | "rising" | "leaving" | "gone";

interface SplashScreenProps {
  /** True once the map has painted and the first reports request has settled. */
  ready: boolean;
}

export function SplashScreen({ ready }: SplashScreenProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [step, setStep] = useState(0);
  const [surged, setSurged] = useState(false);
  const startedAt = useRef(0);
  const decided = useRef(false);

  useIsoLayoutEffect(() => {
    // Decide exactly once. This effect both reads and writes the session key,
    // so it is not idempotent - and Strict Mode invokes it twice in
    // development, which meant the second run read the first run's own write
    // and skipped the splash entirely. It never appeared once.
    if (decided.current) return;
    decided.current = true;

    // Once per session. On an in-app navigation the layout never unmounts, so
    // this only concerns real reloads - and a second full-screen splash on a
    // reload is an interruption, not a welcome.
    if (sessionStorage.getItem(SESSION_KEY)) {
      setStage("gone");
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    startedAt.current = performance.now();
    setStage("rising");
  }, []);

  // Climb one band at a time, and hold at the top of the creep until the map
  // says it is ready. The first step is kicked on the next frame: a CSS
  // transition needs a painted from-value, or the water simply appears.
  useEffect(() => {
    if (stage !== "rising") return;

    const frame = requestAnimationFrame(() => setStep((s) => (s === 0 ? 1 : s)));
    const id = window.setInterval(
      () => setStep((s) => Math.min(STEPS, s + 1)),
      STEP_MS,
    );

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(id);
    };
  }, [stage]);

  // Finish on readiness, or on the ceiling, whichever comes first.
  useEffect(() => {
    if (stage !== "rising") return;

    const elapsed = performance.now() - startedAt.current;
    const wait = ready ? Math.max(0, MIN_MS - elapsed) : Math.max(0, MAX_MS - elapsed);

    let leave = 0;
    const surge = window.setTimeout(() => {
      setSurged(true);
      leave = window.setTimeout(() => setStage("leaving"), SURGE_MS);
    }, wait);

    return () => {
      window.clearTimeout(surge);
      window.clearTimeout(leave);
    };
  }, [ready, stage]);

  useEffect(() => {
    if (stage !== "leaving") return;
    const id = window.setTimeout(() => setStage("gone"), FADE_MS);
    return () => window.clearTimeout(id);
  }, [stage]);

  if (stage === "gone") return null;

  const level = surged ? FULL_LEVEL : (step / STEPS) * CREEP_LEVEL;
  // Covering the screen is the deepest reading there is, whatever step the
  // creep had reached when the map became ready.
  const colour = surged ? DEPTH_HEX[DEPTH_LEVELS[STEPS - 1]] : bandColour(step);
  const riseMs = `${surged ? SURGE_MS : STEP_MS}ms`;

  return (
    <div className="splash" data-stage={stage} role="status" aria-label="Naglo-load">
      <div className="splash-logo">
        <AntasMark size={72} />
        <span className="splash-word">Antas</span>
      </div>

      {/* Above the mark, not behind it, so `multiply` tints whatever it covers -
          which is what makes the mark look submerged rather than cropped. */}
      <div
        className="splash-water"
        style={{
          height: `${level}%`,
          background: colour,
          ["--rise-ms" as string]: riseMs,
        }}
      />

      {/* The surface rides on top of the water body and tracks it on the same
          timing. Same colour and same blend mode, so where the two waves cross
          each other the multiply darkens and the water gains depth for free. */}
      <svg
        className="splash-wave"
        style={{ bottom: `${level}%`, ["--rise-ms" as string]: riseMs }}
        viewBox="0 0 200 24"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className="splash-wave-back" d={WAVE_BACK} fill={colour} />
        <path className="splash-wave-front" d={WAVE_FRONT} fill={colour} />
      </svg>
    </div>
  );
}
