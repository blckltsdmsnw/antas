# Antas Demonstration Video — Shot-by-Shot Script (v2)

**Genre:** SaaS product walkthrough (demonstration, NOT promo). **Length:** ~100s
(was ~76s; the multi-hazard picker, the responder register and the master
admin's board were added on 2026-09-09). **Narration:** English — edge-tts
`en-PH-JamesNeural` at `--rate=+10%`, rendered to
`video/public/audio/narration/{james,rosa}/shot-*.mp3`. **Footage:** local dev
only, never production — bot protection, and no demo reports on the public map.

**v2 is assembled and rendered.** The table below describes the cut that
exists, not a plan for one. Every chapter except 02 and 04 is a Playwright
capture from `capture-console.mjs`; those two are Elijah's phone recording
(`footage/screen.mp4`).

## Chapters

| # | Start | Dur | Chapter | Footage | Narration |
|---|-------|-----|---------|---------|-----------|
| 1 | 0:00 | 6.0s | *(intro card)* | — | "This is Antas — a community flood-reporting app for barangays. Here's how it works." |
| 2 | 0:06 | 7.0s | 01 · MAPA | `scene-search.webm` | "The map shows live flood reports. Anyone can search a place and check conditions — no account needed." |
| 3 | 0:13 | 5.5s | 02 · GABAY | `screen.mp4` | "Gabay puts emergency hotlines and a preparedness checklist first — and it works offline." |
| 4 | 0:18.5 | 16.2s | 03 · I-REPORT | `scene-report-flood.webm` | **shot-04a** "Every report starts with what is happening: flood, fire, earthquake, accident, medical, or other." → **shot-04** the depth line |
| 5 | 0:34.7 | 8.5s | 04 · KOMUNIDAD | `screen.mp4` | pin lands, neighbours confirm |
| 6 | 0:43.2 | 16.0s | 05 · TULONG | `scene-sos-flood.webm` | live photo required, hazard chips optional, 3-second hold, callback number |
| 7 | 0:59.2 | 8.0s | 06 · CONSOLE | `scene-console.webm` | "Only barangay moderators see an SOS — it never appears on the public map." |
| 8 | 1:07.2 | 2.5s | 06 · CONSOLE | `scene-direksyon.webm` | *(the tap itself)* |
| 9 | 1:09.7 | 5.0s | 06 · CONSOLE | `scene-direksyon-2.webm` | "One tap opens Google Maps — straight to the caller's exact location." |
| 10 | 1:14.7 | 7.5s | **07 · RESPONDER** | `scene-responder.webm` | **shot-10** "Anyone signed in can register as a responder — fire service, barangay rescue, medical, or police." |
| 11 | 1:22.2 | 10.5s | **08 · BOARD** | `scene-board.webm` *(desk width)* | **shot-11** "A master admin works reports and signals on one board, and records which responder was put on each. Antas still sends no rescue — it keeps the record." |
| 12 | 1:32.7 | 7.5s | *(outro card)* | — | "Fully bilingual, offline-ready, and installable on any phone. Antas — know the depth before you go." |

Total 100.2s. `DEMO_DURATION` in `src/Demo.tsx` is the single source of truth;
`Root.tsx` reads it.

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
