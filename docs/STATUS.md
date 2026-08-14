# Antas — where things stand

Last updated: 2026-08-14, ~14:00 PHT.

Everything described here is committed and pushed to
`github.com/blckltsdmsnw/antas`. Vercel auto-deploys `main`; a push takes about
45 seconds to go live.

**Production loads.** The 403 bot challenge that blocked every other check is
gone — confirmed in a real browser on 2026-08-14. It was self-inflicted:
production had been polled repeatedly with `curl` and headless browsers to
verify deploys, and Vercel's attack protection started challenging automated
traffic. Do not verify deploys that way. If a challenge page ever returns, it is
**Vercel → antas → Settings → Firewall → Attack Challenge Mode**.

---

## Do these first

Ordered by how much they matter. Both need your credentials, which is why they
are still open.

### 1. Moderator role is on the wrong account

There are two real accounts:

| Account | Role |
|---|---|
| `elijaholores@gmail.com` | moderator, barangay `New Lower Bicutan` |
| `olores2216305@ceu.edu.ph` | no moderator row — made the one real photo report |

If you sign in to `/console` with the school account the queue will look empty
and nothing is wrong. Moving it is a one-line update to the `moderators` table
(`user_id`, `barangay`).

### 2. Seeded demo data on production — what is there, and how to remove it

Production now carries **48 active pins** (22 around Marikina, 24 around
Taguig), seeded on 2026-08-14 so clustering and the standing line have
something to show. To add more:

```
npx tsx --env-file=.env.hosted scripts/seed.ts taguig 10
```

The count is a **total**, not per-hotspot. Omitting it writes 25 per hotspot,
which is what previously buried the map in ~300 pins.

**`--standing` fabricates a credibility signal, so it is opt-in.** It gives the
seed reporter four hidden `source = 'user'` reports, each confirmed inside the
hour, which is what makes `reporter_standing` return `reliable` for their pins.
Seeded pins are ordinary demo data; a seeded standing is different in kind,
because the badge means "other people checked this and it held up". Never run it
against a project with real users reading the map.

Those four rows are `source = 'user'` on purpose — standing deliberately ignores
seeded rows — so at the database level they are indistinguishable from genuine
reports. They are `status = 'hidden'`, so they never reach the map.

Every seeded account is under `@example.test`, and the script prints the one it
created. To remove all seeded demo data, reports and votes included:

```sql
-- deletes depth_reports and report_updates by cascade
delete from auth.users where email like 'seed-%@example.test';
```

That leaves the two real accounts and the one real photo report untouched.

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

**A real logo, and a loading screen.** The mark is a map pin holding a flooded
street: one waterline crossing three buildings of different heights, so the city
is the ruler and the pin says "here". Two variants — a boxed icon on pale blue
with the water already risen, and a dry pin for the splash, where the rising
water does the flooding. Drawn as SVG rather than generated, so it is exact at
every size. The favicon comes from `src/app/icon.svg` via the App Router
convention; `public/icon-192.png` and `icon-512.png` are rasterised from it. The
header word is plain "Antas"; the "antas ng tubig" gloss is gone.

It took four marks. A staff gauge, the letter A flooded to its crossbar, a
person standing in water, and finally this — built from a reference Elijah
generated, simplified hard on the way in. `foundations.md` §7b records why each
of the first three failed, and why a boat was rejected on principle.

Every one of those failures was found by rendering the mark at 16/24/32/64/128px
and looking, never by reasoning about it. The contact sheet is the only reliable
test of an icon, because the sizes that break it are the sizes nobody previews.

The splash rises water over the mark while the map loads, stepping through the
five depth colours in scale order. It is bound to real readiness — basemap
painted, first reports request settled — never to a timer, with a hard ceiling so
a failed request cannot strand anyone behind a logo. Once per session. This is
the only animation permitted past `foundations.md` §8; the terms it has to meet
are written down in §7b.

**All migrations are applied on hosted Supabase**, verified against the live
database: `search_places` answers as anon, `reports_near` still does, and
`my_reports` and `moderator_queue` now return `401 permission denied` to anon
instead of being reachable.

Getting there needed a repair rather than a push. **Hosted had every migration
applied in the database and none of them recorded** — `migration list` showed
sixteen locals against sixteen blanks. A plain `db push` would have tried to run
`0001` onward against a live database with real reports in it. The schema was
probed first (`reports_near` returning `photo_path`, both storage buckets present
with the right visibility), then `0001`–`0013` were marked applied with
`supabase migration repair`, and only `0014`–`0016` actually ran. The same drift
existed locally, for `0013` alone.

If a future push ever fails on something "already exists", that is this: repair
the history, never `db reset` a database with real rows in it.

**The map shows water, reports stain the ground, and an SOS no longer asks for
a depth.**

- **Voyager basemap by day.** Positron drew water as pale grey, so the Marikina
  River and the Pasig — the reason half this city floods — were invisible, and
  the map read as grey mush. Saturation pulled back a quarter so the warmer
  roads do not compete with the depth ramp.
- **Every report stains the map around it**, a blurred disc in its depth colour.
  Overlapping reports deepen the colour by themselves. Soft-edged on purpose: a
  hard boundary would claim a survey we have not done.
- **The Tulong form has no depth gauge.** Nobody in danger works a five-level
  slider, and the form should not spend their seconds asking. `sos_signals.depth`
  is now nullable; the scorer treats "never asked" as different from "claimed
  something shallow", so it withdraws the checks that exist only to contradict a
  claim rather than penalising silence.

**A locate button, a body gauge, and a centre action.** Three more taken from
mockups:

- **"Hanapin ang kinaroroonan ko"** — a crosshair on the map that flies to your
  own position and marks it. Search answers "take me to Malanday"; this answers
  "take me to *me*", which is the more common question. Asks for location only
  on tap, never on load.
- **The depth gauge is now a figure**, not a water column. The scale is body
  parts, so the control is a body. The list of five beside it is the real
  control; the figure is a picture of what the list says.
- **I-report is a raised centre action**, and **Tulong moved into the tab bar**,
  reversing an earlier call — once navigation left the header, the emergency
  control belonged where the thumb already is. `foundations.md` §7c has both.

Refused: **SOS as a long-press on I-report.** Hiding the emergency path inside a
gesture on the routine one cannot be discovered by someone who needs it now, and
under panic people do the routine thing. The three-second hold stays where it
belongs — confirming an SOS, not finding it.

**Search, your own reports, a preparedness guide, and a tab bar.** Five changes,
taken from Google Stitch mockups and filtered hard:

- **Search by place or barangay** (`search_places`, migration `0014`). The map
  opened over Metro Manila and the premise is "has *my* street flooded" — the
  answer used to begin with a pinch across the region.
- **`/ako` — Aking mga Report** (`my_reports`, migration `0015`). A report used
  to vanish into the map. The status shown is the database's real `status`
  column, not an invented review pipeline; depth reports are not moderated.
- **A failed map load now says so**, with a retry, instead of rendering empty.
- **`/gabay`** — preparedness, with the hotline section first. Antas cannot
  dispatch anyone; this turns that from a disclaimer into an action.
- **Bottom tab bar** — Mapa, Gabay, Mag-report, Ako. Tulong stays a standing
  chip in the header and is hidden along with the bar on `/sos`.

Refused from the same mockups, and why, in `docs/design/design.md` §12: authority
alert broadcasts and evacuation orders (no feed, and an evacuation order is an
authority instruction), live evacuation-centre capacity (being wrong sends a
family through floodwater to a full centre), "VERIFIED AUTHORITY" LGU badges
(impersonation), and a "Ligtas" label on ankle-deep water.

**Pins are reachable everywhere on the map.** The legend and the weather strip
were opaque panels that painted over the pins and swallowed taps aimed at them,
so a cluster landing in a corner could be neither seen nor opened. The whole
stacking order now lives in one commented block of `:root` tokens in
`globals.css`: rain 5, chrome 6, pins 8, sheets 14/16, header 20. Pins deliberately
paint *above* the chrome — an unreachable report is worse than an untidy legend —
and the chrome is `pointer-events: none` except the one weather-strip state that
is a real button.

### Later the same session — giving a report an afterlife

Three things, all answering the same complaint: a report was something you sent
into silence, and `/gabay` was something you read once.

**"Kumusta na?" on every report** (migration `0018`). Three buttons under the
depth meter — *Wala na* / *Ganoon pa rin* / *Mas mataas na* — and the most
**recent** answer leads, not the most numerous: ten people saying "ganoon pa
rin" an hour ago do not outrank one person saying "mas mataas na" two minutes
ago. Ties break toward the worse state.

This is the honest version of the comment thread that was asked for. Free text
under a report on a tool **nobody moderates** is a way for "wala na po" to
appear beneath water that is still chest-deep. Three states carry the same
information, need no moderation because there is no prose to moderate, and can
be counted.

**Remove your own report.** Two taps (`Tanggalin` → `Sigurado ka?`), and the row
is **hidden, never deleted** — it is evidence that somebody reported something.
The map filters on `status = 'active'`, so hiding is all it takes to leave.

**The go bag is a checklist now**, not a paragraph. Stored in `localStorage`, not
on an account: packing survives with no signal and no login, which is the
condition that page is most likely read in.

Two defects in `0018` were found only by running it against a real database, and
both are worth remembering:

- **Hiding your own report could never have worked.** PostgreSQL applies SELECT
  policies to the *new* row of an UPDATE, so the moment `status` became
  `hidden` the row fell outside `status = 'active'` and Postgres rejected the
  write. The fix is a second policy letting reporters read their own rows —
  which the hide policy silently depends on, so it is commented as such.
- **The privacy design and the write path were in conflict.** `report_updates`
  rows say who was standing where, so `reporter_id` had to stay unreadable; but
  a PostgREST upsert needs SELECT on the table to resolve its conflict target.
  Writes now go through a `security definer` function that takes **no**
  `reporter_id` at all, and the table grants nothing to `anon` or
  `authenticated` — there is no name to forge and no row to read.

### Reporter names: answered without names (migration `0019`)

You asked for the reporter's name on each report. It shipped as
**`reporter_standing`** instead — one quiet green line on the detail card,
*"Madalas tumutugma ang mga naunang report ng nag-report nito"*, shown only when
that author's earlier readings actually held up.

Three reasons, decided together:

- A name next to a location and a timestamp is a public record that a named
  person was standing somewhere during a flood, when their house may be empty.
- A public free-text name is the same impersonation hole as the "VERIFIED
  AUTHORITY" badge already refused — the first abuse is somebody calling
  themselves "Barangay Malanday DRRMO".
- A stranger's name is not evidence. It cannot answer *"can I trust this
  depth?"*, which is what the request was really for. A track record can.

There was also **no name data to show**. `display_name` is set by the
`handle_new_user` trigger from `raw_user_meta_data.display_name`, which nothing
writes — sign-in is email OTP with no name field — so every profile in both
databases reads the literal string `Anonymous`.

The signal returns `'reliable'` or `'none'` and deliberately **never a count**:
exact tallies would fingerprint each author, letting anyone group reports by
writer and work out which street somebody reports from every morning. There is
no "often wrong" counterpart, and there should not be one — a public negative
mark computed from a handful of taps, with no appeal, on a tool nobody
moderates, is a punishment mechanism.

If you ever do want names, the honest shape is opt-in first-name-only set on
`/ako`, defaulting to empty, with a blocklist on authority words — but it still
publishes name + place + time, which is why it is not the default.

---

## Needs you: your local emergency numbers

`src/lib/emergency/contacts.ts` ships with **only the national 911 hotline**.
`LOCAL_CONTACTS` is deliberately empty and the guide says so out loud rather
than implying the national line is the whole answer.

Copy the Marikina and Taguig DRRMO numbers from the LGU's own current
publication. I did not fill these in from memory on purpose: a wrong number
here is a person dialling into nothing during a flood.

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
