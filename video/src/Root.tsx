import React from "react";
import { Composition } from "remotion";
import { PROMO_DURATION, Promo, type PromoProps } from "./Promo";
import {
  DEMO_DURATION,
  Demo,
  DemoWithPoster,
  POSTER_FRAMES,
  Thumbnail,
} from "./Demo";

/**
 * 1920x1080 because this is shown on a projector in a room, not on a phone.
 * The app itself is phone-shaped and appears inside a device frame; rendering
 * the whole video vertically would waste two thirds of the screen it is played
 * on. If a vertical cut is ever wanted for social, add a second composition
 * rather than changing this one.
 */
export const Root: React.FC = () => (
  <>
    {/* The demonstration walkthrough - real footage, chaptered, narrated. */}
    <Composition
      id="Demo"
      component={Demo}
      durationInFrames={DEMO_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
    {/* The Drive upload: the poster held for a second, then the video -
        Drive thumbnails from early frames and ignores embedded cover art. */}
    <Composition
      id="DemoPoster"
      component={DemoWithPoster}
      durationInFrames={DEMO_DURATION + POSTER_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
    {/* One frame: the poster image. `npx remotion still Thumbnail`. */}
    <Composition
      id="Thumbnail"
      component={Thumbnail}
      durationInFrames={1}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="Promo"
    component={Promo}
    durationInFrames={PROMO_DURATION}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={
      {
        // Drop generated clips into video/public/broll/ and name them here.
        // Left null, each falls back to the drawn water field, and the video
        // renders complete without any generated footage at all.
        broll: { rain: null, dusk: null },
      } satisfies PromoProps
    }
    />
  </>
);
