import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AntasMark, BRoll, Caption, DEPTH, FONT, PAPER, Phone } from "./ui";

/**
 * The Antas promotional video.
 *
 * Four beats and a close, in the order the research report argues them: the gap
 * official warnings leave, the scale that answers it, the honesty about age,
 * and then the refusal - which is the most distinctive thing the product does
 * and therefore the beat that gets the quiet, slower treatment.
 *
 * It deliberately does NOT open with what the app is. Every other video in the
 * showcase will open with what their app is. This opens with the problem,
 * because the problem is the part the audience already recognises.
 */

const S1 = 420; // 14s - the gap
const S2 = 630; // 21s - the scale is a body
const S3 = 510; // 17s - every reading carries its age
const S4 = 390; // 13s - the refusal
const S5 = 300; // 10s - close

export const PROMO_DURATION = S1 + S2 + S3 + S4 + S5; // 2250 frames = 75s

export type PromoProps = {
  /**
   * Generated b-roll filenames inside `public/broll/`, or null for the drawn
   * water field. Null is the shipped default: the video renders complete with
   * no generated footage at all, and improves if you add some.
   */
  broll: {
    rain: string | null;
    dusk: string | null;
  };
};

/** Caption on the left, phone on the right - the layout for every demo beat. */
const Split: React.FC<{
  children: React.ReactNode;
  phone: React.ReactNode;
}> = ({ children, phone }) => (
  <AbsoluteFill>
    <div
      style={{
        position: "absolute",
        left: 120,
        top: 0,
        bottom: 0,
        width: 820,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </div>
    <div style={{ position: "absolute", right: -40, top: 0, bottom: 0, width: 900 }}>
      {phone}
    </div>
  </AbsoluteFill>
);

/** Beat 1. The problem, stated the way somebody standing in it would state it. */
const TheGap: React.FC<{ broll: string | null }> = ({ broll }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const markIn = spring({
    frame: frame - 250,
    fps,
    config: { damping: 200 },
    durationInFrames: 26,
  });

  return (
    <AbsoluteFill>
      <BRoll src={broll} tint="rgba(3,18,38,0.62)" />
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", padding: 140 }}
      >
        <Sequence durationInFrames={250} layout="none">
          <Caption
            align="center"
            lead="A flood warning is issued"
            title="It names your city."
            note="It cannot tell you whether your own street is passable."
          />
        </Sequence>

        <Sequence from={250} layout="none">
          <div
            style={{
              opacity: markIn,
              transform: `scale(${interpolate(markIn, [0, 1], [0.9, 1])})`,
              textAlign: "center",
              fontFamily: FONT,
              color: "#fff",
            }}
          >
            <AntasMark size={150} />
            <div
              style={{ fontSize: 92, fontWeight: 700, letterSpacing: -2, marginTop: 12 }}
            >
              Antas
            </div>
            <div style={{ fontSize: 32, opacity: 0.85, marginTop: 10 }}>
              Gaano kalalim ang baha — street by street.
            </div>
          </div>
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Beat 2. The five-level body scale, which is the core design idea. */
const TheScale: React.FC = () => (
  <AbsoluteFill
    style={{ background: `linear-gradient(135deg, ${DEPTH.chest}, #0b1220)` }}
  >
    <Split phone={<Phone src="scene-report.webm" scale={0.95} />}>
      <Caption
        lead="The scale is a body"
        title="Ankle. Knee. Waist. Chest. Above head."
        note="Nobody standing in floodwater knows it is sixty-three centimetres. They know where it reaches on them — so that is what Antas asks for."
      />
    </Split>
  </AbsoluteFill>
);

/** Beat 3. Age, which is the thing every other channel leaves out. */
const TheAge: React.FC = () => (
  <AbsoluteFill
    style={{ background: `linear-gradient(135deg, #0b1220, ${DEPTH.waist})` }}
  >
    <Split phone={<Phone src="scene-search.webm" scale={0.95} />}>
      <Caption
        lead="Every reading carries its age"
        title="How deep — and how long ago."
        note="Water moves. Past six hours the map refuses to draw a reading at all, and says why: an empty map with a reason beats a confident map that is wrong."
      />
    </Split>
  </AbsoluteFill>
);

/**
 * Beat 4. The refusal.
 *
 * Quieter and slower than the rest. Every other flood product claims more than
 * it can do; this one claims less, on purpose, and that is the line worth
 * remembering after the video ends.
 */
const TheRefusal: React.FC<{ broll: string | null }> = ({ broll }) => (
  <AbsoluteFill>
    <BRoll src={broll} tint="rgba(5,10,28,0.78)" />
    {/*
      Uses the same Split as the demo beats rather than a bespoke flex row.
      The first attempt laid the phone out in a flex column, but `Phone` is an
      AbsoluteFill and centres itself on the whole canvas rather than inside
      that column - so it sat on top of the caption and cut the sentence to
      "Antas sends no rescu". On the one line this video exists to deliver.
      Only the background changes here; the layout is the proven one.
    */}
    <Split phone={<Phone src="scene-tulong.webm" scale={0.86} />}>
      <Caption
        lead="What it will not do"
        title="Antas sends no rescue."
        note="It says so on every screen that could be mistaken for one. A tool that implies help is coming makes somebody wait instead of climbing. In an emergency, call 911."
      />
    </Split>
  </AbsoluteFill>
);

/** The close. What it costs to use: nothing. */
const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });

  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: FONT }}>
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", opacity: enter }}
      >
        <AntasMark size={140} fill={DEPTH.waist} />
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: -2.5,
            color: "#0f172a",
            marginTop: 8,
          }}
        >
          Antas
        </div>
        <div style={{ fontSize: 34, color: "#475569", marginTop: 14 }}>
          antas-one.vercel.app
        </div>
        <div
          style={{
            display: "flex",
            gap: 44,
            marginTop: 46,
            fontSize: 26,
            color: "#475569",
            fontWeight: 600,
          }}
        >
          <span>Works offline</span>
          <span>·</span>
          <span>No account needed</span>
          <span>·</span>
          <span>Filipino or English</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Promo: React.FC<PromoProps> = ({ broll }) => (
  <AbsoluteFill style={{ backgroundColor: "#050a1c" }}>
    <Sequence durationInFrames={S1}>
      <TheGap broll={broll.rain} />
    </Sequence>
    <Sequence from={S1} durationInFrames={S2}>
      <TheScale />
    </Sequence>
    <Sequence from={S1 + S2} durationInFrames={S3}>
      <TheAge />
    </Sequence>
    <Sequence from={S1 + S2 + S3} durationInFrames={S4}>
      <TheRefusal broll={broll.dusk} />
    </Sequence>
    <Sequence from={S1 + S2 + S3 + S4} durationInFrames={S5}>
      <Close />
    </Sequence>
  </AbsoluteFill>
);
