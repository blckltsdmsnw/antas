# Antas

**Live demo → [antas-one.vercel.app](https://antas-one.vercel.app)**

Crowdsourced flood-depth reporting for Marikina City, Philippines. Antas records how deep
the water is the way Filipinos actually describe it — *hanggang bukong-bukong, tuhod,
baywang, dibdib* — instead of asking someone standing in floodwater to estimate
centimetres.

The name means "level", as in *antas ng tubig*.

---

## This does not dispatch emergency responders

Antas is a portfolio project running on **seeded demonstration data**. Nobody is monitoring
it. No report reaches any rescue service.

That boundary is a design requirement, not a disclaimer added at the end. If a person
believed help was coming through this application and it was not, the result would be worse
than the application not existing. Distress signalling and the responder console are
designed in the specification but deliberately unbuilt — see
[`docs/superpowers/specs/2026-08-13-antas-design.md`](docs/superpowers/specs/2026-08-13-antas-design.md).

---

## What it does

- **Public map** — flood reports plotted over Marikina, colour-coded by depth. No sign-in
  required; a visitor who has never registered can use it, which is the point.
- **Street history** — tap anywhere to see what was reported nearby and how deep it got.
  The question people actually ask is *"has this street flooded before?"*, not *"is it
  flooding right now?"*
- **Report submission** — a body-height slider, three taps, no typing. Signed-in users
  only, and the database enforces that you can only file in your own name.

## Screens

| Route | Who it's for |
|---|---|
| `/` | Anyone. The map and street history, no sign-in required |
| `/report` | Signed-in users. Log how deep the water is |
| `/gabay` | Anyone. Preparedness, and the numbers that reach a person |
| `/ako` | Signed-in users. Your own reports |
| `/sos` | Signed-in users in danger. Live photo, three-second hold |
| `/console` | Barangay moderators. Triage queue, live |

The console link appears in the header only for users who hold a moderator row.
That is discoverability, not access control — the queue is scoped by
`auth.uid()` inside the database, so typing the URL gets a non-moderator
nothing.

Grant the role with:

```bash
npm run make-moderator -- someone@example.com Malanday
```

Deliberately a script rather than a UI: a moderator is a vetted person at a
barangay desk, not somebody who signed up.

## Why the body-height scale

It is the whole idea. Existing tools report river gauges and rainfall; none capture
street-level lived depth, and none keep a historical record. A frightened person in rising
water will not estimate a number, but everyone can say *hanggang baywang*.

The scale is stored as an ordered enum with approximate centimetre ranges attached, so it
stays sortable and analysable without ever presenting a number to the user.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript — installable PWA |
| Database | PostgreSQL 17 + PostGIS, via Supabase |
| Auth | Email OTP with session refresh in `src/proxy.ts` |
| Map | MapLibre GL 6 with CARTO raster basemap |
| Tests | Vitest + Testing Library (unit, integration), Playwright (end-to-end) |
| Hosting | Vercel |

## Running locally

Requires Node 20+ and Docker (for the local Supabase stack).

```bash
npm install
npx supabase start          # starts Postgres, PostGIS, auth, mail catcher
npx supabase migration up
npm run seed                # ~100 demo reports around four Marikina hotspots
npm run dev
```

Open **http://127.0.0.1:3000** — not `localhost`. Browsers treat the two as different
origins, and the local Supabase `site_url` is `127.0.0.1`, so sign-in redirects fail on
`localhost`.

Sign-in emails are captured by Mailpit at http://127.0.0.1:54324 rather than being sent.

```bash
npm test                            # 171 unit tests
npx vitest run tests/integration    # 48 integration tests, needs the local stack
npm run test:e2e                    # 28 Playwright tests
```

`vitest run src/` covers only the unit tests. `tests/integration/` is a separate
directory, and running only `src/` once let a migration regression through.

## Security posture

Access control is enforced by the database, not by the application:

- **Depth reports are public to read, authenticated to write.** The insert policy is
  `with check (reporter_id = auth.uid())`, so a signed-in user cannot file a report in
  somebody else's name — the server action derives the reporter from the session and never
  from the request body.
- **No UPDATE or DELETE policy exists on reports**, and no grant either. Those operations
  are denied at both layers rather than relying on the absence of a policy alone.
- **Profiles are denied to anonymous callers at the grant layer as well as by RLS.** That
  table gains verified phone numbers in a later phase, so it has two independent barriers.
- **PostGIS is installed into the `extensions` schema, not `public`.** It ships a writable
  catalog table (`spatial_ref_sys`); in `public`, PostgREST would expose it to anonymous
  callers with DELETE and no row-level security, allowing anyone to drop the SRID
  definition every geography column depends on.

These are asserted by integration tests, not just documented — a privacy claim without a
test is a comment.

## Project layout

```
src/lib/depth/       the depth scale - pure, zero I/O
src/lib/reports/     validation and row building - pure, zero I/O
src/lib/supabase/    browser and server clients
src/app/actions/     server action for submitting a report
src/components/      map, street history, depth slider
src/proxy.ts         refreshes the Supabase session on every request
supabase/migrations/ schema, row-level security, spatial lookup
tests/integration/   row-level security and spatial queries against a real database
tests/e2e/           Playwright
```

The logic that carries risk — the depth scale, validation — lives in pure modules with no
I/O, so it is unit-testable without a database or a network.

## Design documents

| Document | Answers |
|---|---|
| [`docs/design/design.md`](docs/design/design.md) | How the system is built — architecture, data model, failure behaviour, decisions |
| [`docs/design/foundations.md`](docs/design/foundations.md) | How it looks — colour, type, components, the mark, the splash |
| [`docs/STATUS.md`](docs/STATUS.md) | What is done and what is still open |

## Status

Depth reporting, distress signalling with a trust and plausibility pipeline, and the
barangay moderator console are all built. Photos, screen-space clustering, live weather,
rain on the map and a clock-driven night basemap came after.

Still deliberately unbuilt: dispatch or anything implying rescue, push notification, and
offline caching. The known open items are in [`docs/STATUS.md`](docs/STATUS.md); the
original pre-implementation specification is in [`docs/superpowers/`](docs/superpowers/).
