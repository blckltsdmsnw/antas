import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Freeze,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { DEPTH, FONT, FloatingCard, INK, WaterPlane, WordReveal } from "./ui";

/**
 * The demonstration video. A different genre from Promo.tsx on purpose: the
 * course rubric asks for the application demonstrated feature by feature, so
 * the body of every beat is real footage - Elijah's phone recording of the
 * hosted app, and Playwright captures of the flows a phone recording could not
 * reach (the flood-fed camera, the moderator console, the Google Maps
 * hand-off). Remotion is the polish layer only.
 *
 * Cut 6 (2026-08-19), length cap lifted to ~76s: the report chapter cuts away
 * to the flood the camera is looking at; Tulong plays its whole arc (live
 * photo required -> hold -> sent -> callback number, no account); the console
 * chapter ends on "Direksyon papunta rito" opening a real Google Maps route.
 * Narration lives on its own track so a line can ride across visual cuts.
 */

const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);

interface Beat {
  from: number;
  frames: number;
  chapter?: string;
  title?: string;
  caption?: string;
  /** The caption the first one crossfades into, for two-part shots. */
  caption2?: { text: string; atSec: number };
  /** Phone footage; null with `flood` set = full-bleed cutaway or intro/outro. */
  clip: { src: string; fromSec: number; playbackRate?: number } | null;
  /** Desk-width capture (the board), drawn in a monitor rather than a phone. */
  wide?: boolean;
  /** Full-bleed flood cutaway (no card, no phone) - "what the camera sees". */
  flood?: { fromSec: number; tint: number };
  accent: string;
  stat?: { big: string; small: string };
  punch?: [number, number];
}

/**
 * Sources: footage/screen.mp4 = the phone recording (timeline mapped
 * 2026-08-19); captures/*.webm = the local Playwright scenes. Timings follow
 * the measured james narration renders.
 */
const BEATS: Beat[] = [
  {
    from: sec(0),
    frames: sec(6),
    clip: null,
    accent: DEPTH.waist,
  },
  {
    from: sec(6),
    frames: sec(7),
    chapter: "01 · MAPA",
    title: "One live map of the street",
    caption:
      "Live reports on one map - search a place, check conditions. No account needed.",
    clip: { src: "captures/scene-search.webm", fromSec: 2.2 },
    accent: DEPTH.knee,
    stat: { big: "6 hazards · 5 depths", small: "the legend, colour by severity" },
  },
  {
    from: sec(13),
    frames: sec(5.5),
    chapter: "02 · GABAY",
    title: "Hotlines first, offline always",
    caption:
      "Gabay puts emergency hotlines and a preparedness checklist first - and it works offline.",
    clip: { src: "footage/screen.mp4", fromSec: 28.6 },
    accent: DEPTH.ankle,
  },
  {
    // The offline claim, demonstrated rather than asserted. Filmed against
    // `next start`, because the worker is deliberately not registered under
    // `next dev`. Nothing on screen says "offline" - the caption is what makes
    // the reload evidence.
    from: sec(18.5),
    frames: sec(7),
    chapter: "02 · GABAY",
    title: "Still there with no signal",
    caption:
      "Network off, then reload: the guide opens from the phone's own cache. Hotlines first, as always.",
    clip: { src: "captures/scene-offline.webm", fromSec: 3.4 },
    accent: DEPTH.ankle,
    stat: { big: "No network", small: "served by the service worker" },
  },
  {
    // The report in one continuous take, paced like the SOS beat (Elijah's
    // note): levels tapped, the real "Kumuha ng larawan" button pressed, the
    // flood photo landing (punch-in), scroll, submit, and the green
    // "Salamat. Naitala na ang report mo." holding the tail.
    from: sec(25.5),
    frames: sec(16.2),
    chapter: "03 · I-REPORT",
    title: "Six hazards, one scale",
    caption:
      "Every report starts with what is happening - flood, fire, earthquake, accident, medical, other.",
    caption2: {
      text: "A flood is graded on a body: here, knee-deep. Snap the water, and send.",
      atSec: 3.6,
    },
    clip: { src: "captures/scene-report-flood.webm", fromSec: 0.2 },
    accent: DEPTH.knee,
    stat: { big: "Tuhod · 16–50 cm", small: "knee-deep, on a body scale" },
    punch: [232, 300],
  },
  {
    // The same picker, a different vocabulary - and the submit button visibly
    // disabled until the question is answered. No photograph: it is optional,
    // and the fake camera is playing a flood, which would be a lie here.
    from: sec(41.7),
    frames: sec(8),
    chapter: "03 · I-REPORT",
    title: "A fire is not measured on a body",
    caption:
      "Fire, earthquake, accident and medical are graded in three steps - and nothing sends until you answer.",
    clip: { src: "captures/scene-report-fire.webm", fromSec: 0.4 },
    accent: DEPTH.chest,
    stat: { big: "3 steps, not 5", small: "flood is the only body scale" },
  },
  {
    // The other four vocabularies. Nothing is submitted here - the point is
    // that each hazard asks its own question, and that accident and medical
    // say plainly that only the barangay will see the photograph.
    from: sec(49.7),
    frames: sec(10),
    chapter: "03 · I-REPORT",
    title: "Every hazard, its own words",
    caption:
      "Earthquake, accident, medical and other each carry three answers of their own.",
    clip: { src: "captures/scene-report-hazards.webm", fromSec: 1.2 },
    accent: DEPTH.aboveHead,
    stat: { big: "6 vocabularies", small: "one shared 1-3 rank" },
  },
  {
    // One continuous shot from the pin landing to the neighborhood confirming
    // the water is gone.
    from: sec(59.7),
    frames: sec(8.5),
    chapter: "04 · KOMUNIDAD",
    title: "On the map, kept honest",
    caption: "The report appears on the map instantly, photo included.",
    caption2: {
      text: "And it stays honest - neighbors confirm when the water is gone.",
      atSec: 4.2,
    },
    clip: { src: "footage/screen.mp4", fromSec: 93.6, playbackRate: 1.46 },
    accent: DEPTH.waist,
    stat: { big: "Kumusta na?", small: "neighbors update the status" },
  },
  {
    // The resident's own side: what they filed, and the language toggle that
    // moves every string rather than the visible ones.
    from: sec(68.2),
    frames: sec(7),
    chapter: "05 · AKO",
    title: "Your own reports, your own language",
    caption:
      "Under Ako a resident manages what they filed - and the whole interface switches language, never half of it.",
    clip: { src: "captures/scene-ako.webm", fromSec: 0.6 },
    accent: DEPTH.ankle,
    stat: { big: "Filipino · English", small: "no half-translated screen" },
  },
  {
    // The whole SOS arc in one take: the live-photo requirement, the flood in
    // the viewfinder, the three-second hold, "Naipadala", and the callback
    // number saved without an account.
    from: sec(75.2),
    frames: sec(16),
    chapter: "06 · TULONG",
    title: "Hold to call for help",
    caption:
      "A live photo is required - camera only, never the gallery - so false alarms are hard to fake.",
    caption2: {
      text: "Say what is happening, or say nothing - both are real answers.",
      atSec: 9.5,
    },
    clip: { src: "captures/scene-sos-flood.webm", fromSec: 0.2, playbackRate: 1.1 },
    accent: DEPTH.chest,
    stat: { big: "3 seconds", small: "hold to send" },
  },
  {
    from: sec(91.2),
    frames: sec(8),
    chapter: "07 · CONSOLE",
    title: "Every signal gets a decision",
    caption:
      "Only barangay moderators see an SOS - it never appears on the public map.",
    clip: { src: "captures/scene-console.webm", fromSec: 7.4 },
    accent: DEPTH.aboveHead,
    stat: { big: "61/100", small: "trust score, auto-assessed" },
  },
  {
    // The desk's other half: the depth reports, banded by priority, kept or
    // hidden from the map with a reason that is recorded.
    from: sec(99.2),
    frames: sec(9),
    chapter: "07 · CONSOLE",
    title: "Two queues, one desk",
    caption:
      "The second queue is the reports themselves - urgent, watch, routine - kept, or hidden from the map with a reason.",
    clip: { src: "captures/scene-console-reports.webm", fromSec: 1.0 },
    accent: DEPTH.aboveHead,
    stat: { big: "Kagyat", small: "priority is a stated rule, not a score" },
  },
  {
    // The tap on "Direksyon papunta rito" itself, filmed - then the cut to
    // the Maps route it opened. Click, then result, one continued thought.
    from: sec(108.2),
    frames: sec(2.5),
    chapter: "07 · CONSOLE",
    title: "Direksyon papunta rito",
    // 1.2, not 0.6: the first half-second is the detail page's loading
    // skeleton, which reads as a glitch at this polish level.
    clip: { src: "captures/scene-direksyon.webm", fromSec: 1.2 },
    accent: DEPTH.aboveHead,
  },
  {
    from: sec(110.7),
    frames: sec(5),
    chapter: "07 · CONSOLE",
    title: "Direksyon papunta rito",
    caption:
      "One tap opens Google Maps - straight to the caller's exact location.",
    clip: { src: "captures/scene-direksyon-2.webm", fromSec: 2.4 },
    accent: DEPTH.aboveHead,
    stat: { big: "13 min · 3.6 km", small: "live route to the caller" },
  },
  {
    // Ako -> Responder. Filmed before the board on purpose: the name typed
    // here is the name the board assigns two beats later.
    from: sec(115.7),
    frames: sec(7.5),
    chapter: "08 · RESPONDER",
    title: "Who can be sent",
    caption:
      "A signed-in person registers as a responder - fire service, barangay rescue, medical, police.",
    clip: { src: "captures/scene-responder.webm", fromSec: 1.4 },
    accent: DEPTH.waist,
    stat: { big: "5 units", small: "name and number, master admin only" },
  },
  {
    // The desk-width capture: four columns, the 48-hour graph and the
    // barangay ranking above them, a card moved and then assigned.
    from: sec(123.2),
    frames: sec(10.5),
    chapter: "09 · BOARD",
    title: "Reports and signals, one board",
    caption:
      "The master admin's four columns: needs checking, not true, needs attention, assigned.",
    caption2: {
      text: "Assigning records who was put on it. Antas still sends no rescue.",
      atSec: 5.6,
    },
    clip: { src: "captures/scene-board.webm", fromSec: 0.6 },
    wide: true,
    accent: DEPTH.aboveHead,
    stat: { big: "48 hours", small: "incidents per hour, by barangay" },
  },
  {
    // The other end of the assignment: the responder opens the console and
    // sees their own incidents and nothing else.
    from: sec(133.7),
    frames: sec(6),
    chapter: "10 · NAKATALAGA",
    title: "Only what is yours",
    caption:
      "A responder opens the same console and sees only the incidents assigned to them.",
    clip: { src: "captures/scene-assigned.webm", fromSec: 0.8 },
    accent: DEPTH.waist,
    stat: { big: "Nakatalaga sa akin", small: "their own tab, nothing wider" },
  },
  {
    from: sec(139.7),
    frames: sec(7.5),
    clip: null,
    accent: DEPTH.chest,
  },
];

/** The narration track, decoupled from the visual cuts. Absolute seconds. */
const NARRATION: { file: string; at: number }[] = [
  { file: "shot-01.mp3", at: 0.2 },
  { file: "shot-02.mp3", at: 6.2 },
  { file: "shot-03.mp3", at: 13.2 },
  { file: "shot-03b.mp3", at: 19.4 },
  { file: "shot-04a.mp3", at: 25.7 },
  { file: "shot-04.mp3", at: 32.6 },
  { file: "shot-04c.mp3", at: 42.1 },
  { file: "shot-04d.mp3", at: 50.2 },
  { file: "shot-05.mp3", at: 60.0 },
  { file: "shot-06.mp3", at: 64.0 },
  { file: "shot-06b.mp3", at: 68.5 },
  { file: "shot-07.mp3", at: 75.4 },
  { file: "shot-07b.mp3", at: 79.3 },
  { file: "shot-07c.mp3", at: 86.7 },
  { file: "shot-08.mp3", at: 91.4 },
  { file: "shot-08c.mp3", at: 99.5 },
  { file: "shot-08b.mp3", at: 108.4 },
  { file: "shot-10.mp3", at: 115.9 },
  { file: "shot-11.mp3", at: 123.5 },
  { file: "shot-12.mp3", at: 134.0 },
  { file: "shot-09.mp3", at: 139.7 },
];

/** Confirmation chimes: report saved, SOS sent, number saved. */
const DINGS = [40.4, 48.6, 85.5, 89.9];

export const DEMO_DURATION = sec(147.2);

const RISE_FRAMES = 16;
const DRAIN_FRAMES = 22;

/**
 * The mark with live water inside the pin, rising against the icon's
 * skyline - the whole product in one image. `fill` is 0..1 of the chamber.
 */
const LiveMark: React.FC<{ size?: number; fill?: number }> = ({
  size = 130,
  fill = 0.55,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const top = 56 - Math.max(0, Math.min(1, fill)) * 42;
  const segments = 24;
  const pts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * 64;
    const y =
      top +
      Math.sin((i / segments) * Math.PI * 2.6 + t * 2.1) * 1.6 +
      Math.sin((i / segments) * Math.PI * 5.2 - t * 1.4) * 0.7;
    pts.push(`${x},${y}`);
  }
  const pin =
    "M32 4c-11 0-20 8.8-20 19.7C12 38.4 32 60 32 60s20-21.6 20-36.3C52 12.8 43 4 32 4z";

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <clipPath id="livemark-pin">
          <path d={pin} />
        </clipPath>
        <linearGradient id="livemark-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={DEPTH.knee} />
          <stop offset="100%" stopColor={DEPTH.chest} />
        </linearGradient>
      </defs>
      <path d={pin} fill="#ffffff" />
      <g clipPath="url(#livemark-pin)">
        <rect x={21} y={20} width={7} height={20} fill={DEPTH.chest} opacity={0.9} />
        <rect x={30} y={14} width={7} height={26} fill={DEPTH.chest} opacity={0.9} />
        <rect x={39} y={24} width={6} height={16} fill={DEPTH.chest} opacity={0.9} />
        <path
          d={`M${pts.join(" L")} L64,64 L0,64 Z`}
          fill="url(#livemark-water)"
          opacity={0.88}
        />
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.65}
          strokeWidth={1}
        />
      </g>
      <path d={pin} stroke="#ffffff" strokeWidth={2.4} fill="none" />
    </svg>
  );
};

/** Half a transition: the water rising over the END of a beat. */
const WaterRise: React.FC<{ colour: string }> = ({ colour }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const start = durationInFrames - RISE_FRAMES;
  if (frame < start) return null;
  const level = interpolate(frame, [start, durationInFrames], [0, 1.14], {
    easing: Easing.in(Easing.cubic),
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <WaterPlane level={level} colour={colour} opacity={0.97} speed={1.4} chop={1.3} />
    </AbsoluteFill>
  );
};

/** The other half: draining away at the START of the next beat. */
const WaterDrain: React.FC<{ colour: string }> = ({ colour }) => {
  const frame = useCurrentFrame();
  if (frame > DRAIN_FRAMES) return null;
  const level = interpolate(frame, [0, DRAIN_FRAMES], [1.14, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <WaterPlane level={level} colour={colour} opacity={0.97} speed={1.4} chop={1.3} />
    </AbsoluteFill>
  );
};

/**
 * The flood clip, sharp in a portrait panel over a blurred wash of itself.
 * `panelX` slides the sharp panel off-centre - the intro and outro park it on
 * the right so their text never crosses its edge.
 */
const FloodStage: React.FC<{ fromSec: number; tint: number; panelX?: number }> = ({
  fromSec,
  tint,
  panelX = 0,
}) => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, 200], [1, 1.06], {
    easing: Easing.inOut(Easing.ease),
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: "#04101f" }}>
      <AbsoluteFill style={{ filter: "blur(26px)", opacity: 0.55 }}>
        <Video
          src={staticFile("footage/flood.mp4")}
          muted
          trimBefore={sec(fromSec)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            height: 980,
            width: 552,
            borderRadius: 28,
            overflow: "hidden",
            transform: `translateX(${panelX}px) scale(${push})`,
            boxShadow: "0 40px 90px rgba(0,0,0,.55)",
          }}
        >
          <Video
            src={staticFile("footage/flood.mp4")}
            muted
            trimBefore={sec(fromSec)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(3,14,28,${tint})` }} />
    </AbsoluteFill>
  );
};

/** A phone bezel around real footage - the body of every app beat. */
const DemoPhone: React.FC<{
  src: string;
  fromSec: number;
  playbackRate?: number;
  span: number;
  punch?: [number, number];
}> = ({ src, fromSec, playbackRate = 1, span, punch }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const float = Math.sin((frame / fps / 6.5) * Math.PI * 2) * 5;
  let push = interpolate(frame, [0, span], [1, 1.05], {
    easing: Easing.inOut(Easing.ease),
    extrapolateRight: "clamp",
  });
  let punchLift = 0;
  if (punch) {
    const [inAt, outAt] = punch;
    const p = interpolate(
      frame,
      [inAt, inAt + 14, outAt - 14, outAt],
      [0, 1, 1, 0],
      {
        easing: Easing.inOut(Easing.ease),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
    push *= 1 + 0.2 * p;
    punchLift = -44 * p;
  }
  const height = 920;
  const width = height * (390 / 844);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%,-50%) translateX(330px) translateY(${
          interpolate(enter, [0, 1], [24, 0]) + float + punchLift
        }px) scale(${push})`,
        opacity: enter,
        width,
        height,
        borderRadius: 46,
        padding: 11,
        background: "#0b1220",
        boxShadow:
          "0 50px 90px rgba(2,12,30,.5), 0 0 0 1px rgba(255,255,255,.08)",
        overflow: "hidden",
      }}
    >
      <Video
        src={staticFile(src)}
        muted
        trimBefore={sec(fromSec)}
        playbackRate={playbackRate}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: 36,
          display: "block",
        }}
      />
    </div>
  );
};

/**
 * The same shot, at desk width.
 *
 * The board is desktop-only and says so on a phone, so its capture is 1280x800
 * and cannot go inside the phone frame without cropping three of its four
 * columns away. Wider, shorter, squarer corners - a monitor rather than a
 * handset - and pushed down, because the beat card sits above it.
 */
const DemoScreen: React.FC<{
  src: string;
  fromSec: number;
  playbackRate?: number;
  span: number;
}> = ({ src, fromSec, playbackRate = 1, span }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const float = Math.sin((frame / fps / 6.5) * Math.PI * 2) * 4;
  const push = interpolate(frame, [0, span], [1, 1.04], {
    easing: Easing.inOut(Easing.ease),
    extrapolateRight: "clamp",
  });
  const width = 1080;
  const height = width * (800 / 1280);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%,-50%) translateX(340px) translateY(${
          interpolate(enter, [0, 1], [24, 0]) + float + 40
        }px) scale(${push})`,
        opacity: enter,
        width,
        height,
        borderRadius: 18,
        padding: 10,
        background: "#0b1220",
        boxShadow:
          "0 50px 90px rgba(2,12,30,.5), 0 0 0 1px rgba(255,255,255,.08)",
        overflow: "hidden",
      }}
    >
      <Video
        src={staticFile(src)}
        muted
        trimBefore={sec(fromSec)}
        playbackRate={playbackRate}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: 10,
          display: "block",
        }}
      />
    </div>
  );
};

/** Chapter chip, headline, and the narration line, on the left. */
const BeatCard: React.FC<{
  chapter?: string;
  title?: string;
  caption?: string;
  caption2?: { text: string; atSec: number };
  accent: string;
}> = ({ chapter, title, caption, caption2, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 4, fps, config: { damping: 200 }, durationInFrames: 20 });
  const y = interpolate(enter, [0, 1], [24, 0]);

  const swapAt = caption2 ? Math.round(caption2.atSec * fps) : Infinity;
  const cap1 = caption2
    ? interpolate(frame, [swapAt - 6, swapAt + 4], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  const cap2 = caption2
    ? interpolate(frame, [swapAt, swapAt + 10], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: 130,
        top: "50%",
        transform: `translateY(-50%) translateY(${y}px)`,
        opacity: enter,
        width: 640,
        fontFamily: FONT,
        color: INK,
      }}
    >
      {chapter && (
        <div
          style={{
            display: "inline-block",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2.5,
            color: "#ffffff",
            background: accent,
            borderRadius: 999,
            padding: "8px 20px",
            marginBottom: 26,
          }}
        >
          {chapter}
        </div>
      )}
      {title && (
        <div style={{ marginBottom: 24 }}>
          <WordReveal text={title} size={62} color={INK} delay={6} stagger={2} />
        </div>
      )}
      <div style={{ position: "relative", minHeight: 130, maxWidth: 560 }}>
        {caption && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              fontSize: 29,
              lineHeight: 1.45,
              opacity: 0.78 * cap1,
            }}
          >
            {caption}
          </div>
        )}
        {caption2 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              fontSize: 29,
              lineHeight: 1.45,
              opacity: 0.78 * cap2,
              transform: `translateY(${interpolate(cap2, [0, 1], [14, 0])}px)`,
            }}
          >
            {caption2.text}
          </div>
        )}
      </div>
    </div>
  );
};

/** A fact from the interface, floating free of the phone. */
const StatChip: React.FC<{ stat: { big: string; small: string }; accent: string }> = ({
  stat,
  accent,
}) => (
  // Beside the phone, never on it: at x 1385 the card sat over the top-right
  // of the screen and hid the map's depth legend.
  <FloatingCard x={1548} y={250} delay={20} rotate={2}>
    <div style={{ fontSize: 30, fontWeight: 700, whiteSpace: "nowrap" }}>
      {stat.big}
    </div>
    <div
      style={{
        fontSize: 19,
        opacity: 0.65,
        marginTop: 4,
        whiteSpace: "nowrap",
        borderLeft: `4px solid ${accent}`,
        paddingLeft: 8,
      }}
    >
      {stat.small}
    </div>
  </FloatingCard>
);

/** Light stage behind the app beats, with the water accent breathing below. */
const AppStage: React.FC<{ accent: string; children: React.ReactNode }> = ({
  accent,
  children,
}) => (
  <AbsoluteFill
    style={{ background: "linear-gradient(160deg, #f2f7fb 0%, #e5eef6 100%)" }}
  >
    <AbsoluteFill style={{ opacity: 0.35 }}>
      <WaterPlane level={0.085} colour={accent} speed={0.8} chop={1.1} />
    </AbsoluteFill>
    {children}
  </AbsoluteFill>
);

/**
 * Centered on purpose - Elijah preferred the title block sitting over the
 * flood panel to the side-by-side version that briefly replaced it.
 */
const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fill = interpolate(frame, [10, 70], [0.18, 0.6], {
    easing: Easing.inOut(Easing.ease),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <AbsoluteFill>
      <FloodStage fromSec={0} tint={0.38} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 26,
          opacity: enter,
        }}
      >
        <LiveMark size={132} fill={fill} />
        <WordReveal text="Antas" size={120} delay={8} />
        {/* Kept inside the flood panel's 552px: wrap rather than spill. */}
        <div
          style={{
            fontFamily: FONT,
            fontSize: 28,
            lineHeight: 1.35,
            color: "#ffffff",
            opacity: 0.85,
            letterSpacing: 0.5,
            maxWidth: 470,
            textAlign: "center",
          }}
        >
          Six hazards, street by street, for barangays
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 6, fps, config: { damping: 200 }, durationInFrames: 24 });
  const fill = interpolate(frame, [10, 80], [0.35, 0.62], {
    easing: Easing.inOut(Easing.ease),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill>
      <FloodStage fromSec={13} tint={0.68} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
        }}
      >
        <LiveMark size={140} fill={fill} />
        <WordReveal text="Antas" size={130} delay={8} />
        {/* Kept inside the flood panel's 552px: wrap rather than spill. */}
        <div
          style={{
            fontFamily: FONT,
            fontSize: 30,
            lineHeight: 1.35,
            color: "#ffffff",
            opacity: 0.9,
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          Know how bad it is before you go.
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 24,
            color: "#ffffff",
            opacity: 0.55,
            letterSpacing: 1,
            marginTop: 10,
          }}
        >
          antas-one.vercel.app
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * The whole video with the poster as its opening second. Google Drive builds
 * its preview tile from the video's early frames and ignores embedded cover
 * art, so the poster has to literally BE the first frames to show up there.
 */
export const POSTER_FRAMES = sec(0.2);
export const DemoWithPoster: React.FC = () => (
  <AbsoluteFill style={{ background: "#04101f" }}>
    <Sequence durationInFrames={POSTER_FRAMES} name="poster">
      <Thumbnail />
    </Sequence>
    <Sequence from={POSTER_FRAMES} name="demo">
      <Demo />
    </Sequence>
  </AbsoluteFill>
);

/**
 * The thumbnail, as its own one-frame composition: everything at full
 * presence with no entrance animation, because frame zero is the whole show.
 * Rendered with `npx remotion still Thumbnail out/thumbnail.png`.
 */
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: "#04101f", fontFamily: FONT }}>
    {/* Frozen: as the video's opening card, a moving backdrop reads as the
        film having already started rather than as a poster. */}
    <AbsoluteFill style={{ filter: "blur(22px)", opacity: 0.8 }}>
      <Freeze frame={0}>
        <Video
          src={staticFile("footage/flood.mp4")}
          muted
          trimBefore={sec(8.5)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </Freeze>
    </AbsoluteFill>
    <AbsoluteFill style={{ background: "rgba(3,14,28,0.35)" }} />
    <AbsoluteFill style={{ opacity: 0.5 }}>
      <WaterPlane level={0.12} colour={DEPTH.waist} chop={1.2} />
    </AbsoluteFill>
    <div
      style={{
        position: "absolute",
        left: 150,
        top: "50%",
        transform: "translateY(-50%)",
        width: 820,
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      <LiveMark size={150} fill={0.55} />
      <div
        style={{
          fontSize: 150,
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: -3,
          lineHeight: 1,
        }}
      >
        Antas
      </div>
      <div style={{ fontSize: 40, color: "#ffffff", opacity: 0.92 }}>
        Know how bad it is before you go.
      </div>
      <div style={{ fontSize: 28, color: "#ffffff", opacity: 0.6, letterSpacing: 1 }}>
        Six hazards, street by street, for barangays
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%,-50%) translateX(430px) rotate(3deg)",
        width: 920 * (390 / 844),
        height: 920,
        borderRadius: 46,
        padding: 11,
        background: "#0b1220",
        boxShadow:
          "0 50px 90px rgba(2,12,30,.6), 0 0 0 1px rgba(255,255,255,.1)",
        overflow: "hidden",
      }}
    >
      <Freeze frame={0}>
        <Video
          src={staticFile("captures/scene-search.webm")}
          muted
          trimBefore={sec(8.6)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: 36,
            display: "block",
          }}
        />
      </Freeze>
    </div>
  </AbsoluteFill>
);

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ background: "#04101f" }}>
    {BEATS.map((beat, i) => {
      const prev = BEATS[i - 1];
      const next = BEATS[i + 1];
      // Chapter changes get the wave; a continuation (same chapter as its
      // neighbour) cuts clean so the flow reads as one action.
      const drains = i > 0 && prev?.chapter !== beat.chapter;
      const rises = next && next.chapter !== beat.chapter;
      return (
        <Sequence
          key={i}
          from={beat.from}
          durationInFrames={beat.frames}
          name={beat.chapter ?? (i === 0 ? "intro" : "outro")}
        >
          {beat.clip === null ? (
            beat.flood ? (
              <FloodStage fromSec={beat.flood.fromSec} tint={beat.flood.tint} />
            ) : i === 0 ? (
              <Intro />
            ) : (
              <Outro />
            )
          ) : (
            <AppStage accent={beat.accent}>
              <BeatCard
                chapter={beat.chapter}
                title={beat.title}
                caption={beat.caption}
                caption2={beat.caption2}
                accent={beat.accent}
              />
              {beat.wide ? (
                <DemoScreen
                  src={beat.clip.src}
                  fromSec={beat.clip.fromSec}
                  playbackRate={beat.clip.playbackRate}
                  span={beat.frames}
                />
              ) : (
                <DemoPhone
                  src={beat.clip.src}
                  fromSec={beat.clip.fromSec}
                  playbackRate={beat.clip.playbackRate}
                  span={beat.frames}
                  punch={beat.punch}
                />
              )}
              {beat.stat && <StatChip stat={beat.stat} accent={beat.accent} />}
            </AppStage>
          )}
          {drains && <WaterDrain colour={beat.accent} />}
          {drains && (
            <Audio src={staticFile("audio/sfx/swoosh.wav")} volume={0.32} />
          )}
          {rises && <WaterRise colour={next.accent} />}
          {beat.clip === null && (
            <Audio
              src={staticFile("audio/sfx/rain.wav")}
              volume={beat.flood ? 0.4 : 0.55}
            />
          )}
        </Sequence>
      );
    })}
    {/* The narration track - decoupled so a line can ride across cuts. */}
    {NARRATION.map(({ file, at }) => (
      <Sequence key={file} from={sec(at)} name={`vo-${file}`}>
        <Audio src={staticFile(`audio/narration/james/${file}`)} />
      </Sequence>
    ))}
    {DINGS.map((at) => (
      <Sequence key={at} from={sec(at)} name="chime">
        <Audio src={staticFile("audio/sfx/chime.wav")} volume={0.4} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
