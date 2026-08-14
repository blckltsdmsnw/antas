# Antas — where things stand

Last updated: 2026-08-14, ~05:00 PHT.

Everything described here is committed and pushed to
`github.com/blckltsdmsnw/antas`. Vercel auto-deploys `main`; a push takes about
45 seconds to go live.

---

## Do these first

Ordered by how much they matter. All of them need your credentials, which is
why they are still open.

### 1. Check the site actually loads

`antas-one.vercel.app` was returning **403** with a Vercel bot challenge. This
was self-inflicted: production was polled repeatedly with `curl` and headless
browsers to verify deploys, and Vercel's attack protection started challenging
automated traffic. A real browser can usually solve the challenge; automated
clients cannot.

If you hit a challenge or error page:
**Vercel → antas → Settings → Firewall → disable Attack Challenge Mode.**

Never confirmed either way. Until it is, nothing else here is verifiable.

### 2. Moderator role is on the wrong account

There are two real accounts:

| Account | Role |
|---|---|
| `elijaholores@gmail.com` | moderator, barangay `New Lower Bicutan` |
| `olores2216305@ceu.edu.ph` | no moderator row — made the one real photo report |

If you sign in to `/console` with the school account the queue will look empty
and nothing is wrong. Moving it is a one-line update to the `moderators` table
(`user_id`, `barangay`).

### 3. Seed a few more reports if you want to see clustering

Production has ~23 pins spread across Marikina and Taguig, so clusters rarely
form. Locally 680 reports collapse to 6 clusters at city zoom.

```
npx tsx --env-file=.env.hosted scripts/seed.ts taguig 10
```

The count is a **total**, not per-hotspot. Omitting it writes 25 per hotspot,
which is what previously buried the map in ~300 pins.

---

## What was built

### Phases 1–2b (earlier, complete)

Depth reporting, SOS with trust scoring, moderator console.

### This session

**Photos on depth reports.** `depth_reports.photo_path` existed in the schema
and was never written or read. Reports can now carry an optional photo; SOS
photos stay required. Migration `0013` adds the public `report-photos` bucket
and widens `reports_near` to return the path.

The bucket is **public**, unlike `sos-photos`, and the asymmetry is deliberate:
a depth report is a picture of a street, an SOS is a picture of a person in
distress. The capture screen states the visibility before offering the shutter.

**Tap a pin, see the water.** Pins are custom elements: photo pins show the
photograph, clusters show a count, and every pin fades with age.

**Full-screen photos** with pinch, double-tap and drag.

**Native camera on `/report`** — hands off to the phone's own camera app.
`/sos` deliberately keeps the in-page viewfinder: there it is an anti-abuse
measure, since `capture="environment"` is only a hint and many browsers will
happily offer the gallery instead.

**Clustering**, in screen space rather than metres. A cluster takes the depth of
its **deepest** member, never an average — eleven ankle-deep reports must not
hide one above-head report behind a reassuring pale blue.

**Live weather** from Open-Meteo, and **rain on the map** when it is really
raining on you. Neither asks for location on load.

**Night map** — light 06:00–18:00 Manila time, dark after. Task pages stay light
in every condition. See `docs/design/foundations.md` §7a.

**The clock is now the only input to the night map.** `prefers-color-scheme`
used to override it, which meant a phone left in dark mode — most phones — got a
dark basemap at 1:41pm, the exact daylight-readability case the design keeps
every other surface light for. The setting is a taste; the sun is a fact.
`mapThemeFor` lost its second parameter and `preferredScheme` is gone.

The page also seeded `useState<MapTheme>("light")` and corrected after mount, so
it stamped `data-map-theme="light"` for a frame before consulting the clock —
the white flash in a dark room the basemap already avoided. Both states are now
seeded from the clock.

**Pins are reachable everywhere on the map.** The legend and the weather strip
were opaque panels that painted over the pins and swallowed taps aimed at them,
so a cluster landing in a corner could be neither seen nor opened. The whole
stacking order now lives in one commented block of `:root` tokens in
`globals.css`: rain 5, chrome 6, pins 8, sheets 14/16, header 20. Pins deliberately
paint *above* the chrome — an unreachable report is worse than an untidy legend —
and the chrome is `pointer-events: none` except the one weather-strip state that
is a real button.

---

## Known issues, not fixed

- **`_map.png`** in the repo root is a leftover debug screenshot. Untracked,
  safe to delete.
- **Hydration warning on `/report`** from a `caret-color` style Chromium injects
  under automation. Dev-only, pre-existing, appears to be a tooling artifact.

---

## Things worth remembering about this codebase

Four of the bugs that mattered most this session were found by *looking at the
running thing*, not by tests — the suite was green through all of them:

- The map stayed light at 4am. `prefers-color-scheme: no-preference` was removed
  from the spec and matches nothing, so the clock was never consulted. The pure
  function was correct and tested; the browser-facing adapter was not.
- The camera viewfinder was black and the shutter captured nothing, because the
  stream was attached before React had committed the element.
- Rain looked frozen at "1fps" while the page held 60fps — the pattern was
  aliasing against the animation distance.
- Tapping a tight cluster did nothing, because a fixed zoom step cannot separate
  members sitting inside one touch target.

The recurring shape: **green tests are not evidence the thing works.** Drive it,
screenshot it, count the network requests, read the database.

A fifth, found later and worth its own note because it is the failure mode *of
the fix for the failure mode*: an e2e assertion for the map theme passed against
the old, broken code. `toHaveAttribute` retries until the **first** match, and
the page briefly stamped `data-map-theme="light"` on mount before the clock was
consulted — so the assertion kept catching the transient rather than the settled
value. A test that cannot go red is not a test. Always confirm a new guard fails
against the unfixed code before trusting it, and for anything that settles
asynchronously, assert the value twice and require both reads to agree.

---

## Verification commands

```
npm test                            # unit (175)
npx playwright test                 # e2e (8)
npx vitest run tests/integration    # integration (48) - needs local Supabase
npm run build
```

`vitest run src/` covers only unit tests. `tests/integration/` is a separate
directory, and running only `src/` once let a migration regression through.
