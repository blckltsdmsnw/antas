import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";

/**
 * The app's own depth ramp, copied from `src/app/globals.css`.
 *
 * Copied rather than imported: this package deliberately does not depend on the
 * application, so the two build and render independently. If the ramp ever
 * changes there, change it here - the video is the one place the two can drift
 * without anything failing.
 */
export const DEPTH = {
  ankle: "#7dd3fc",
  knee: "#38bdf8",
  waist: "#0284c7",
  chest: "#1e40af",
  aboveHead: "#581c87",
} as const;

export const INK = "#0f172a";
export const PAPER = "#f6f8fa";

export const FONT =
  '"Public Sans", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Fade in, hold, fade out - the timing every element in this video uses. */
export function useFade(durationInFrames: number, fadeFrames = 12) {
  const frame = useCurrentFrame();
  return interpolate(
    frame,
    [0, fadeFrames, durationInFrames - fadeFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

/**
 * Rising water, drawn rather than filmed.
 *
 * This plays when no b-roll file has been dropped in. It is not a placeholder
 * to be replaced and forgotten: an abstract wash of the product's own depth
 * colours is an honest background, where generated footage of a flooded Manila
 * street presented as real would not be. If you do add generated b-roll, keep
 * it clearly stylised for the same reason.
 */
export const WaterField: React.FC<{ from?: string; to?: string }> = ({
  from = DEPTH.chest,
  to = DEPTH.aboveHead,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}>
      {[0, 1, 2, 3].map((i) => {
        const phase = t * (0.16 + i * 0.05) + i * 0.7;
        const y = 40 + i * 16 + Math.sin(phase * Math.PI) * 6;
        return (
          <AbsoluteFill
            key={i}
            style={{
              background: `radial-gradient(120% 60% at 50% ${y}%, rgba(255,255,255,${
                0.1 - i * 0.02
              }), transparent 70%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * Generated b-roll if it exists, drawn water if it does not.
 *
 * `src` is a filename inside `public/broll/`, or null. Null is the default and
 * renders fine - the video never depends on footage that may not have been
 * generated yet.
 */
export const BRoll: React.FC<{
  src: string | null;
  tint?: string;
  opacity?: number;
}> = ({ src, tint = "rgba(2,20,40,0.55)", opacity = 1 }) => (
  <AbsoluteFill style={{ opacity }}>
    {src ? (
      <Video
        src={staticFile(`broll/${src}`)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ) : (
      <WaterField />
    )}
    <AbsoluteFill style={{ background: tint }} />
  </AbsoluteFill>
);

/**
 * A phone, holding a real capture of the running application.
 *
 * The bezel is doing real work: it tells the viewer at a glance that this is a
 * phone screen rather than a slide, which is the difference between "here is
 * our app" and "here is a picture of our idea".
 */
export const Phone: React.FC<{
  src: string;
  startFrom?: number;
  scale?: number;
  x?: number;
}> = ({ src, startFrom = 0, scale = 1, x = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const height = 900 * scale;
  const width = height * (390 / 844);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width,
          height,
          transform: `translateX(${x}px) translateY(${interpolate(
            rise,
            [0, 1],
            [40, 0],
          )}px)`,
          opacity: rise,
          borderRadius: 44 * scale,
          padding: 10 * scale,
          background: "#0b1220",
          boxShadow:
            "0 50px 90px rgba(2,12,30,.55), 0 0 0 1px rgba(255,255,255,.08)",
          overflow: "hidden",
        }}
      >
        <Video
          src={staticFile(`captures/${src}`)}
          muted
          trimBefore={startFrom}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: 34 * scale,
            display: "block",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/** The headline. One idea per card - never two sentences competing. */
export const Caption: React.FC<{
  lead?: string;
  title: string;
  note?: string;
  align?: "left" | "center";
  color?: string;
}> = ({ lead, title, note, align = "left", color = "#ffffff" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 });
  const y = interpolate(enter, [0, 1], [26, 0]);

  return (
    <div
      style={{
        fontFamily: FONT,
        color,
        opacity: enter,
        transform: `translateY(${y}px)`,
        textAlign: align,
        maxWidth: 820,
      }}
    >
      {lead && (
        <div
          style={{
            fontSize: 26,
            letterSpacing: 3,
            textTransform: "uppercase",
            opacity: 0.75,
            marginBottom: 18,
            fontWeight: 600,
          }}
        >
          {lead}
        </div>
      )}
      <div
        style={{ fontSize: 68, lineHeight: 1.08, fontWeight: 700, letterSpacing: -1.5 }}
      >
        {title}
      </div>
      {note && (
        <div style={{ fontSize: 30, lineHeight: 1.4, marginTop: 24, opacity: 0.82 }}>
          {note}
        </div>
      )}
    </div>
  );
};

/** The mark: a pin holding a flooded street, redrawn from `src/app/icon.svg`. */
export const AntasMark: React.FC<{ size?: number; fill?: string }> = ({
  size = 120,
  fill = "#ffffff",
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <path
      d="M32 4c-11 0-20 8.8-20 19.7C12 38.4 32 60 32 60s20-21.6 20-36.3C52 12.8 43 4 32 4z"
      fill={fill}
    />
    <rect x={21} y={20} width={7} height={20} fill={DEPTH.chest} opacity={0.9} />
    <rect x={30} y={14} width={7} height={26} fill={DEPTH.chest} opacity={0.9} />
    <rect x={39} y={24} width={6} height={16} fill={DEPTH.chest} opacity={0.9} />
    <rect x={18} y={30} width={28} height={10} fill={DEPTH.waist} />
  </svg>
);

/** A slow push-in. Stillness reads as a screenshot; motion reads as a product. */
export function useKenBurns(from = 1, to = 1.06) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return interpolate(frame, [0, durationInFrames], [from, to], {
    easing: Easing.inOut(Easing.ease),
    extrapolateRight: "clamp",
  });
}
