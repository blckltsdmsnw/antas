# Antas, beyond flood — design

**Date:** 2026-08-27
**Status:** Plan A implemented and deployed 2026-08-28. Plan B (master admin,
board, roster, assignment, graph, SOS hazard) implemented 2026-08-28 to
2026-09-01 — see
`docs/superpowers/plans/2026-08-28-antas-multi-hazard-b-master-admin.md`.
Plan C approved and not yet built.
This is a **demonstration build** — see "Status: a demonstration build" below.
**Origin:** Mr. Peralta's review of the working system, plus the follow-up
discussion about the master admin.

---

## What this is

Antas becomes a general emergency reporting system in which flood is one hazard
among several, and gains a city-level operator — the master admin — who
confirms incidents, watches a trend, and puts named people on them.

Four of Mr. Peralta's five written recommendations were built on 2026-08-27
(`1f2cf4a`): the reports dashboard, priority ordering, the built-in camera, and
the contact number. This design covers the fifth — expanding beyond flood —
together with the master admin, the graph, and responder assignment, which came
out of the discussion afterwards.

## The constraints this design must not break

1. **The resident UI stays as approved.** Mr. Peralta approved it as usable by
   old and young alike. Reporting gains exactly one tap. No new kind of screen
   reaches a resident.
2. **Antas sends no rescue**, and still says so *to residents*. The public
   screens keep that statement, because the deployed app has real users and
   they must not be told help is coming.

   **Decided by the owner, 2026-08-28: the responder feature is built for
   demonstration.** Earlier drafts of this spec agonised over whether assigning
   a responder edges toward dispatch, and repeatedly narrowed the design to
   avoid the question. That is settled: build what Mr. Peralta asked for. The
   master admin assigns a responder, the responder sees the incident, and the
   flow is demonstrated end to end. Whether a barangay can really send a vehicle
   is an operational question about a future deployment, not a design question
   about this build. Do not re-litigate it in Plan B.
3. **Filipino and English, or the build fails.** Every new string exists in
   both. A missing translation is a type error, never a fallback.
4. **Security lives in Postgres**, not in application code. Every new
   permission is a database predicate.

## The name

**Antas is kept.** It means *level*, and under this design every hazard reports
a level of severity rather than only flood reporting a depth. The word stops
meaning "how deep is the water" and starts meaning "how bad is it, wherever it
is" — which is exactly the shared 1–3 rank the console orders on. The paper
carries one paragraph making that argument rather than leaving it implied.

---

## 1. Hazard and severity

Two enums:

```
hazard_type:  flood | fire | earthquake | accident | medical | other
triage_state: needs_checking | not_true | needs_attention | dispatched
```

`depth_reports` gains `hazard_type`, `severity smallint` constrained to 1–3, and
`triage_state`. It is then renamed to **`incidents`** — a table called
`depth_reports` holding fire reports is a lie that will cost someone an hour
later. The rename rewrites no rows.

`depth` **stays, becomes nullable, and is flood-only**, enforced by a check
constraint: a depth is permitted when and only when `hazard_type = 'flood'`.

### The body scale survives, for flood

Flood keeps all five body steps unchanged. They map onto the shared rank:

| Depth | Rank |
|---|---|
| ankle, knee | 1 |
| waist | 2 |
| chest, above_head | 3 |

Flood having five steps while other hazards have three is not an inconsistency.
It reflects something true: floodwater can be measured against a body, and a
fire cannot. The reporter never sees a rank — only words.

Existing rows backfill from `depth` by that table, so no report loses meaning.

### `report_priority()` moves from depth to severity

The priority bands built on 2026-08-27 — urgent, watch, routine — currently read
`depth >= 'chest'`, which is meaningless once most incidents have no depth. They
switch to `severity`:

| Band | Rule |
|---|---|
| urgent | severity 3, under six hours old |
| watch | severity 2 and fresh, or severity 3 and older |
| routine | everything else |

Six hours stays `MAX_CACHE_AGE_HOURS`, unchanged and for the same reason. For
flood the outcome is identical to today, because chest and above_head are
exactly the depths that map to severity 3 — so the existing behaviour is
preserved rather than re-tuned, and the bands simply start working for fire and
earthquake too.

The console's Reports tab keeps working as it does now. It gains a hazard label
on each row; its ordering rule is untouched.

### Severity vocabulary

Each hazard shows its own words for the same three ranks. **These are drafts
awaiting the owner's correction before implementation** — he is the Filipino
speaker, and these strings are read under pressure.

| Hazard | 1 | 2 | 3 |
|---|---|---|---|
| Sunog | Amoy usok | May apoy | Kumakalat na |
| Lindol | Naramdaman | May bitak o nasira | May gumuho |
| Aksidente | Walang sugatan | May sugatan | Naipit o malubha |
| Medikal | Maysakit | Hindi makagalaw | Walang malay |
| Iba pa | Nakakabahala | Kailangan ng atensyon | Delikado |

Each needs an English counterpart or the build fails.

## 2. The trust score runs for every hazard

Only two of its six evidence groups are flood-specific:

| Group | Applies to |
|---|---|
| Corroborating nearby reports | every hazard |
| Reporter's history | every hazard |
| Evidence quality, photo fingerprint | every hazard |
| Behavioural signals (account age) | every hazard |
| Recent rainfall | flood only |
| Elevation vs surroundings | flood only |

A fire scores on four groups instead of six. The scorer's existing principle
carries the rest: a gap in the system's knowledge is scored as **unknown**,
never as evidence against the person reporting, so nothing is invented and the
confidence band honestly reflects thinner evidence.

**Future hook, not this build:** PHIVOLCS publishes a recent-earthquake feed,
which would be real corroboration for earthquake reports the way rainfall is
for flood.

## 3. The report flow

`/report` becomes two steps on the same route.

**Step 1 — "Ano ang nangyayari?"** Large tappable choices, icon and word, no
scrolling: Baha · Sunog · Lindol · Aksidente · Medikal · Iba pa.

**Step 2 — the input that suits the hazard.** The page swaps in place: flood
gets the existing body slider unchanged; every other hazard gets three large
buttons carrying that hazard's words.

Photo and submit are unchanged. The page never grows longer.

### SOS

`/sos` gains an **optional** row of hazard chips above the hold control. The
three-second hold works whether or not one is chosen, and an unchosen hazard is
recorded as unspecified rather than guessed. `/sos` already stopped asking for
depth because seconds matter there; nothing in this design may add a required
step to it.

`sos_signals` therefore carries `hazard_type` **nullable** and no severity — an
SOS is an emergency by definition and continues to rank by trust score.

## 4. Roles and permissions

`moderators.role` gains a third value:

| Role | Sees |
|---|---|
| `moderator` | their own barangay's queues |
| `admin` | every barangay's queues |
| `master_admin` | everything, plus the board, the roster and the graph |

### Access by assignment, not by role

A new account sees the public map and nothing else — no console, no queue. When
the master admin assigns someone to an incident, **that incident alone** becomes
visible to them.

Responders therefore need no role at all. The permission is the assignment row:

> a user may read an incident if they moderate its barangay **or** they hold an
> open assignment on it

This cannot widen by accident. There is no barangay-wide grant to leak — only
the specific rows somebody was put on — and access ends when the assignment is
closed.

### Becoming assignable

`profiles` gains `responder_unit` (`bfp`, `barangay_rescue`, `medical`,
`police`, `other`) and `responder_barangay`. A signed-in user can fill these in
from a short screen; anyone who does not stays an ordinary user. The master
admin's roster is everyone with a unit set, so they assign named people with
units and numbers rather than email addresses.

### Assignments

One table, with an audit trail, covering both kinds of row:

```
assignments(
  id, incident_id?, sos_id?, responder_id, assigned_by, assigned_at, closed_at
)
check: exactly one of incident_id / sos_id is set
```

One query answers "what is assigned" across both.

## 5. The master admin board

`/console/board`, master admin only, **desktop**. Four columns:

**Kailangang suriin** → **Hindi totoo** | **Kailangan ng atensyon** → **May nakatalaga**

It shows reports and SOS signals together, through a security-definer function
that unions the two into one shape. The tables stay separate underneath: an SOS
carries anonymity, a trust score, an environmental snapshot and the
one-active-signal rule, none of which belong on an observation.

Within a column, SOS signals sort above reports — a person asking for help
outranks an observation — then by severity, then newest first.

What each move does:

- **→ Hindi totoo** asks for a reason first, from the existing dismissal
  vocabulary, then hides or dismisses the record. It must ask: for SOS this is
  the path that raises `false_report_count` and eventually suspends an account,
  and a drag gesture must never quietly cost somebody their access.
- **→ Kailangan ng atensyon** marks it confirmed. This is the moment it becomes
  real to other people: it appears in that barangay's moderator and admin
  queues, marked confirmed.
- **→ May nakatalaga** opens the responder picker and cannot be entered without
  choosing someone. The column asserts that a person is on it, so that must be
  true.

Dragging is the primary gesture, since this screen is desktop-only. Each card
also carries a keyboard-reachable action for the same moves — an accessibility
requirement, not a phone one.

## 6. The graph

Two panels at the top of the board, fed by one definer function returning
pre-bucketed counts so no raw incident rows travel to the browser to be counted:

- **Incidents per hour, last 48 hours, split by hazard** — reports and SOS
  together, because the question is about pressure, not source.
- **Barangay breakdown for the window** — a short ranked list, worst first.

**No charting library.** Two panels of this shape are roughly 150 lines of
hand-written SVG against 100KB+ of dependency, in an app that must open fast
offline on a cheap phone.

## 7. Hazard icons, and which visual variable means what

One `HazardIcon` component, hand-drawn SVG in the manner of `AntasMark`, used at
three sizes so a fire looks identical wherever it is met:

| Where | Size | Job |
|---|---|---|
| Report picker | large, above the word | recognise the choice before reading it |
| Map pin | small, inside the pin | know what it is without tapping |
| Board and queue cards | small badge beside the severity | scan a column at a glance |

Glyphs are conventional and dull on purpose — a flame, a wave, a cracked ground
line, a car, a medical cross, an exclamation for *other*. The audience this UI
was approved for recognises the obvious symbol, not the elegant one.

### The rule

- **Icon carries *what*** — flood, fire, earthquake
- **Colour carries *how bad*** — the existing depth palette, reused as a
  severity palette

Flood keeps its five-step ramp exactly. Other hazards take three steps from the
same palette: severity 1 the pale end, 3 the deep end. One palette, one meaning
throughout — darker is worse, whatever the hazard — and flood simply has finer
gradations because it can be measured more precisely.

Colouring by hazard instead was rejected: it would strip the map's colours of
their severity meaning, which is what makes the map readable at a glance during
a flood.

This also repairs an existing accessibility fault. Depth is currently
communicated by colour alone, so a colour-blind reader gets no signal at all.
Icon plus colour gives two independent channels.

## 8. The public map

Cluster behaviour generalises: a cluster takes its **highest severity** member,
exactly as it took its deepest. Flood keeps its five-step depth ramp; other
hazards get their own mark, distinguished by shape rather than by colour alone.

**Not every hazard is public.**

| Hazard | Public map |
|---|---|
| flood, fire, earthquake | yes — they describe a place |
| accident, medical | no — they describe a person |

An accident or a medical emergency pinned to an address exposes somebody at
their worst moment to their whole neighbourhood. Those incidents still reach the
board and the assigned responder in full; they are simply not drawn for the
public. `reports_near` filters accordingly.

## Status: a demonstration build

Recorded 2026-08-28. This system is coursework with a working deployment, not a
procured emergency service. The master admin board, the responder roster and the
assignment flow exist to demonstrate the workflow Mr. Peralta described. They
are not claimed to be an operational dispatch capability, and the paper should
describe them as demonstrated rather than in service.

The practical consequence for whoever builds Plan B: **implement the flow as
specified and do not narrow it out of caution about dispatch.** The honesty
constraint that governs the resident-facing screens is unchanged; it does not
extend to withholding features from the console.

## Out of scope, deliberately

- Responder logins with their own separate app — access is by assignment, and
  that is enough for this system.
- Automatic notification of responders. Nothing is sent; the console shows who
  to ring. This is a scope choice, not a safety hedge.
- Merging `incidents` and `sos_signals` into one table.
- PHIVOLCS earthquake corroboration.
- Renaming the product.

## Testing

- Integration tests for the new predicates, following
  `tests/integration/report-moderation.test.ts`: assignment grants access to one
  incident and no other; a closed assignment ends access; a moderator's barangay
  scope is unchanged; master admin sees across barangays; non-public hazards are
  absent from `reports_near` for anon.
- Unit tests for the depth→rank mapping and the per-hazard severity vocabulary,
  asserting both languages carry every key.
- Drive the running app, in both languages, for the report flow, the board, and
  the assigned-responder view. Green tests have missed real bugs on this project
  repeatedly; the rendered screen is the check that counts.

## Rollout

Production carries live data and a real third-party user. The migration is
additive and backfills rather than rewrites: no report loses its depth, and
existing moderators keep exactly the scope they have today. Apply the migration
before deploying the code, as on 2026-08-27 — the console calls functions that
must already exist.

## Owner action before implementation

The severity wording in section 1 needs the owner's correction. Everything else
is settled.
