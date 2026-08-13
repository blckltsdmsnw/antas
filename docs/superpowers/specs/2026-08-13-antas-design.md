# Antas — Design Specification

**Date:** 2026-08-13
**Status:** Approved for planning
**Type:** Portfolio project (single developer)

---

## 1. Summary

Antas is a crowdsourced flood-depth reporting application for the Philippines, built around
two ideas that existing tools do not combine:

1. **Flood depth is recorded the way Filipinos actually describe it** — as a body-height scale
   (*hanggang bukong-bukong, tuhod, baywang, dibdib*), not in centimeters.
2. **A distress signal is a separate act from a depth report**, protected by a layered trust
   system that ranks signals for human triage but never refuses one.

The name *antas* means "level" or "degree," as in *antas ng tubig* — the water level.

**Pilot area:** Marikina City, seeded with demo data. Chosen for public association with
flooding and for genuine elevation variance, which makes the environmental plausibility
check demonstrable rather than theoretical.

**SDG alignment:** SDG 11 (Sustainable Cities and Communities) and SDG 13 (Climate Action).

---

## 2. Problem

Existing Philippine flood tools report river gauges, rainfall, and satellite data. None of
them capture **street-level lived depth**, and none maintain a **historical record** of which
streets flood and how badly. A person deciding whether to rent a house, take a route home, or
evacuate has no access to what actually happened on that street during past typhoons.

Separately, when someone is trapped in rising water, there is no low-friction way to signal
distress with enough context for a responder to triage it — and any system that offers one
immediately faces the false-alarm problem that plagues public emergency channels.

---

## 3. Scope

### In scope for this build

- Depth reporting with the body-height scale
- Public map with heatmap and historical street lookup
- SOS distress signals with live photo evidence
- Trust and plausibility scoring pipeline
- Barangay-scoped moderator console with audit trail
- Phone-verified accounts and reputation tracking

### Explicitly out of scope (documented future phases)

- Flood-aware routing that avoids flooded road segments
- SMS fallback for SOS when data is unavailable
- Household vulnerability registry (occupants, elderly, PWD, infants, pets)
- Evacuation center capacity layer
- Event replay / time-scrubbing of past typhoons

### Safety boundary

**This build does not dispatch real responders.** The moderator console is a simulated
barangay operations environment populated with seeded data. A persistent banner in the
console, a statement during onboarding, and a section in the README all state this plainly.

Rationale: if any person believes help is coming through this application and it is not, the
result is worse than having no application. The simulation boundary is a design requirement,
not a disclaimer.

---

## 4. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Application | Next.js (App Router) + TypeScript, installable PWA | One public URL for portfolio review; camera and GPS without app-store distribution friction |
| Database | PostgreSQL + PostGIS (Supabase) | Corroboration is a spatial radius-and-time query; PostGIS handles it natively |
| Auth | Supabase phone OTP | Phone-verified identity is load-bearing for anti-abuse, not incidental |
| Storage | Supabase Storage | SOS photo evidence |
| Map | MapLibre GL + OpenStreetMap tiles | No API key, no billing exposure, fully open |
| External data | Open-Meteo (rainfall + elevation) | Free, no key required; supplies the independent signal for plausibility checks. Exact endpoints to be verified during implementation |
| Hosting | Vercel | Free tier, public URL, deploy on push |

**Rejected:** mobile-native (React Native / Flutter). Native wins on background location,
persistent push, and SMS integration — all of which belong to deferred phases. For a portfolio
piece, a reviewer who cannot open the app in one click will not open it at all.

---

## 5. Core model

The central structural decision is that **a depth report and a distress signal are different
things and never share a table, a flow, or a permission set.**

The false-alarm problem is fundamentally a problem of *visible consequence attached to a cheap
action*. The design makes the cheap action consequence-free and the consequential action
expensive.

### DepthReport

Environmental data. Any signed-in user, low friction, no consequence beyond appearing on the
map. A user who drags the slider for amusement pollutes a dataset that corroboration and
plausibility scoring already discount — and receives no visible reaction.

Depth is stored as an **ordinal enum** — `ankle`, `knee`, `waist`, `chest`, `above_head` —
with an approximate centimeter range attached for analytics. Sortable and comparable, but the
interface never asks a frightened person to estimate centimeters. The scale is the product.

### SosSignal

A person stating *I need help*. Separate table, separate lifecycle, separate permissions,
separate audience. Deliberately expensive to create: hold-to-confirm, mandatory live photo,
one active signal per account, server-stamped location and time.

Status transitions: `pending → under_review → confirmed | dismissed`, then `resolved`.

### Why depth alone must not trigger rescue

A person can report "above the head" safely from a second-floor window. Another can be in
genuine danger in waist-deep water because of age, current, or downed power lines. **Water
height does not indicate whether a person needs rescuing.** A system that dispatches on depth
dispatches on the wrong signal.

---

## 6. Data model

| Table | Contents | Design decision |
|---|---|---|
| `profiles` | Verified phone, display name, home barangay, suspension state | Extends Supabase auth; phone verification is load-bearing for anti-abuse |
| `depth_reports` | PostGIS point, depth enum, optional photo, timestamp, GPS accuracy, corroboration count, status | The public data layer |
| `sos_signals` | PostGIS point, depth, required photo, note, status, trust score, assigned moderator | Separate lifecycle, permissions, and audience from depth reports |
| `signal_events` | Append-only log of every state change, with actor and timestamp | Accountability requires an audit trail; nothing is deleted, only transitioned |
| `reputation` | Per-user confirmed and dismissed counts, derived score | Feeds weighting in the scoring pipeline |
| `env_snapshots` | Rainfall and elevation captured at report time, cached per report | Weather must be snapshotted at submission; checking it days later reveals nothing |
| `moderators` | User, barangay scope, role | Moderators see only their own barangay |

### Indexing

Geography columns with GiST indexes. Corroboration resolves to a single indexed spatial
query — "independent reports within 300m in the last 3 hours" — rather than application-level
computation.

### Privacy and row-level security

Publicly pinning a distressed person's exact location, live photo, and phone number on an open
map endangers them; looting and harassment reliably follow disasters. Row-level security
therefore splits visibility:

- **Public map** — depth reports in full; SOS activity only as an aggregate count per barangay.
  No pins, no photos, no identities.
- **Moderator console** — full detail, scoped to the moderator's barangay, with every detail
  view written to the audit log.

---

## 7. Trust pipeline

### Governing principle: the system never refuses an SOS

If a fraud check can block submission, then the one time it is wrong, a person in danger is
told their report looks suspicious. Scoring therefore never decides **admission** — it decides
**order and prominence**. Every SOS reaches a human. The score answers only "which signal does
the moderator open first?"

The same reasoning extends to suspended accounts: **a suspended user can still send an SOS.**
Someone who filed a false report last month can be in real danger this month. Suspension lowers
priority band and forces review; it never silences.

### Stage 1 — Capture (expensive by design)

- Hold-to-confirm for 3 seconds
- Live in-app camera capture only; gallery upload disabled
- GPS captured with its accuracy radius; poor accuracy warns but still submits, flagged
- Server stamps the authoritative timestamp

### Stage 2 — Enrichment (server-side, asynchronous)

- Snapshot 24-hour rainfall at the point
- Snapshot ground elevation and elevation relative to surrounding terrain
- Run the PostGIS corroboration query for independent nearby reports

### Stage 3 — Scoring

| Component | Measures |
|---|---|
| Corroboration | Independent nearby reports within the radius and time window |
| Environmental plausibility | Rainfall against claimed depth; elevation against claimed depth |
| Reporter history | Past reports confirmed versus dismissed |
| Evidence quality | Live photo present, GPS accuracy, time coherence |
| Behavioral signals | Submission rate, impossible travel, one-active-signal rule |

### Stage 4 — Presentation to the moderator

The console never displays a bare number. It displays reason sentences:

> Corroborated by 4 nearby depth reports in the last hour. 82mm rainfall recorded in 24h.
> Reporter has 3 previously confirmed reports. Live photo attached, GPS accurate to 8m.

versus

> No other reports within 500m. No rainfall recorded in 24h. This location sits 40m above
> surrounding terrain. Account created 6 minutes ago.

A moderator can act on either in seconds, and can **overrule** both — a low score is an
argument, not a verdict. Opaque scores make humans either obey blindly or ignore entirely;
explanations make them think.

### Stage 5 — Feedback loop

The confirm/dismiss decision writes back to reputation. Dismissal requires a reason code —
`false_report`, `duplicate`, `resolved_already`, `insufficient_info` — because a dismissal for
duplication must not damage a reporter's history the way a dismissal for fabrication does.

Three confirmed false reports trigger suspension. This is disclosed during onboarding: visible
accountability deters more effectively than hidden accountability.

---

## 8. Surfaces

1. **Public map** — depth reports, heatmap, historical "has this street ever flooded?" lookup;
   aggregate SOS counts only.
2. **Report flow** — the body-height slider. Three taps, no typing required.
3. **SOS flow** — hold-to-confirm, live camera, optional note.
4. **Moderator console** — triage queue ordered by priority, detail view with reason sentences,
   confirm/dismiss with reason codes.
5. **Onboarding** — phone verification, accountability disclosure, simulation notice.

---

## 9. Module boundaries

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/scoring` | Pure functions: snapshot in, score plus reason strings out. Zero I/O | Nothing |
| `lib/geo` | PostGIS corroboration and spatial queries | Database |
| `lib/env` | External rainfall and elevation behind an interface | HTTP provider (fakeable) |
| `lib/audit` | Append-only event writes | Database |

`lib/scoring` having no I/O is the most important boundary in the project: the logic that
carries the design's reasoning becomes unit-testable with no database, no network, and no
mocking. `lib/env` sitting behind an interface means tests inject a fake and a provider outage
cannot cascade.

---

## 10. Failure behavior

The rule is **degrade toward caution**.

| Failure | Behavior |
|---|---|
| Weather/elevation provider unavailable | SOS still submits. Enrichment is asynchronous and optional; the score records "environmental data unavailable" and defaults to a **higher** priority band. When uncertain, get a human's attention |
| GPS unavailable or inaccurate | Fall back to manual map pin, flagged in evidence quality. Never a hard block |
| Photo upload fails mid-send | The SOS row is created **first**; the photo attaches afterward. A signal must survive a dying connection |
| Device offline — depth report | Queue locally in IndexedDB, sync on reconnect |
| Device offline — SOS | State plainly and prominently: "You are offline. This has NOT been sent." Never silently queue an SOS |
| Rate limit reached | Explain the one-active-signal rule and show the existing signal's status |

The offline-SOS rule follows the same principle as the simulation banner: the application never
lets a person believe they have been heard when they have not.

---

## 11. Testing

Target: 80% coverage, weighted toward the logic that carries risk.

- **Unit** — `lib/scoring`, table-driven. Required cases: corroborated-and-plausible,
  high-elevation-with-no-rainfall, brand-new-account, and missing-environmental-data.
- **Integration** — PostGIS corroboration against a real test database with seeded geometry.
  Explicit row-level-security tests: a non-moderator attempting to read SOS detail must fail,
  and a moderator attempting to read another barangay's signals must fail. Privacy claims
  without tests are only comments.
- **End-to-end (Playwright)** — report flow, SOS hold-to-confirm, moderator decision, and an
  assertion that the public map never exposes an SOS pin.
- **Seed data** — a scripted "typhoon scenario" serving as both demo material and test fixture.

---

## 12. Open items for implementation

- Verify Open-Meteo's current rainfall and elevation endpoint shapes and rate limits before
  wiring `lib/env`.
- Choose concrete corroboration parameters (radius and time window) against seeded Marikina
  geometry; the 300m / 3-hour values above are starting points to be tuned, not fixed
  requirements.
- Confirm Supabase phone OTP delivery works for Philippine mobile numbers on the free tier;
  if not, substitute email OTP and document the change to the identity-friction layer.
