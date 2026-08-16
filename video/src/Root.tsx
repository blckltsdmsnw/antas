import React from "react";
import { Composition } from "remotion";
import { PROMO_DURATION, Promo, type PromoProps } from "./Promo";

/**
 * 1920x1080 because this is shown on a projector in a room, not on a phone.
 * The app itself is phone-shaped and appears inside a device frame; rendering
 * the whole video vertically would waste two thirds of the screen it is played
 * on. If a vertical cut is ever wanted for social, add a second composition
 * rather than changing this one.
 */
export const Root: React.FC = () => (
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
);
