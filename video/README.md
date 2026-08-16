# The Antas promotional video

75 seconds, 1920×1080, built with Remotion. Every frame of interface in it is
the **real running application**, filmed with Playwright — not a mockup, not a
generated approximation of an app. A working deployment is the thing this
project has that a prototype does not, and generated footage of a fake
interface would throw that advantage away.

```
npx supabase start                                   # local database
npx tsx --env-file=.env.local scripts/seed.ts marikina 9
npx tsx --env-file=.env.local scripts/seed.ts taguig 7
npm run dev                                          # port 3000

npm --prefix video install
npm --prefix video run capture                       # films 5 scenes
npm --prefix video run render                        # -> video/out/antas-promo.mp4
npm --prefix video run studio                        # live preview while editing
```

Capture a single scene while iterating: `node video/capture.mjs tulong`.

## What it says, and why in that order

| Beat | Length | Says |
|---|---|---|
| The gap | 14s | A flood warning names your city. It cannot tell you about your street. |
| The scale is a body | 21s | Ankle, knee, waist, chest, above head. |
| Every reading carries its age | 17s | How deep, and how long ago. Past six hours it refuses to draw. |
| The refusal | 13s | Antas sends no rescue — and says so. Call 911. |
| Close | 10s | Offline, no account, Filipino or English. |

It deliberately does **not** open with what the app is. Every other video in a
showcase does that. This opens with the problem, because the problem is the part
the audience already recognises — and it closes on the refusal, because every
other flood product claims more than it can do and this one claims less.

## Adding generated b-roll

Two slots take generated footage. Both currently render a drawn "water field"
built from the app's own depth ramp, and **the video is complete without them** —
add footage only if it improves on that.

1. Put `.mp4` files in `video/public/broll/`.
2. Name them in `defaultProps` in `src/Root.tsx`:
   `broll: { rain: "rain.mp4", dusk: "dusk.mp4" }`

Prompts that suit the two slots, for Veo 3, Kling or Runway:

> **rain** (beat 1, 14s) — Slow static shot, heavy tropical rain falling on dark
> wet asphalt at street level, shallow water rising over a kerb, overcast grey
> daylight, no people, no vehicles, no text or signage, muted desaturated
> colour, documentary stillness.

> **dusk** (beat 4, 13s) — Very slow push in on still floodwater at dusk
> reflecting a dim overcast sky, empty residential street, no people, no
> vehicles, no signage, deep blue and violet tones, quiet and sombre.

**Keep it abstract, and never present it as documentary footage of a real
event.** No recognisable Metro Manila landmarks, no people in distress, no
caption implying a specific flood. This matters more than usual here: Antas
refuses to imply that rescue is coming and refuses invented precision, so a
promo that fabricates disaster footage would contradict the product it is
advertising. `WaterField` in `src/ui.tsx` exists so the honest option is also
the default one.

## Notes for whoever changes this

- **Film in daylight.** `capture.mjs` shifts `Date` to 10:20 so `mapThemeFor`
  gives the light basemap. Only `Date` is shifted, not the timers — Playwright's
  clock API would fake `requestAnimationFrame` too and freeze the map mid-pan.
- **Seed a realistic number of reports.** An early capture showed a cluster of
  294 pins accumulated from old seeding. That is not a nicer-looking map, it is
  a claim about adoption that is not true. Sixteen across two cities is honest
  and still shows clustering.
- **`recordVideo.size` must equal the viewport.** Playwright rasterises at CSS
  pixel size and pads the remainder with grey rather than scaling up; asking for
  3× produced a small screen in the corner of a large grey rectangle.
- **`Phone` is an `AbsoluteFill`,** so it centres on the whole canvas. Place it
  through `Split`, never in a bare flex row — doing the latter put the phone on
  top of the caption and cut "Antas sends no rescue." to "Antas sends no rescu".
- **The Tulong scene releases the hold early on purpose.** A full three-second
  hold would attempt a real submission. Nothing is written to any database by
  filming.
