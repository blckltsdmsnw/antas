# Antas Demonstration Video — Shot-by-Shot Script (v5)

**Genre:** SaaS product walkthrough (demonstration, NOT promo). **Length:** ~147s
(76s → 100s → 108s → 140s → 147s; the multi-hazard picker, a fire report, the
other four hazard vocabularies, Ako, the console's report queue, the responder
register, the board, a responder's own tab, and the offline reload). **Narration:** English — edge-tts
`en-PH-JamesNeural` at `--rate=+10%`, rendered to
`video/public/audio/narration/{james,rosa}/shot-*.mp3`. **Footage:** local dev
only, never production — bot protection, and no demo reports on the public map.

**v2 is assembled and rendered.** The table below describes the cut that
exists, not a plan for one. Every chapter except 02 and 04 is a Playwright
capture from `capture-console.mjs`; those two are Elijah's phone recording
(`footage/screen.mp4`).

## Chapters

| # | Start | Dur | Chapter | Footage | What it shows |
|---|-------|-----|---------|---------|----------------|
| 1 | 0:00 | 6.0s | *(intro card)* | — | "Residents report what is happening on their street, and how bad it is." |
| 2 | 0:06 | 7.0s | 01 · MAPA | `scene-search.webm` | live map, place search, the legend — six hazards and five depths |
| 3 | 0:13 | 5.5s | 02 · GABAY | `screen.mp4` | hotlines first, checklist |
| 4 | 0:18.5 | 7.0s | 02 · GABAY | `scene-offline.webm` | **network off, then reload — the guide opens from cache** |
| 5 | 0:25.5 | 16.2s | 03 · I-REPORT | `scene-report-flood.webm` | the six-hazard picker → flood on the body scale → viewfinder → submitted |
| 6 | 0:41.7 | 8.0s | 03 · I-REPORT | `scene-report-fire.webm` | fire: three severity words, submit disabled until answered |
| 7 | 0:49.7 | 10.0s | 03 · I-REPORT | `scene-report-hazards.webm` | earthquake, accident, medical, other — each with its own three words |
| 8 | 0:59.7 | 8.5s | 04 · KOMUNIDAD | `screen.mp4` | the pin lands; neighbours confirm the water is gone |
| 9 | 1:08.2 | 7.0s | 05 · AKO | `scene-ako.webm` | your own reports, and the language toggle moving every string |
| 10 | 1:15.2 | 16.0s | 06 · TULONG | `scene-sos-flood.webm` | live photo required, hazard chips optional, 3-second hold, callback number |
| 11 | 1:31.2 | 8.0s | 07 · CONSOLE | `scene-console.webm` | the SOS queue, trust score, evidence, decision |
| 12 | 1:39.2 | 9.0s | 07 · CONSOLE | `scene-console-reports.webm` | the second queue: priority bands, keep or hide with a reason |
| 13 | 1:48.2 | 2.5s | 07 · CONSOLE | `scene-direksyon.webm` | the tap itself |
| 14 | 1:50.7 | 5.0s | 07 · CONSOLE | `scene-direksyon-2.webm` | the Google Maps route it opened |
| 15 | 1:55.7 | 7.5s | 08 · RESPONDER | `scene-responder.webm` | Ako → Responder: name, unit, barangay |
| 16 | 2:03.2 | 10.5s | 09 · BOARD | `scene-board.webm` *(desk width)* | four columns, 48-hour graph, barangay ranking, assignment |
| 17 | 2:13.7 | 6.0s | 10 · NAKATALAGA | `scene-assigned.webm` | the responder's own tab — only their incidents |
| 18 | 2:19.7 | 7.5s | *(outro card)* | — | "Antas — know how bad it is before you go." |

Total 147.2s. `DEMO_DURATION` in `src/Demo.tsx` is the single source of truth;
`Root.tsx` reads it.

## Feature coverage, and what is still missing

Covered: the map and its legend, place search, the guide, **the offline
reload**, all six hazards and all six severity vocabularies, the body-depth
scale, the in-page viewfinder, freshness answers, a resident's own reports, the
language toggle, the SOS arc with its chips and callback number, both console
queues, the trust score and its evidence, the directions hand-off, the
responder register, the board with its graph and assignment, and a responder's
own tab.

The offline scene is the one shot that cannot be filmed against `next dev`:
`ServiceWorkerRegistration.tsx` deliberately skips registration outside
production, because a worker serving stale bundles between edits reads as the
app being broken. Film it against `next start` on another port and point the
rig at it with `CAPTURE_BASE=http://127.0.0.1:3001`.

**Not filmed, and the video should not imply otherwise:**

- **Install to home screen.** Claimed in the outro and deliberately not shown.
  The app has no `beforeinstallprompt` handler and no install button, so the
  affordance is Chrome's own browser chrome — which Playwright never captures
  and headless Chromium never draws. The only honest ways to film it are a real
  phone recording or building an in-app install button; Elijah decided on
  2026-09-09 to do neither. The claim stays because it is true: there is a
  manifest and the app does install.
- **The GPS accuracy warning** on `/report`, which only appears on an imprecise
  fix and cannot be forced from a scripted geolocation.
- **Road passability in MMDA categories**, which lives on the report detail —
  arguably the strongest single claim in the paper and absent from the video.
- **The day/night map theme**, because every scene is filmed at a fixed 10:20.

## Re-filming

Needs Docker + the local stack, and takes about five minutes end to end:

```
npx supabase start                 # Docker must be running first
npm run dev
npm run seed                       # rows for the board's columns
ffmpeg -y -i video/public/footage/flood.mp4 -t 12 \
  -vf "scale=640:480,fps=30" -pix_fmt yuv420p flood.y4m
FLOOD_Y4M=<abs path>/flood.y4m FLOOD_JPG=<abs path>/flood.jpg \
  node video/capture-console.mjs
```

Scene order matters in two places: `responder` must run before `board`, or the
roster is empty and there is nobody to assign; and `console` runs after `board`,
because `ensureModerator()` narrows `modemo@example.test` back to a plain
moderator and a plain moderator is refused the board. The board has its own
account (`master@example.test`, granted `master_admin` by `ensureMaster()`) for
exactly that reason.

The board scene films at 1280x800 — it is desktop-only and says so on a phone —
and `Demo.tsx` draws it in a monitor frame (`DemoScreen`) rather than the phone.

## The capture lessons, all of them earned the hard way

- **A tap near the foot of the page hits the bottom nav, silently.** The nav is
  fixed and its centre tab points at `/report`; clicking it while already on
  `/report` is a no-op in Next.js, so nothing errors and the scene films a
  screen that never advanced. `press()` wheels the target clear of the nav
  before clicking. `scrollIntoViewIfNeeded` does NOT help — a button half under
  the nav already satisfies it — and neither does `scrollIntoView({block:
  "center"})`, because the element is inside the scrollport, just covered.
- **`/report` opens on the hazard picker**, not the depth gauge. There is no
  submit button on that screen at all, and for every hazard except flood the
  submit stays disabled until a severity is chosen.
- **`/report`'s camera is the in-page viewfinder now** (`source="live"`), not
  the OS file picker it was until Mr. Peralta's review. The old `filechooser`
  path is gone; the flow is the same three taps as `/sos` and the fake-camera
  y4m feeds it.
- **Depth reports require sign-in** ("Mag-sign in muna bago mag-report"), and
  the error renders below the fold. Only SOS is anonymous. The script injects a
  real session as the `sb-<ref>-auth-token` cookie ("base64-" + base64url JSON,
  chunked at 3180), minted via `generateLink` + `verifyOtp` — the filmed
  magic-link flow strands its cookie across the localhost/127.0.0.1 host hop.
- **Google Maps "No routes found"** = origin equals destination. The moderator's
  geolocation must be offset from the caller's (14.513,121.043 vs
  14.497,121.053), and the mobile app-install interstitial needs "Go back to
  web" before the route films.
- **A failed scene now writes `scene-<name>-FAILED.png`.** A missed tap lands
  somewhere, and the URL alone does not say where.
- **`capture.mjs` used to empty the whole captures directory on startup.** It
  films only the five public scenes, but its `rmSync(OUT, {recursive: true})`
  deleted the seven authenticated ones too — which it cannot reproduce, because
  they need a session. Re-filming the single `search` scene on 2026-09-09 wiped
  everything and the render 404'd three minutes later. It now deletes only the
  scenes named on its own command line.

## What the video does NOT show, on purpose

There is no fire, earthquake or accident *footage*. The only incident footage in
the project is `footage/flood.mp4`, which Elijah sourced, and it is used as the
camera feed for a flood report — honest, because it is a real flood standing in
for the one the reporter is photographing. Feeding that same clip to a fire
report, or dropping stock fire footage in, would present sourced video as a
resident's evidence, which in a research submission reads as fabricated data.

So the fire chapter films the **app**, not the fire: the picker, the three
severity words, and the submit button visibly disabled until one is chosen.
Photographs are optional on `/report`, so it needs no footage at all. If a real
fire clip is ever sourced, wiring it in is one env var (`FLOOD_Y4M`) and a
`report-fire` scene that opens the camera.

The intro and outro cards still play over flood footage, for the same reason —
it is the only clip that exists.

`scene-search.webm` was re-filmed on 2026-09-09 as well: the old take predated
the hazards, so its map legend showed the five depth colours only, while the
narration two seconds later claimed six. The poster freezes a frame of that
capture, so a stale map shot would have been the first thing anyone saw.

## Known rough edges in the footage

- The console's evidence lines ("No other reports within 500m.", "38mm rainfall
  recorded in 24h.") are English inside a Filipino screen — they are built in
  `src/lib/scoring/score.ts` and never went through the dictionary. Visible in
  chapter 06 · CONSOLE. Pre-existing, not introduced by the video work.
- Seeded SOS rows mostly read "Hindi tinukoy" (no hazard chip), so the board's
  columns are repetitive. A more varied seed would film better.

## Open items

- [ ] Music bed — still wanted: drop an mp3 at `public/audio/music.mp3` and ask
      for it to be wired in
- [ ] Elijah: watch the v2 cut, note timestamps to change
- [ ] Re-upload to Drive if the cut is approved — the Drive copy is still the
      2026-08-19 76s version
