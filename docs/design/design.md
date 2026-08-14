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
| `0019` | `reporter_standing` — a credibility signal that names nobody |
| `0020` | The `admin` role made real, and the barangay check reduced to one predicate |
| `0021` | Manila split from one city-wide bucket into its 16 districts |
| `0022` | `profiles.phone`, reachable only through `sos_detail` |
| `0023` | Suspension enforced, and `profiles` UPDATE narrowed to the columns a user owns |
| `0024` | Moderators can finally open the SOS photograph they are asked to judge |
| `0025` | Opening a signal moves it to `under_review`, so the sender learns somebody read it |
| `0026` | `sos_signals.photo_sha256`, so a photograph sent twice is visible to a moderator |

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
  RLS** — two independent barriers, because that table now holds phone numbers.
- **Suspension is enforced, and cannot be lifted by the suspended person
  (`0023`).** `decide_sos` had written `profiles.suspended_at` since `0010` and
  **nothing ever read it** — a moderator dismissing three fabricated signals
  believed they had stopped somebody and had set a timestamp. The UPDATE grant
  also covered the whole table, so the suspended account could clear its own
  flag in one request. The grant is now scoped to `display_name`, `barangay`
  and `phone` — the same lesson `0018` learned for `depth_reports.status`:
  "may edit their own row" is not "may edit every column of their own row".
  It blocks **depth reports only**; see §8 for why it deliberately does not
  block an SOS.
- **An SOS requires no account, via an anonymous session rather than an
  unauthenticated write.** That distinction is the design: `reporter_id` stays
  non-null, so `profiles`, `reputation`, the one-active-signal index, every RLS
  policy and the audit trail keep working untouched. Removing the sign-in
  requirement any other way would have meant loosening all of them. The trust
  score already docks brand-new accounts, so such a signal is **ranked lower for
  a moderator, never refused** — ranking is the honest answer to knowing less
  about a signal; refusing is not. Requires anonymous sign-ins enabled on the
  project; where they are not, the page degrades to asking for a sign-in exactly
  as it used to.
- **A reporter's phone number (`0022`) leaves the database through exactly one
  door.** `profiles` stays scoped to `id = auth.uid()`, so no user can read
  another's; the only other path is `sos_detail`, which already refuses anyone
  who may not see that signal — so the number reaches whoever may act on an SOS
  and nobody else. It never touches the map, the depth reports or
  `report_updates`. Stored E.164 (`+639171234567`) and constrained to it in the
  column, because a number kept in a shape that will not dial is discovered by
  somebody failing to reach a person in a flood. It is **optional** — a required
  phone number on a flood map is a reason not to report at all — and **not
  verified**, which the console says out loud rather than implying a check that
  never happened; real verification needs an SMS provider this project has no
  budget for.
- **The moderator queue is scoped by `auth.uid()` inside the database.** The
  console link in the header is discoverability, not access control: typing the
  URL gets a non-moderator nothing.
- **Routing granularity is uneven, and that is the honest choice.** A signal's
  barangay is assigned by a trigger taking the nearest centroid in `barangays`.
  Marikina has its 16, Taguig its 26, Manila its 16 **districts** (`0021`) —
  and every other NCR city is a single placeholder at the city centre. Manila
  is districts rather than its 896 barangays because those are a few blocks
  across: invented centroids at that spacing would carry more error than the
  distance between neighbours, so the result would look precise and be wrong.
  A real deployment needs official boundary polygons and `st_contains`; until
  then the table stores "the smallest area we can honestly route to", which is
  not always a barangay despite the name.
- **Scope lives in one predicate, `moderates(barangay)` (`0020`).** It was four
  copies of the same `exists` clause — once in `moderator_queue`, twice in
  `sos_detail`, once in `decide_sos` — and four copies of a security rule is
  three chances to update it incompletely. An `admin` passes it for every
  barangay; a `moderator` for exactly one.
- **Scope is never self-service, and never geographic.** `admin` is granted by
  the same script as `moderator`, by whoever holds the service key, and cannot
  be changed from inside the application. If it could, one account would reach
  every SOS in the country — each carrying a distressed person's exact location
  and photograph — by typing a different barangay. Physical presence does not
  grant it either: browser geolocation is trivially forged, so "I am standing
  here" can never be an access claim. What makes the wider scope acceptable is
  that `sos_detail` still writes a `viewed` event for every look, which is why
  it is `volatile` rather than the cheaper `stable`.
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

### Storage has policies too, and they were the blind spot

`sos-photos` is private, and `0008` gave it one SELECT policy: your own folder.
The console was then built to fetch through a signed URL — and the policy
letting a **moderator** read somebody else's photo was never written, so from
Phase 2B until `0024` **no moderator ever saw an SOS photograph**.

Two things let it hide. Storage reports a policy denial as `Object not found`,
which reads like a missing file; and the console rendered `{photoUrl && <img>}`,
so a denial produced a card with no image — indistinguishable from a signal that
had no photo, except an SOS *cannot* have no photo, because the live capture is
mandatory. Both are fixed: the console now says so out loud.

The policy cannot ask `sos_signals` directly. Inline, its subquery runs as the
moderator, and RLS confines them to their own signals, so it would deny every
photo including the ones they are entitled to. `can_view_sos_photo(path)` is
`security definer` for that reason, and still narrows through `moderates()`.

The wider lesson: **nothing in the test suite touched storage**, so a bucket no
moderator could read passed every check for two phases. `tests/integration/
sos-photo-access.test.ts` closes that, and it is as much the point as the policy.

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
| `/sos` | **Anyone**, in danger | Live photo, three-second hold. No account needed |
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
npm run make-moderator -- someone@example.com Malanday --admin
```

A moderator is a vetted person at a barangay desk, not somebody who signed up.

`--admin` grants the wider role: every barangay's queue rather than one. It is
the same act of vetting one level up, and it stays in a script for the reason
the script exists at all. A barangay is still required — an admin is a person at
a desk who can also cover others, not a floating permission, and it is where
they land when the wider role is withdrawn. Re-running without the flag narrows
them again.

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
- **The chrome paints above the pins, and takes no taps.** This was the other
  way round, argued as "a pin hidden under an opaque panel is a report nobody
  can reach; a legend with a pin drawn across it is merely untidy". Half of that
  was wrong — the chrome is `pointer-events: none`, so a pin beneath it is
  occluded, not unreachable — and the untidiness was not minor: there are
  hundreds of pins to one legend, so every pin drifting into that corner damaged
  the key, while the pin itself is one pan away from view.
- **Age is shown as opacity, and also stated in words** on the detail card, which
  is what someone who cannot perceive the fade relies on.
- **An ageing pin can be asked whether it is still true.** *Kumusta na?* under
  the depth meter: three buttons, one standing answer per person per report, and
  the most recent answer leads rather than the most numerous — ten people an
  hour ago describe an earlier moment. Ties break toward the worse state,
  because being wrong in the direction of caution is the survivable mistake.
  This is also the only thing a reporter gets back: filing used to be something
  you did into silence.
- **A reporter's standing is shown; their identity is not.** `reporter_standing`
  (`0019`) reads whether that author's *earlier* reports held up — measured only
  by answers arriving within the hour after each one, because floodwater recedes
  on its own and "wala na" four hours later describes the weather rather than a
  bad report. It returns `'reliable'` or `'none'` and **never a count**: exact
  tallies would fingerprint each author, letting anyone group reports by writer
  and work out which street somebody reports from every morning. There is no
  negative value and will not be one — a public "often wrong" mark, computed
  from a handful of taps with no appeal on an unmoderated tool, is a punishment
  mechanism. Absence means "not established", which is also every new reporter.
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

**The same photograph, sent twice, is now visible (`0026`).** Every SOS photo is
hashed during enrichment and compared against earlier signals; a repeat costs
30 points and states itself in words. A live capture of moving water is never
byte-identical twice, so a match is not weak evidence to weigh — it says the
picture is not of what is happening now.

Two things it deliberately does **not** do, both worth knowing before trusting
it. It catches identical bytes only: re-encoding, resizing or cropping changes
every byte, and catching those needs a perceptual hash, which needs decoding the
image, which needs a dependency this project does not carry. And it does **not**
read camera metadata to spot screenshots — the SOS photo is produced by
`canvas.toBlob`, which writes no EXIF at all, so that check would flag every
honest signal. A check that fires on everybody is worse than no check, because
a moderator learns to ignore it.

An unknown result is silence, not suspicion: a photo that could not be fetched
scores exactly like a unique one, which is the same rule the rainfall and
elevation checks follow.

**The sender is told what happened, and only what happened (`0025`).** Sending
used to end in silence — the same gap *kumusta na* closed on depth reports, and
worse here, because the person waiting may be in the water. Opening a signal now
moves it `pending → under_review`, a transition the enum has modelled since
`0005` and which **nothing ever performed**; the sender watches their own row
over realtime, which `0010` already published.

The wording is the dangerous part, so it lives in `lib/sos/progress.ts` and is
tested there against the sentences it must never produce. Every line reports a
completed act: *"Binuksan na ito ng barangay"* says a person read something.
Even `confirmed` explicitly disowns the reading it invites — a moderator judging
a signal credible is a statement about the signal, never a dispatch. This is the
honest form of the "a rescuer will arrive in 10-20 minutes" notification that
was refused: it reports, it does not promise.

The sender learns *that* somebody looked, never *who*. `signal_events` stays
unreadable to them, which is why the status has to carry the news at all.

**A suspended account can still send an SOS**, and that follows from the same
principle rather than being an oversight. Suspension (`0023`) blocks depth
reports, because filing one is a contribution to a shared map and somebody who
fabricated three emergencies has forfeited that. It does not block the
emergency path: a person who fabricated three floods last year can still be in
one today, and refusing there would be the product deciding, from its own
moderation history, that somebody's emergency does not count. The doubt is
expressed the way every other doubt is — `reputation.false_report_count` feeds
the score, so the signal is ranked lower and still arrives. Ranking is what you
do when you know less; refusing is what you do when you have decided.

**That feedback loop was not connected until `0023`.** `decide_sos` had
maintained `reputation` since `0010`, and `submit-sos.ts` passed literal zeros
for both counts — so every moderator decision fed a wire with nothing on the
other end, and a reporter with twenty confirmed floods scored exactly like an
account created a minute earlier.

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
npm test                            # unit + integration (362)
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
- ~~Offline caching~~ — **built**, on exactly the terms this line demanded. The
  shell and `/gabay` are cached; the map keeps its last snapshot and always
  states its age rather than merely saying "offline"; and past **six hours** it
  refuses to draw anything, because a pin that old describes a street which has
  almost certainly changed. The rule is a tested pure function
  (`lib/offline/staleness.ts`), not a condition buried in a component, and it
  treats undated data as too old — a cache cannot vouch for what it cannot date

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
- **Reporter names on reports.** Asked for directly, and answered with
  `reporter_standing` (§7) instead. Three reasons, and the order matters. A name
  beside a location and a timestamp turns every report into a public record that
  a named person was standing somewhere during a disaster, when their house may
  be empty. A free-text `display_name` shown publicly is the *same* impersonation
  hole as the "VERIFIED AUTHORITY" badge two entries above — the first abuse is
  somebody naming themselves "Barangay Malanday DRRMO". And a stranger's name is
  not evidence anyway: it cannot answer "can I trust this depth", which is the
  question the request was really making.

  Worth recording that there was never any name data to show. `display_name` is
  `not null` and set by the `handle_new_user` trigger from
  `raw_user_meta_data.display_name`, which nothing writes — sign-in is email OTP
  with no name field — so every profile in both databases reads the literal
  string `Anonymous`. Shipping names was never "expose a column"; it was build a
  name-collection flow, then open a public read path through the one table
  deliberately locked because it gains verified phone numbers later
