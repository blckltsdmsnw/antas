# Antas Demonstration Video — Shot-by-Shot Script (v1)

**Genre:** SaaS product walkthrough (demonstration, NOT promo). **Length:** ~59s. **Narration:** English — RENDERED 2026-08-19 in both approved voices at `video/public/audio/narration/{james,rosa}/shot-01..09.mp3` (edge-tts, `en-PH-JamesNeural` / `en-PH-RosaNeural`, rate +10%; James totals 52.7s and fits easily, Rosa 56.9s is tight on shots 2 and 9). **Recorded by:** Elijah, screen capture against **local dev only** (never production — bot protection + no demo reports on the public map). Shot durations below are set to the measured narration; record each action to roughly fill its slot — a second of slack either way is fine, Remotion trims.

## Recording setup (before filming)

1. `npm run dev` in `C:\xampp\htdocs\app`; open Chrome DevTools device emulation, portrait phone (e.g. Pixel 7, 100% zoom).
2. Launch Chrome with the fake-camera flags so the report camera shows the flood clip:
   `chrome --use-fake-device-for-media-stream --use-file-for-fake-video-capture=C:\path\to\flood.y4m`
   (Give me the flood clip and I'll convert it to `.y4m` with ffmpeg.)
3. **Drive every feature once off-camera first** — this project has shipped inert features before. Verify by looking, not by tests.
4. Record each shot as its own clip (named `shot-01.mp4` etc.) — Remotion stitches them; retakes stay cheap.
5. Screen recorder: OBS or Windows Game Bar, 60fps if possible, capture the emulated phone viewport only.

## Shots

| # | Time | Dur | On-screen action (what you record) | Narration (AI voice) |
|---|------|-----|-------------------------------------|----------------------|
| 1 | 0:00–0:06 | 6s | App opens on **Mapa** `/`. Brief hold on the map with existing pins. | "This is Antas — a community flood-reporting app for barangays. Here's how it works." |
| 2 | 0:06–0:13 | 7s | Search a place, map pans to it, tap an existing pin to show its details. | "The map shows live flood reports. Anyone can search a place and check conditions — no account needed." |
| 3 | 0:13–0:19 | 6s | Switch to **Gabay** `/gabay`. Scroll: hotlines on top, tick one checklist item. | "Gabay puts emergency hotlines and a preparedness checklist first — and it works offline." |
| 4 | 0:19–0:31 | 12s | **I-report** `/report`: camera opens showing the moving flood scene (fake-camera trick), tap shutter, photo captured. Set depth on the body-part selector (keep default **Tuhod/Knee**), location confirms, submit. | "To report a flood, take a photo and set the water depth using body-level markers — here, knee-deep. Location is confirmed, and the report is sent." |
| 5 | 0:31–0:35 | 4s | Back on **Mapa**: the new pin appears; tap it — the photo is attached. | "The report appears on the map instantly, photo included." |
| 6 | 0:35–0:39 | 4s | **Ako** `/ako`: your reports listed; show the delete affordance (don't delete — we need the pin for shot 8). | "Under Ako, residents manage their own reports." |
| 7 | 0:39–0:44 | 5s | **Tulong** `/sos`: press-and-hold the SOS button until it arms (show the honesty notice briefly). Release before it fires, or let it fire against local dev if safe. | "Tulong is a press-and-hold SOS for real emergencies." |
| 8 | 0:44–0:52 | 8s | **Moderator side**: `/login` (quick), `/console` queue shows the new signal, open `/console/[id]`, view the photo + depth, click the decision (verify). | "On the other side, barangay moderators privately review each SOS — photo, location, and trust score — and decide it." (corrected 2026-08-19: an SOS never reaches the public map; only depth reports do) |
| 9 | 0:52–0:59 | 7s | Tap the language toggle — UI flips Filipino⇄English. Cut to end card (Remotion; card can hold a silent beat past the voice). | "Fully bilingual, offline-ready, and installable on any phone. Antas — know the depth before you go." |

**Narration rendered:** durations above match the James renders (+0–1s slack each); Rosa runs ~0.5s longer per line and bleeds across cuts on shots 2 and 9, which is acceptable.

## Remotion polish layer (my job, after your clips arrive)

- Chapter label cards (lower-third, 5 chapters: Mapa · Gabay · I-report · Tulong · Console) — reuse existing design tokens, not the rejected promo compositions.
- Zoom/highlight callouts on: depth selector (shot 4), new pin (shot 5), decision button (shot 8).
- Captions from the narration lines (rubric insurance — every function gets named on screen even at this pace).
- Music bed at low volume: drop an mp3 at `video/public/audio/music.mp3` (wiring already exists).
- End card with app name + tagline.

## Rubric coverage check

- Purpose/objectives → shot 1. Each feature step-by-step → shots 2–8 (one beat each; **thinnest part at 58s** — if graded harshly, stretching to ~90s doubles shots 4 and 8). Complete process start-to-finish → the spine: report → pin → moderator decision (shots 4–8). What each function does → one narration line per function + captions.

## Open items

- [x] Flood clip delivered + converted (fake camera feed, report photo, cold open/outro b-roll)
- [x] Voices: James + Rosa rendered; **James used in the cut** (swap = one line in Demo.tsx)
- [x] Elijah recorded the app (one 116s take, best segments cut in)
- [x] Local Playwright captures for what the phone couldn't show: flood-fed SOS camera, flood-photo report, moderator console (see `capture-console.mjs`)
- [x] Assembled: `src/Demo.tsx` → `out/antas-demo.mp4` (59s, rendered 2026-08-19)
- [ ] Music bed — still wanted: drop an mp3 at `public/audio/music.mp3` and ask for it to be wired in
- [ ] Elijah: watch the cut, note timestamps to change
