# Antas — System Design

How the application is actually built, as of 2026-08-14.

This is the current-state record. Three other documents sit around it and are not
duplicated here:

| Document | Answers |
|---|---|
| [`foundations.md`](foundations.md) | How it looks — colour, type, components, the mark, the splash |
| [`../superpowers/specs/2026-08-13-antas-design.md`](../superpowers/specs/2026-08-13-antas-design.md) | What was intended before any code existed. Historical; superseded where the two disagree |
| [`../STATUS.md`](../STATUS.md) | What is done, what is open, what needs the owner's credentials |

---

## 1. The product, in one paragraph

Antas records how deep floodwater is on a given street, in the terms Filipinos
already use — *hanggang bukong-bukong, tuhod, baywang, dibdib, lampas sa ulo* —
and plots it on a public map with a history per location. The name means
"level", as in *antas ng tubig*.

## 2. The safety boundary

**Antas does not dispatch anyone.** Nobody monitors it and no report reaches a
rescue service.

This is a design constraint, not a disclaimer. If a person believed help was
coming and it was not, the application would be worse than useless — it would
have consumed the minutes in which they could have called someone real. Every
surface that could imply rescue is written to deny it, and the SOS flow states
the boundary before it accepts anything.

The consequence runs deep in the design: a depth report is **never** allowed to
escalate into a distress signal on its own. Water being chest-high on a street
is not evidence that a person is in danger on it. The two are separate records,
separate tables, and separate flows.

## 3. Why the scale is body parts

Existing tools report river gauges and rainfall. Neither answers "can I walk
down this street", and neither keeps a street-level history.

A frightened person standing in rising water will not estimate centimetres, but
anyone can say *hanggang baywang*. So the scale is an **ordered enum** of five
levels with approximate centimetre ranges attached in code — sortable and
analysable, without ever showing a number to the person reporting.

This is also why the mark is a map pin holding a flooded street rather than a
droplet: the product's claim is not that it is flooding, but *how deep, here*.

## 4. Shape of the system

```
browser ──► Next.js App Router (React 19, TypeScript)
              │
              ├─ server actions ──┐
              │                   ▼
              └─ browser client ─► Supabase (PostgreSQL 17 + PostGIS)
                                    │  row-level security is the access control
                                    └─ Storage: sos-photos     (private)
                                                report-photos  (public)

   src/proxy.ts refreshes the session on every request
```

External services, both keyless and both optional to the core:

- **CARTO raster basemap** — raster, not vector. The vector style loaded, applied
  its attribution, and then never requested a tile: vector tiles decode in a web
  worker, and everything else renders without one, so the failure presented as a
  blank map rather than an error.
- **Open-Meteo** — current conditions and recent rainfall. Never requested on
  page load, because a permission prompt earned by merely opening the map is the
  same mistake the camera used to make.

### Layers

| Layer | Location | Rule |
|---|---|---|
| Domain | `src/lib/**` | Pure. No I/O, no React, no Supabase |
| Data access | `src/lib/supabase/**` | The only place a client is constructed |
| Mutations | `src/app/actions/**` | Server actions. Identity comes from the session, never the request body |
| Surfaces | `src/app/**/page.tsx`, `src/components/**` | Render and gather input; hold no rules |

The logic that carries risk — the depth scale, report validation, GPS accuracy,
trust scoring — lives in pure modules with zero I/O, so it is testable without a
database or a network. That is why the unit suite runs in seconds and can be
trusted about *rules*, and why it cannot be trusted about *behaviour* (§10).

### Domain modules

| Module | Responsibility |
|---|---|
| `lib/depth/scale` | The five levels, their order, their centimetre ranges |
| `lib/depth/presentation` | How the scale is shown — hex for canvas, CSS vars for DOM |
| `lib/reports/validate`, `row` | What a submittable report is, and its database shape |
| `lib/reports/accuracy` | Whether a GPS fix is precise enough to place a pin |
| `lib/reports/freshness` | How age fades a pin |
| `lib/map/cluster` | Grouping pins in **screen space**, not metres |
| `lib/map/theme` | Light or dark basemap, from the Manila clock |
| `lib/sos/decision`, `status`, `row` | The distress record and its lifecycle |
| `lib/scoring/*` | Trust and plausibility scoring for a signal |
| `lib/env/*` | Weather, behind a provider seam with a fake for tests |
| `lib/time/relative` | Relative time, pinned to `Asia/Manila` |

## 5. Data model

Eighteen migrations, `supabase/migrations/0001` … `0018`. The significant ones:

| Migration | Adds |
|---|---|
| `0001`–`0004` | Depth reports, row-level security, the `reports_near` spatial lookup, trigger lockdown |
| `0005`–`0008` | SOS signals, their policies and functions, private photo storage |
| `0009`, `0011`, `0012` | Barangays, then Metro Manila and Taguig areas |
| `0010` | Moderation — the queue and moderator rows |
| `0013` | The public `report-photos` bucket, and `reports_near` widened to return the path |
| `0014`, `0015` | `search_places`, and `my_reports` for `/ako` |
| `0016` | Revokes EXECUTE from `public` where earlier migrations wrongly revoked it from `anon` |
| `0017` | Depth becomes optional on an SOS signal |
| `0018` | `report_updates` — "kumusta na?" — and hiding your own report |

`reports_near(lat, lon, radius_m)` is a PostGIS function rather than a filtered
select: proximity is a spatial question, and answering it in the client means
shipping every row in the country to a phone.

### Access control lives in the database

Not in the application. The claims below are asserted by integration tests, not
merely documented — a privacy claim without a test is a comment.

- **Depth reports** are public to read, authenticated to write, with
  `with check (reporter_id = auth.uid())`. A signed-in user cannot file in
  someone else's name, and the server action derives the reporter from the
  session rather than from the request body.
- **A reporter may change exactly one column of their own report, to exactly one
  value.** `0018` grants `update (status)` — column-scoped — and a policy whose
  `with check` pins the new value to `'hidden'`. Everything else on a report is
  still denied at both layers. A table-wide grant would let somebody file
  "ankle", watch it get scored, and rewrite the claim afterwards, which is
  precisely what the accuracy score exists to make costly. DELETE is granted
  nowhere.
- **Hiding a report needs a second, non-obvious policy.** PostgreSQL applies
  SELECT policies to the *new* row of an UPDATE, so with only
  `status = 'active'` on the table the write is rejected the instant the row
  stops being active. `0018` therefore also lets reporters read their own rows
  — correct on its own terms, and load-bearing for the hide.
- **`report_updates` grants nothing to `anon` or `authenticated`.** Not
  column-scoped: nothing. Its rows record who was standing where, and a
  PostgREST upsert needs SELECT on the table to resolve its conflict target, so
  permitting people to answer would have meant permitting them to read who else
  had. Both the read and the write go through `security definer` functions, and
  the write takes no `reporter_id` — it writes `auth.uid()`, so there is no name
  to forge rather than a forged name to reject.
- **Profiles are denied to anonymous callers at the grant layer as well as by
  RLS** — two independent barriers, because that table gains verified phone
  numbers in a later phase.
- **The moderator queue is scoped by `auth.uid()` inside the database.** The
  console link in the header is discoverability, not access control: typing the
  URL gets a non-moderator nothing.
- **PostGIS is installed into `extensions`, not `public`.** It ships a writable
  catalog table (`spatial_ref_sys`); in `public`, PostgREST would expose it to
  anonymous callers with DELETE and no row-level security, letting anyone drop
  the SRID definition every geography column depends on.
- **`revoke execute … from anon` does nothing** — it has to say `from public`.
  PostgreSQL grants EXECUTE on every new function to PUBLIC, and `anon` inherits
  it, so revoking a privilege that was never granted directly leaves the
  inherited one in place. `0007`, `0010` and `0015` all had this; `0016` fixes
  them. Nothing was exposed, because each function guards itself on `auth.uid()`
  — but the second barrier this document claims was, until then, absent.

### The two photo buckets are asymmetric on purpose

`report-photos` is public; `sos-photos` is private. A depth report is a picture
of a street. An SOS is a picture of a person in distress. The capture screen
states which one it is before offering the shutter.

## 6. Surfaces

| Route | Audience | Notes |
|---|---|---|
| `/` | Anyone, no sign-in | Map, search, street history, report detail, "kumusta na?" |
| `/gabay` | Anyone, no sign-in | Preparedness, a packable go bag, and the numbers that reach a person |
| `/report` | Signed in | Body-height slider, three taps, no typing |
| `/ako` | Signed in | Your own reports, whether each is still on the map, and removing one |
| `/sos` | Signed in, in danger | Live photo, three-second hold |
| `/console`, `/console/[id]` | Barangay moderators | Triage queue |
| `/login`, `/auth/confirm` | — | Email OTP |

Navigation is a **bottom tab bar** — Mapa, Gabay, a centre I-report button, Ako,
Tulong — because a phone held one-handed in the rain reaches the bottom of the
screen and not the top.

**Tulong sits in the bar but is not styled as one more destination.** It carries
its own red, distinct from both the resting tabs and the active one; an earlier
draft kept it as a header chip instead, which put the emergency route in the one
part of the screen a thumb cannot reach. It is a **labelled tap, never a
gesture** — an SOS hidden behind a long-press on the report button cannot be
found by someone who needs it now, and under panic people do the routine thing.

The bar stays visible on `/sos` too. Hiding it there left that page with no
visible way out once Tulong moved off the header, and stranding someone is worse
than distracting them — leaving costs nothing, because an SOS is only sent by
the live photo and the three-second hold.

`/gabay` is the only screen that is useful with no signal, no data and no
reports, which is the condition it is most likely to be read in. So it is a
server component with no fetch: no spinner, no failure state to design. The
hotline section is first, not last, because Antas cannot dispatch anyone — that
fact used to be only a disclaimer, and here it becomes an action. Its one piece
of state, the go bag checklist, lives in `localStorage` rather than on an
account, so it works signed-out and offline like the rest of the page.

Moderator rights are granted by script, not by a UI:

```bash
npm run make-moderator -- someone@example.com Malanday
```

A moderator is a vetted person at a barangay desk, not somebody who signed up.

## 7. The map

- **Clustering is in screen space, not metres.** Whether two pins collide is a
  question about pixels: reports 200m apart are inseparable at city zoom and
  distinct at street zoom. Recomputed on `moveend`, never on `move`.
- **A cluster takes its deepest member's depth, never an average.** Eleven
  ankle-deep reports must not hide one above-head report behind a reassuring
  pale blue.
- **Tapping a cluster fits its members' own bounds**, not a fixed zoom step.
  Where zooming cannot separate them — two reports metres apart stay inside one
  touch target even at maximum zoom — it opens the list for that spot instead,
  so the tap always does something.
- **Age is shown as opacity, and also stated in words** on the detail card, which
  is what someone who cannot perceive the fade relies on.
- **An ageing pin can be asked whether it is still true.** *Kumusta na?* under
  the depth meter: three buttons, one standing answer per person per report, and
  the most recent answer leads rather than the most numerous — ten people an
  hour ago describe an earlier moment. Ties break toward the worse state,
  because being wrong in the direction of caution is the survivable mistake.
  This is also the only thing a reporter gets back: filing used to be something
  you did into silence.
- **The basemap follows the Manila clock and nothing else.** See
  [`foundations.md`](foundations.md) §7a for why `prefers-color-scheme` is
  deliberately ignored.
- **Rain draws only when measured precipitation says it is raining on the user**,
  and sits below the pins: atmosphere under information.
- **Each report stains the map around it** — a blurred disc in its depth colour,
  under the pins and never clickable. Soft-edged deliberately: a hard polygon
  would claim a surveyed extent, and these are point observations from people
  standing in water. Where reports overlap the colour deepens on its own, which
  is honest — more people reporting a block is more evidence. Nothing is
  interpolated *between* reports, which is what a heatmap would do.
- **The stain is a DOM element, not a GeoJSON circle layer.** A `geojson` source
  is parsed in MapLibre's web worker, and this application's worker does not
  work — the same reason the basemap is raster. A circle layer here adds
  cleanly, reports the right feature count, answers `getLayer`, and then never
  draws a pixel: `isSourceLoaded` stays false forever and nothing errors. That
  was built, measured, and replaced.
- **The basemap is Voyager by day, not Positron.** Positron draws water as pale
  grey, which on a flood map loses the single most important piece of context
  there is — the Marikina River and the Pasig were invisible. Its saturation is
  pulled back a quarter so the roads stop competing with the depth ramp.
- **Map chrome never intercepts a tap.** The legend and the weather strip are
  pointer-transparent, and pins paint above them — an unreachable report is worse
  than an untidy legend.

## 8. SOS and the trust pipeline

Designed in the original spec (§7 there) and built in Phase 2. The governing
principle is that **the system never refuses an SOS**. Scoring orders a
moderator's queue; it never silently discards a signal, because the cost of
suppressing one real call for help is not comparable to the cost of showing a
moderator one false one.

**An SOS carries no depth.** The form used to require one on a five-level gauge
before it would send — a question for somebody on a kerb deciding whether a
street is passable, not for somebody in the water asking to be reached. Nobody
in danger works a gauge, and the form should not spend their seconds asking.

That also completes a separation this document already claimed: a depth report
says how deep the water is, an SOS says a person needs help, and the second does
not require the first. The depth column was the last place the two were still
entangled. It is nullable rather than dropped, because signals sent before the
change carry a depth their senders really did choose.

It is **not defaulted to the worst level**, which was the tempting shortcut.
Writing `above_head` onto every signal would put a claim about the water into a
record the console reads as the sender's own words. Where there is no claim the
console says *"Humihingi ng tulong"* — the thing that is actually true.

And **the scorer withdraws rather than penalises**: the rainfall and elevation
checks exist only to contradict a deep claim, so with nothing claimed they do
not apply. Treating silence as a weak claim would have sunk the people who asked
for help fastest to the bottom of a moderator's queue, over a field they were
deliberately never shown.

Capture is still deliberately expensive — a live photo through an in-page
viewfinder and a three-second hold. `/sos` keeps that viewfinder rather than handing off to
the phone's camera app, unlike `/report`: there it is an anti-abuse measure,
since `capture="environment"` is only a hint and many browsers will happily
offer the gallery instead.

## 9. Failure behaviour

- **A blank map must never be mistaken for a safe one.** The sharpest failure
  mode in the design, and now handled: a failed `reports_near` shows a stated
  error with a retry, never an empty map. The wording matters as much as the
  banner — *"hindi ibig sabihin nito na walang baha"* — because an outage is not
  an all-clear. Note that supabase-js **resolves with an `error` rather than
  rejecting**, so the failure arrives down the success path; reading only `data`
  is what turned every outage into a convincingly empty map.
- **`/ako` refuses the same trap.** "You have filed nothing" and "we could not
  check" are different sentences and only one of them is true.
- **A broken photo thumbnail degrades to an ordinary coloured pin**, not to a
  torn-image icon sitting on the map.
- **MapLibre errors are listened for.** Without a listener, style, tile and glyph
  failures vanish silently and the map renders blank, which is indistinguishable
  from "there is no data here".
- **The splash always leaves**, on a hard ceiling, whether or not the map ever
  becomes ready. A load screen that can strand someone is worse than none.
- **The weather strip disappears rather than showing an empty row** when the
  provider returns nothing.

## 10. Testing

```bash
npm test                            # unit + integration (251)
npx vitest run tests/integration    # integration only - needs local Supabase
npx playwright test                 # end-to-end (35)
npm run build
```

`vitest run src/` covers only unit tests. `tests/integration/` is a separate
directory, and running only `src/` once let a migration regression through.

**The load-bearing lesson of this project is that green tests are not evidence
the thing works.** Every bug that mattered was found by driving the running
application; the suite was green through all of them. The recorded cases:

- The night map never turned on. `prefers-color-scheme: no-preference` was
  removed from the specification and matches nothing, so the clock was never
  consulted. The pure function was correct *and tested*; the browser-facing
  adapter was not.
- The camera viewfinder was black and the shutter captured nothing, because the
  stream was attached before React had committed the element.
- Rain looked frozen at 1fps while the page held 60 — the pattern was aliasing
  against its own animation distance.
- Tapping a tight cluster did nothing: a fixed zoom step cannot separate members
  sitting inside one touch target.
- A guard *written to catch a theme bug* passed against the unfixed code, because
  `toHaveAttribute` retries until the **first** match and the page briefly
  stamped the wrong value on mount.
- And again, in the same shape, on search: choosing a result reopened the
  dropdown ~250ms later, after the debounce. `toHaveCount(0)` matched the closed
  frame and passed against the bug. Retrying assertions verify that a state was
  *reached*, never that it was **kept** — when the defect is a state that comes
  back, the test has to wait and look twice.

- And a third time, caught only *because* of that habit. A guard written to
  prove the go bag never flashes "0 sa 4" before its saved state loads passed
  with the guard deliberately removed: any in-page read happens after the effect
  has already run, so the flash is over before an assertion can see it. It was
  rewritten to fetch the page's own HTML and require that the count is absent
  from it — the one place the defect is actually visible. **A test written for a
  real bug can still be vacuous.**
- `0018` shipped two defects that no amount of unit testing would have reached,
  because both live in PostgreSQL's rules rather than in the code: SELECT
  policies are applied to the *new* row of an UPDATE (so hiding your own report
  could never succeed), and a plpgsql parameter named after a column shadows it
  in `on conflict` (which fails only on the *second* write, passing every
  first-write test). Both surfaced within minutes of running the migration
  against a real database.

So: drive it, screenshot it, count the network requests, read the database, and
run the migration. And prove every new regression guard fails against the
unfixed code before trusting it — a test that cannot go red is not a test.

## 11. Decisions worth not relitigating

| Decision | Why |
|---|---|
| Depth never escalates to rescue | Deep water on a street is not evidence a person is in danger on it |
| Scoring orders the queue, never filters it | Suppressing one real call is not comparable to showing one false one |
| Raster basemap, not vector | Vector tiles decode in a worker; the failure presented as a blank map |
| Screen-space clustering | Collision is a question about pixels, not metres |
| A cluster's depth is the maximum | An average lets shallow reports hide a deep one |
| Clock-only night map | A device left in dark mode says nothing about the light the user is in |
| Public report photos, private SOS photos | A street versus a person in distress |
| Moderator role by script | A moderator is vetted, not self-registered |
| Access control in the database | The application is not the only client the database will ever have |

## 12. Not built, deliberately

- Dispatch, responder routing, or anything that implies rescue
- Push notification of nearby flooding — it invites reliance the project cannot
  honour. Proximity scoping makes an alert *relevant*; it does not fix the real
  problem, which is that **silence is ambiguous**. On a crowdsourced map a flood
  with no reporter produces no alert, so the system is weakest exactly when it
  matters most, while feeling most trustworthy because you opted in. An honest
  version would subscribe to **areas**, fire only on deep reports, and be worded
  as *"may nag-report malapit sa'yo"* — a person's report, never the water
- Offline caching. Genuinely wanted, and honest only if stale data is labelled
  stale; see [`../STATUS.md`](../STATUS.md)

Refused from generated design mockups, for the same reason each time — they need
an authority relationship or live operational data the project does not have:

- **Official alert broadcasts** with river levels and forced-evacuation orders.
  An evacuation order is an instruction only an authority can issue
- **Evacuation centre capacity** ("60% Puno"). Being wrong sends a family through
  floodwater to a centre that is full. Centre *locations* are public and static
  and would be honest; capacity is not ours to know
- **"VERIFIED AUTHORITY" badges** on LGU posts — impersonating an institution we
  have no relationship with
- **"Buhong-buhong (Ligtas)"** — no flood depth is *safe*. Ankle-deep water hides
  open drains and moves fast
- **A satellite basemap with filled heat zones**, which claims continuous area
  knowledge from sparse point reports
- **Free-text comments and replies under a report.** Asked for directly, and
  built as *kumusta na?* instead. Nobody moderates this application, and prose
  under a safety reading is a way for "wala na po" to sit beneath water that is
  still chest-deep — the same class of harm as a "Ligtas" label. Three states
  carry what the comment carried, need no moderation because there is no prose
  to moderate, and can be counted, which a thread cannot
- **Reporter names on reports.** Also asked for, and deliberately still open
  rather than quietly shipped: `profiles` is locked at the grant layer because
  it gains verified phone numbers later, and attaching a name to a location and
  a timestamp is a different privacy decision from anything already made. It
  needs an explicit choice — anonymous by default with opt-in, or not at all —
  not a default chosen by whoever implements it
