# Multi-hazard Antas, Plan B — master admin, board, roster, assignment, graph

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antas gains a city-level operator — the master admin — who works a
four-column board of reports and SOS signals together, watches a 48-hour
trend, and puts named responders on incidents; a responder sees exactly the
incidents they are assigned to and nothing else; `/sos` offers an optional
hazard.

**Architecture:** Three additive migrations. `0032` adds the `master_admin`
role, a `triage_state` on `depth_reports`, responder fields on `profiles`, an
`assignments` table, and every predicate — assignment-based read access is a
Postgres function used by RLS policies and definer functions alike. `0033`
adds two master-admin-only definer functions: `board_rows()` unions both
tables into one shape, `board_graph()` returns pre-bucketed counts. `0034`
carries the hazard into the SOS queue, detail, scorer and corroboration. The
board is a desktop page under `/console/board` with native drag-and-drop and
keyboard buttons for the same moves; the graph is hand-written SVG. The
responder's view is a third tab on the existing `/console`.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/PostgreSQL with
PostGIS, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-antas-multi-hazard-design.md`
— read it first. Its "Status: a demonstration build" section is binding:
**implement the flow as specified and do not narrow it out of caution about
dispatch.** Constraint 2 says the same and says not to re-litigate it.

## Decisions taken while planning

These are the places where the spec left a choice, or where following it
literally would have repeated a mistake this project has a memory file about.

- **`dispatched` is not a stored state.** The spec lists
  `triage_state: needs_checking | not_true | needs_attention | dispatched`.
  "Has a responder on it" is already recorded, exactly once, by an open row in
  `assignments`. Storing it a second time in `triage_state` is a second source
  of truth that drifts the first time an assignment is closed and the column
  is not. So the enum has three values, and `board_rows()` derives the fourth
  column from the assignment. The board still shows four columns.
- **`triage_state` lives on `depth_reports` only.** SOS signals already have
  `sos_status`, and its values map onto the columns without a second column:
  pending/under_review → *Kailangang suriin*, confirmed → *Kailangan ng
  atensyon*, dismissed → *Hindi totoo*. `resolved` is not on the board.
- **The board's *Hindi totoo* column shows the last 48 hours only.** The
  other three hold open work and show everything, capped at 200 rows per
  column (`reports_near` and the queues have no LIMIT and PostgREST truncates
  at 1000 silently — this plan does not add another one of those).
- **Assigning a report confirms it; assigning an SOS does not.** Moving a
  report straight from *Kailangang suriin* to *May nakatalaga* sets
  `triage_state = 'needs_attention'` on the way, because the column asserts a
  person is on it and an unconfirmed-but-assigned report is a contradiction.
  Confirming an SOS raises the reporter's `confirmed_count` in `reputation`,
  which is a judgement about a person, so it stays an explicit act
  (`decide_sos`) rather than a side effect of assignment.
- **Dismissing or hiding closes every open assignment on that record.** Access
  by assignment must end when the incident is declared not true; otherwise a
  responder keeps reading a record the master admin has rejected.
- **The responder's view is a third tab on `/console`, not a new route.** A
  new account still sees the public map and nothing else: `console_access()`
  tells the page whether the caller moderates anything or holds an open
  assignment, and the page shows only the tabs that apply. Someone with
  neither is told so in one sentence.
- **Phone numbers reach a responder the same way they reach a moderator** —
  one record at a time, through a definer function that writes an audit row
  (`assignment_detail`). A list that sprays numbers is the thing
  `report_queue` deliberately refuses to be.
- **The responder's name is `profiles.display_name`.** It exists, is
  writable by its owner since `0023`, and reads `'Anonymous'` on every row
  because nothing has ever written it. The responder screen writes it. No new
  column.
- **Non-flood SOS signals skip the rainfall and elevation groups.** The spec
  §2 rule. An *unspecified* hazard keeps them, because those two groups can
  only ever *support* a signal with no claimed depth (`isDeepClaim(null)` is
  false), and withdrawing support from the people who had no seconds to
  choose a chip would penalise the product's own design.
- **`corroborating_reports` gains a hazard.** Like corroborates like: a fire
  SOS is corroborated by fire reports. Unspecified → any active report.
- **Chart colour carries hazard, on the chart only.** Everywhere else in
  Antas colour means severity and the icon means hazard. A stacked bar cannot
  carry an icon per segment, so the trend panel uses a six-hue categorical
  palette validated with the dataviz skill's checker on the app's white
  surface (`#0284c7 #ea580c #7c3aed #ca8a04 #db2777 #16a34a`, in `HAZARDS`
  order, all six checks pass). It is used nowhere but the two graph panels,
  and the legend names every hue.
- **The paper is not touched by this plan.** The spec says the paper should
  describe these features as demonstrated. `docs/paper/` has uncommitted work
  from another session; that paragraph is the owner's, after this ships.

## Global Constraints

- **Both languages or the build fails.** Every new string is in
  `src/lib/i18n/strings/board.ts` (new) or an existing dictionary, in both
  halves. No `Partial`, no fallback. `npx tsc --noEmit` is the proof.
- **The resident UI stays as approved.** `/sos` gains one optional row of
  chips and nothing required. The three-second hold works with no chip
  chosen. `/report` is untouched. `/ako` gains one optional section.
- **Security is a Postgres predicate**, never application code. Every new
  permission is a function or a policy in `0032`. Server actions are thin
  wrappers that map errors to codes.
- **Grants, every time, in full.** After every `create function`:
  `revoke execute ... from public, anon;` then `grant execute ... to
  authenticated;` (plus `service_role` where the server calls it). `from
  public` alone leaves Supabase's direct grant to anon standing — `0030`
  documents the four functions that got this wrong last time. Every function
  that is dropped and recreated restates its grants.
- **Functions reached from an RLS policy or a storage policy must be granted
  to `authenticated`** — a policy runs as the querying role, not as the
  function owner (`0031`'s lesson). `holds_assignment` is one of these.
- **Return-shape changes mean `drop function` then `create function`**;
  `create or replace` cannot change a `returns table` (`0013`, `0028`).
- **Migrate before deploying.** Apply `0032`–`0034` to a target before code
  that calls the new functions reaches it.
- **Hazard order is fixed everywhere:** `flood, fire, earthquake, accident,
  medical, other`. Board column order is fixed: `needs_checking, not_true,
  needs_attention, assigned`.
- **No charting library.** The graph is SVG written by hand.
- **The board is desktop-only** (`min-width: 900px` layout; below that the
  page says so and links back to `/console`). Every drag move has a
  keyboard-reachable button that does the same thing.
- **Realtime on the board** subscribes to `sos_signals` and `depth_reports`
  as `/console` does. `assignments` has no policy for `authenticated`, so its
  events are not delivered; the board reloads after its own actions instead.
- **Service worker cache name bumps to `antas-v4`** in the last task.
- **Nothing here re-opens the dispatch question.** The resident-facing
  "Antas sends no rescue" strings are untouched.

---

## File Structure

**Create:**
- `supabase/migrations/0032_master_admin_and_assignments.sql`
- `supabase/migrations/0033_board.sql`
- `supabase/migrations/0034_sos_hazard.sql`
- `tests/integration/master-admin.test.ts`
- `tests/integration/assignments.test.ts`
- `tests/integration/board.test.ts`
- `tests/integration/sos-hazard.test.ts`
- `src/lib/i18n/strings/board.ts` — every board, roster, assignment and
  responder-profile string
- `src/lib/board/types.ts`, `types.test.ts` — columns, rows, allowed moves
- `src/lib/board/graph.ts`, `graph.test.ts` — bucket filling and stacking,
  pure
- `src/lib/responder/types.ts`, `types.test.ts` — units
- `src/app/actions/assign.ts` — `assignResponder`, `closeAssignment`
- `src/app/console/board/page.tsx`, `loading.tsx`
- `src/components/board/BoardCard.tsx`
- `src/components/board/MovePanel.tsx`
- `src/components/board/TrendChart.tsx`
- `src/components/board/BarangayRanking.tsx`
- `src/components/AssignmentCard.tsx` — the responder's card on `/console`
- `src/components/ResponderField.tsx` — the `/ako` section
- `src/components/HazardChips.tsx`, `HazardChips.test.tsx` — the `/sos` row
- `tests/e2e/board.spec.ts`

**Modify:**
- `src/lib/i18n/strings/index.ts` — register `board`
- `src/lib/i18n/strings/sos.ts` — the chip prompt
- `src/app/actions/decide-report.ts` — a third decision, `confirm`
- `src/app/console/page.tsx` — access-aware tabs, the assigned tab, the
  board link
- `src/components/ModeratorLink.tsx` — visible to responders too
- `src/components/ReportCard.tsx` — `triage_state` on the row, a confirmed
  badge
- `src/components/SignalCard.tsx`, `src/app/console/[id]/page.tsx` — the
  hazard on an SOS
- `src/app/ako/page.tsx` — the responder section
- `src/app/sos/page.tsx`, `src/lib/sos/row.ts`, `src/app/actions/submit-sos.ts`
  — the chip
- `src/lib/scoring/types.ts`, `score.ts`, `score.test.ts` — hazard-aware
- `scripts/make-moderator.ts` — `--master`
- `src/app/globals.css` — append board, chips, responder rules
- `public/sw.js` — cache name
- `docs/STATUS.md` — a section

## Before Task 1

Local Supabase must be running with every migration through `0031` applied:

```
npx supabase status
```

If it is not running: `npx supabase start`. **Never `supabase db reset
--local` on this project** — it was done twice by an agent on 2026-08-27 and
wiped the owner's local data without being asked. Apply new migrations with
`npx supabase migration up --local`. Integration tests read `.env.local`
through `vitest.config.ts`'s `loadEnv`.

---
### Task 1: Migration 0032 — roles, triage, responders, assignments, predicates

**Files:**
- Create: `supabase/migrations/0032_master_admin_and_assignments.sql`
- Test: `tests/integration/master-admin.test.ts`,
  `tests/integration/assignments.test.ts`

**Interfaces:**
- Consumes: `moderates(text)` (0020), `report_events`, `signal_events`,
  `decide_sos(uuid, text, dismiss_reason)` (0020),
  `decide_report(uuid, text, report_decision_reason)` (0027),
  `report_queue()` (0028), `can_view_sos_photo(text)` (0024), `barangays`
- Produces: role `master_admin`; `is_master_admin() returns boolean`;
  enum `triage_state`; column `depth_reports.triage_state`; enum
  `responder_unit`; columns `profiles.responder_unit`,
  `profiles.responder_barangay`; table `assignments`;
  `holds_assignment(uuid, uuid) returns boolean`;
  `assign_responder(uuid, uuid, uuid) returns uuid`;
  `close_assignment(uuid) returns void`; `my_assignments()`;
  `assignment_detail(uuid)`; `responder_roster()`; `console_access()`;
  `decide_report` accepting `'confirm'`; `report_queue()` with
  `triage_state`

- [ ] **Step 1: Confirm the live definitions you are replacing**

Run: `grep -ln "function decide_report\|function report_queue\|function decide_sos\|function can_view_sos_photo\|function moderates" supabase/migrations/*.sql`

Expected: `report_queue` last defined in `0028`, `decide_report` in `0027`,
`decide_sos` and `moderates` in `0020`, `can_view_sos_photo` in `0024`. The
bodies below are copied from those files with the marked changes only. If a
later migration has touched any of them, copy from that one instead.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/0032_master_admin_and_assignments.sql
--
-- A city-level operator, and access by assignment.
--
-- Mr. Peralta's review asked for a master admin who confirms incidents and
-- puts named people on them. This migration is the data half: a third role,
-- a triage state for reports, a way for a signed-in person to say they are a
-- responder, an assignments table with an audit trail, and one predicate -
-- holds_assignment() - that every read path shares.
--
-- Additive. No existing row changes meaning; no existing moderator's scope
-- changes. Everything a resident can do is exactly what they could do
-- yesterday.

-- 1. The third role ------------------------------------------------------------
--
-- 0005's inline check named itself moderators_role_check. Widened rather than
-- replaced by a new column: an admin is still an admin, a moderator is still
-- confined to one barangay, and master_admin is admin plus the board.
alter table moderators drop constraint moderators_role_check;
alter table moderators add constraint moderators_role_check
  check (role in ('moderator', 'admin', 'master_admin'));

-- Same shape as 0020. The one predicate every queue, detail and decision
-- reads; master_admin sees what admin sees.
create or replace function moderates(p_barangay text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from moderators m
     where m.user_id = auth.uid()
       and (m.role in ('admin', 'master_admin') or m.barangay = p_barangay)
  );
$fn$;

-- create or replace keeps 0031's grant to authenticated; restated so the
-- grant travels with the definition.
revoke execute on function moderates(text) from public, anon;
grant  execute on function moderates(text) to authenticated;

-- Answers only about the caller. Granted to authenticated for the same
-- reason moderates() is: the console asks it, and it can disclose nothing
-- about anybody else.
create function is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from moderators m
     where m.user_id = auth.uid() and m.role = 'master_admin'
  );
$fn$;

revoke execute on function is_master_admin() from public, anon;
grant  execute on function is_master_admin() to authenticated;

-- 2. Triage state on reports ---------------------------------------------------
--
-- Deferred from 0028 on purpose: a column nothing reads is the inert
-- mechanism this project keeps finding. board_rows() in 0033 reads it.
--
-- THREE values, not the four the spec lists. "Has a responder on it" is
-- already recorded once, by an open row in assignments; storing it here too
-- would be a second source of truth that drifts the first time an assignment
-- is closed and this column is not. The board derives its fourth column.
create type triage_state as enum ('needs_checking', 'not_true', 'needs_attention');

alter table depth_reports
  add column triage_state triage_state not null default 'needs_checking';

create index depth_reports_triage_idx on depth_reports (triage_state);

-- Reports a moderator already hid land in the not_true column; reports the
-- reporter removed themselves do not - that was their choice about their own
-- pin, not a judgement that it was false.
update depth_reports r
   set triage_state = 'not_true'
 where r.status = 'hidden'
   and exists (
     select 1 from report_events e
      where e.report_id = r.id
        and e.event_type = 'decision'
        and e.payload ->> 'decision' = 'hide'
   );

-- 3. Becoming assignable -------------------------------------------------------
--
-- A signed-in person fills these in from /ako and becomes somebody the
-- master admin can put on an incident. Anyone who does not stays an ordinary
-- user. The roster is "everyone with a unit set".
create type responder_unit as enum (
  'bfp', 'barangay_rescue', 'medical', 'police', 'other'
);

alter table profiles add column responder_unit     responder_unit;
alter table profiles add column responder_barangay text references barangays (name);

-- 0023 made the update grant column-scoped. Widened by exactly these two
-- columns: a person may say what unit they are in and where. They still may
-- not touch suspended_at.
grant update (responder_unit, responder_barangay) on profiles to authenticated;

-- 4. Assignments ---------------------------------------------------------------
--
-- One table for both kinds of row, so one query answers "what is assigned".
-- The check makes a row about exactly one thing.
create table assignments (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid references depth_reports (id) on delete cascade,
  sos_id       uuid references sos_signals (id) on delete cascade,
  responder_id uuid not null references profiles (id) on delete cascade,
  assigned_by  uuid not null references profiles (id),
  assigned_at  timestamptz not null default now(),
  closed_at    timestamptz,
  closed_by    uuid references profiles (id),
  check ((incident_id is null) <> (sos_id is null))
);

-- One open assignment per responder per record. A second one would be the
-- same fact twice.
create unique index assignments_open_incident_idx
  on assignments (incident_id, responder_id)
  where closed_at is null and incident_id is not null;
create unique index assignments_open_sos_idx
  on assignments (sos_id, responder_id)
  where closed_at is null and sos_id is not null;
create index assignments_responder_idx
  on assignments (responder_id) where closed_at is null;

-- NOBODY REACHES THIS TABLE DIRECTLY. Same posture as report_updates: no
-- grant to anon or authenticated, RLS on with no policy. The functions below
-- are the whole surface. A row here says which named person was sent toward
-- which distressed person, which is not a thing to serve by column.
revoke all on assignments from anon, authenticated;
grant select, insert, update, delete on assignments to service_role;
alter table assignments enable row level security;

-- 5. The predicate -------------------------------------------------------------
--
-- "A user may read an incident if they moderate its barangay OR they hold an
-- open assignment on it." moderates() is the first half; this is the second.
--
-- Granted to authenticated because the two RLS policies below and the
-- storage policy in section 9 call it as the querying role (0031). It
-- answers only about auth.uid() and only yes/no.
create function holds_assignment(p_incident_id uuid, p_sos_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from assignments a
     where a.responder_id = auth.uid()
       and a.closed_at is null
       and (
         (p_incident_id is not null and a.incident_id = p_incident_id)
         or (p_sos_id is not null and a.sos_id = p_sos_id)
       )
  );
$fn$;

revoke execute on function holds_assignment(uuid, uuid) from public, anon;
grant  execute on function holds_assignment(uuid, uuid) to authenticated;

-- Additive; permissive policies are OR-ed. A responder with an open
-- assignment reads that one row - including a medical or accident report the
-- public policy withholds, and including a 'flagged' or 'confirmed' status
-- the public never sees. The moment the assignment closes, the row is gone.
-- These also make realtime deliver the row's changes to the responder.
create policy "responders read reports they are assigned to"
  on depth_reports for select
  to authenticated
  using (holds_assignment(id, null));

create policy "responders read signals they are assigned to"
  on sos_signals for select
  to authenticated
  using (holds_assignment(null, id));

-- 6. Assigning and closing -----------------------------------------------------
--
-- Master admin only. A report that is assigned is by that act confirmed -
-- the column asserts a person is on it, and "unconfirmed but somebody was
-- sent" is a contradiction. An SOS is NOT confirmed here: decide_sos
-- 'confirmed' raises the reporter's confirmed_count, which is a judgement
-- about a person and stays an explicit act.
create function assign_responder(
  p_incident_id  uuid,
  p_sos_id       uuid,
  p_responder_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id         uuid;
  v_unit       responder_unit;
  v_status     text;
  v_sos_status sos_status;
begin
  if not is_master_admin() then
    raise exception 'only a master admin assigns responders' using errcode = '42501';
  end if;

  if (p_incident_id is null) = (p_sos_id is null) then
    raise exception 'exactly one of incident or signal must be given';
  end if;

  select p.responder_unit into v_unit from profiles p where p.id = p_responder_id;
  if v_unit is null then
    raise exception 'responder has no unit set';
  end if;

  if p_incident_id is not null then
    select r.status into v_status from depth_reports r
     where r.id = p_incident_id for update;
    if v_status is null then
      raise exception 'report not found';
    end if;
    if v_status = 'hidden' then
      raise exception 'report is hidden';
    end if;

    update depth_reports
       set triage_state = 'needs_attention'
     where id = p_incident_id and triage_state = 'needs_checking';
  else
    select s.status into v_sos_status from sos_signals s
     where s.id = p_sos_id for update;
    if v_sos_status is null then
      raise exception 'signal not found';
    end if;
    if v_sos_status in ('dismissed', 'resolved') then
      raise exception 'signal is already %', v_sos_status;
    end if;
  end if;

  insert into assignments (incident_id, sos_id, responder_id, assigned_by)
  values (p_incident_id, p_sos_id, p_responder_id, auth.uid())
  returning id into v_id;

  -- The audit trail lives beside the record it is about, in the events
  -- table that record already has, so "what happened to this signal" stays
  -- one query.
  if p_incident_id is not null then
    insert into report_events (report_id, actor_id, event_type, payload)
    values (p_incident_id, auth.uid(), 'assigned',
            jsonb_build_object('assignment_id', v_id, 'responder_id', p_responder_id));
  else
    insert into signal_events (sos_id, actor_id, event_type, payload)
    values (p_sos_id, auth.uid(), 'assigned',
            jsonb_build_object('assignment_id', v_id, 'responder_id', p_responder_id));
  end if;

  return v_id;
end;
$fn$;

revoke execute on function assign_responder(uuid, uuid, uuid) from public, anon;
grant  execute on function assign_responder(uuid, uuid, uuid) to authenticated;

-- The master admin, or the responder themselves saying "tapos na". Closing
-- ends access; that is the whole point of the closed_at column.
create function close_assignment(p_assignment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_responder uuid;
  v_incident  uuid;
  v_sos       uuid;
begin
  select a.responder_id, a.incident_id, a.sos_id
    into v_responder, v_incident, v_sos
    from assignments a
   where a.id = p_assignment_id and a.closed_at is null
     for update;

  if v_responder is null then
    raise exception 'assignment not found or already closed';
  end if;

  if not (is_master_admin() or v_responder = auth.uid()) then
    raise exception 'not allowed to close this assignment' using errcode = '42501';
  end if;

  update assignments
     set closed_at = now(), closed_by = auth.uid()
   where id = p_assignment_id;

  if v_incident is not null then
    insert into report_events (report_id, actor_id, event_type, payload)
    values (v_incident, auth.uid(), 'assignment_closed',
            jsonb_build_object('assignment_id', p_assignment_id));
  else
    insert into signal_events (sos_id, actor_id, event_type, payload)
    values (v_sos, auth.uid(), 'assignment_closed',
            jsonb_build_object('assignment_id', p_assignment_id));
  end if;
end;
$fn$;

revoke execute on function close_assignment(uuid) from public, anon;
grant  execute on function close_assignment(uuid) to authenticated;

-- 7. What a responder sees -----------------------------------------------------
--
-- The list: what ranks and identifies a row, and no phone number. The
-- number comes one record at a time from assignment_detail, which writes
-- an audit row - the same split report_queue / report_detail make.
create function my_assignments()
returns table (
  assignment_id uuid,
  kind          text,
  target_id     uuid,
  hazard_type   hazard_type,
  severity      smallint,
  depth         depth_level,
  barangay      text,
  note          text,
  photo_path    text,
  created_at    timestamptz,
  assigned_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select a.id, 'report', r.id, r.hazard_type, r.severity, r.depth, r.barangay,
         null::text, r.photo_path, r.reported_at, a.assigned_at
    from assignments a
    join depth_reports r on r.id = a.incident_id
   where a.responder_id = auth.uid() and a.closed_at is null
  union all
  select a.id, 'sos', s.id, s.hazard_type, null::smallint, s.depth, s.barangay,
         s.note, s.photo_path, s.created_at, a.assigned_at
    from assignments a
    join sos_signals s on s.id = a.sos_id
   where a.responder_id = auth.uid() and a.closed_at is null
   order by assigned_at desc;
$fn$;

revoke execute on function my_assignments() from public, anon;
grant  execute on function my_assignments() to authenticated;

-- One record in full: where it is and whom to ring. VOLATILE because it
-- writes - the same rule report_detail and sos_detail follow. Whoever is
-- handed a phone number leaves a record of having been handed it.
create function assignment_detail(p_assignment_id uuid)
returns table (
  lat            double precision,
  lon            double precision,
  gps_accuracy_m double precision,
  reporter_phone text
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  v_incident uuid;
  v_sos      uuid;
begin
  select a.incident_id, a.sos_id into v_incident, v_sos
    from assignments a
   where a.id = p_assignment_id
     and a.closed_at is null
     and (a.responder_id = auth.uid() or is_master_admin());

  -- Not found, closed, or not theirs: no row and no audit entry, so an
  -- unauthorised probe leaves no misleading trail.
  if v_incident is null and v_sos is null then
    return;
  end if;

  if v_incident is not null then
    insert into report_events (report_id, actor_id, event_type, payload)
    values (v_incident, auth.uid(), 'viewed',
            jsonb_build_object('via', 'assignment', 'assignment_id', p_assignment_id));

    return query
    select st_y(r.location::geometry), st_x(r.location::geometry),
           r.gps_accuracy_m, p.phone
      from depth_reports r
      left join profiles p on p.id = r.reporter_id
     where r.id = v_incident;
  else
    insert into signal_events (sos_id, actor_id, event_type, payload)
    values (v_sos, auth.uid(), 'viewed',
            jsonb_build_object('via', 'assignment', 'assignment_id', p_assignment_id));

    return query
    select st_y(s.location::geometry), st_x(s.location::geometry),
           s.gps_accuracy_m, p.phone
      from sos_signals s
      left join profiles p on p.id = s.reporter_id
     where s.id = v_sos;
  end if;
end;
$fn$;

revoke execute on function assignment_detail(uuid) from public, anon;
grant  execute on function assignment_detail(uuid) to authenticated;

-- 8. The roster, and who may open the console ----------------------------------
--
-- Everyone with a unit set, with their number, for the master admin only.
-- A phone list is exactly the thing nobody else should be able to pull.
create function responder_roster()
returns table (
  user_id  uuid,
  name     text,
  unit     responder_unit,
  barangay text,
  phone    text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select p.id, p.display_name, p.responder_unit, p.responder_barangay, p.phone
    from profiles p
   where p.responder_unit is not null
     and is_master_admin()
   order by p.responder_unit, p.display_name;
$fn$;

revoke execute on function responder_roster() from public, anon;
grant  execute on function responder_roster() to authenticated;

-- What the console should show this caller. A moderator row, or a count of
-- open assignments, or neither. Answers only about auth.uid().
create function console_access()
returns table (role text, open_assignments integer)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    (select m.role from moderators m where m.user_id = auth.uid()),
    (select count(*)::integer from assignments a
      where a.responder_id = auth.uid() and a.closed_at is null);
$fn$;

revoke execute on function console_access() from public, anon;
grant  execute on function console_access() to authenticated;

-- 9. The photograph, for the responder too -------------------------------------
--
-- Same function 0024 wrote, with the second half of the predicate. The
-- storage policy that calls it is unchanged. Same signature, so create or
-- replace keeps the grants; restated anyway.
create or replace function can_view_sos_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from sos_signals s
     where s.photo_path = p_path
       and (moderates(s.barangay) or holds_assignment(null, s.id))
  );
$fn$;

revoke execute on function can_view_sos_photo(text) from public, anon;
grant  execute on function can_view_sos_photo(text) to authenticated, service_role;

-- 10. Decisions know about triage and assignments ------------------------------
--
-- decide_report gains a third decision, 'confirm', which is the board's
-- "Kailangan ng atensyon" for a report. 'hide' now also records not_true and
-- closes every open assignment on the report. Same signature as 0027, so
-- create or replace keeps the grants; restated per 0030.
create or replace function decide_report(
  p_report_id uuid,
  p_decision  text,
  p_reason    report_decision_reason default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_barangay text;
  v_status   text;
begin
  if p_decision not in ('keep', 'hide', 'confirm') then
    raise exception 'decision must be keep, hide or confirm, got %', p_decision;
  end if;

  if p_decision = 'hide' and p_reason is null then
    raise exception 'hiding requires a reason code';
  end if;

  select r.barangay, r.status
    into v_barangay, v_status
    from depth_reports r
   where r.id = decide_report.p_report_id
   for update;

  if v_status is null then
    raise exception 'report not found';
  end if;

  if not moderates(v_barangay) then
    raise exception 'not a moderator for barangay %', v_barangay;
  end if;

  if p_decision = 'hide' then
    update depth_reports
       set status = 'hidden', triage_state = 'not_true'
     where id = decide_report.p_report_id;

    -- Access by assignment ends when the record is declared not true.
    update assignments
       set closed_at = now(), closed_by = auth.uid()
     where incident_id = decide_report.p_report_id and closed_at is null;
  elsif p_decision = 'confirm' then
    update depth_reports
       set status = 'active', triage_state = 'needs_attention'
     where id = decide_report.p_report_id;
  else
    update depth_reports
       set status = 'active'
     where id = decide_report.p_report_id;
  end if;

  insert into report_events (report_id, actor_id, event_type, payload)
  values (
    decide_report.p_report_id,
    auth.uid(),
    'decision',
    jsonb_build_object('decision', p_decision, 'reason', p_reason,
                       'from_status', v_status)
  );
end;
$fn$;

revoke execute on function decide_report(uuid, text, report_decision_reason) from public, anon;
grant  execute on function decide_report(uuid, text, report_decision_reason) to authenticated;

-- decide_sos: 0020's body verbatim, plus closing open assignments on
-- dismissal. Everything else - the transition rules, reputation, suspension
-- - is untouched.
create or replace function decide_sos(
  signal_id uuid,
  decision  text,
  reason    dismiss_reason default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_reporter    uuid;
  v_barangay    text;
  v_status      sos_status;
  v_false_count integer;
begin
  if decision not in ('confirmed', 'dismissed') then
    raise exception 'decision must be confirmed or dismissed, got %', decision;
  end if;

  if decision = 'dismissed' and reason is null then
    raise exception 'dismissing requires a reason code';
  end if;

  select s.reporter_id, s.barangay, s.status
    into v_reporter, v_barangay, v_status
    from sos_signals s
   where s.id = decide_sos.signal_id
   for update;

  if v_reporter is null then
    raise exception 'signal not found';
  end if;

  if not moderates(v_barangay) then
    raise exception 'not a moderator for barangay %', v_barangay;
  end if;

  if v_status in ('dismissed', 'resolved') then
    raise exception 'signal is already %', v_status;
  end if;

  update sos_signals
     set status       = decision::sos_status,
         dismissed_as = case when decision = 'dismissed' then reason else null end
   where id = decide_sos.signal_id;

  if decision = 'dismissed' then
    update assignments
       set closed_at = now(), closed_by = auth.uid()
     where sos_id = decide_sos.signal_id and closed_at is null;
  end if;

  insert into signal_events (sos_id, actor_id, event_type, payload)
  values (
    decide_sos.signal_id,
    auth.uid(),
    'decision',
    jsonb_build_object('decision', decision, 'reason', reason, 'from_status', v_status)
  );

  insert into reputation (user_id) values (v_reporter)
  on conflict (user_id) do nothing;

  if decision = 'confirmed' then
    update reputation
       set confirmed_count = confirmed_count + 1, updated_at = now()
     where user_id = v_reporter;

  elsif reason = 'false_report' then
    update reputation
       set false_report_count = false_report_count + 1, updated_at = now()
     where user_id = v_reporter
   returning false_report_count into v_false_count;

    if v_false_count >= 3 then
      update profiles set suspended_at = now()
       where id = v_reporter and suspended_at is null;

      insert into signal_events (sos_id, actor_id, event_type, payload)
      values (
        decide_sos.signal_id,
        auth.uid(),
        'suspension',
        jsonb_build_object('reporter_id', v_reporter, 'false_report_count', v_false_count)
      );
    end if;
  end if;
end;
$fn$;

revoke execute on function decide_sos(uuid, text, dismiss_reason) from public, anon;
grant  execute on function decide_sos(uuid, text, dismiss_reason) to authenticated;

-- 11. The queue carries the triage state ----------------------------------------
--
-- A confirmed report shows as confirmed in the barangay's queue - the spec's
-- "this is the moment it becomes real to other people". Shape changes, so
-- drop and recreate; grants restated per 0030. Body is 0028 §7's with one
-- column added after status.
drop function if exists report_queue();

create function report_queue()
returns table (
  id             uuid,
  barangay       text,
  hazard_type    hazard_type,
  severity       smallint,
  depth          depth_level,
  status         text,
  triage_state   triage_state,
  priority       text,
  reported_at    timestamptz,
  has_photo      boolean,
  gps_accuracy_m double precision,
  answers        integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  select r.id, r.barangay, r.hazard_type, r.severity, r.depth, r.status,
         r.triage_state,
         report_priority(r.severity, r.reported_at),
         r.reported_at,
         r.photo_path is not null,
         r.gps_accuracy_m,
         (select count(*)::integer from report_updates u where u.report_id = r.id)
    from depth_reports r
   where r.status in ('active', 'flagged')
     and moderates(r.barangay)
   order by (r.status = 'flagged') desc,
            case report_priority(r.severity, r.reported_at)
              when 'urgent' then 0
              when 'watch'  then 1
              else 2
            end,
            r.reported_at desc;
$fn$;

revoke execute on function report_queue() from public, anon;
grant  execute on function report_queue() to authenticated;
```

- [ ] **Step 3: Apply it locally**

Run: `npx supabase migration up --local`
Expected: `Applying migration 0032_master_admin_and_assignments.sql...` and no
error. If it fails on `moderators_role_check`, read the constraint's real
name with `\d moderators` in `psql` against the `DB_URL` from
`npx supabase status`, and use that name.

- [ ] **Step 4: Confirm the grants, not the comments**

Run this against the local database (the `DB_URL` from `npx supabase status`):

```sql
select p.proname,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_master_admin','holds_assignment','assign_responder',
                     'close_assignment','my_assignments','assignment_detail',
                     'responder_roster','console_access','decide_report',
                     'decide_sos','report_queue','can_view_sos_photo','moderates')
 order by 1;
```

Expected: `anon = false` on every row, `authenticated = true` on every row.

- [ ] **Step 5: Write the master-admin test**

```typescript
// tests/integration/master-admin.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * The third role, and the two things it must not have changed: a moderator
 * is still confined to one barangay, and an admin is still not a master
 * admin. The board and the roster exist for exactly one role.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const masterClient = createClient(url, anonKey, opts);
const adminClient = createClient(url, anonKey, opts);
const modClient = createClient(url, anonKey, opts);
const nobodyClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const AWAY = "South Signal Village";
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";

let reporterId: string;

async function makeUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user!.id, email };
}

async function newReport(barangay = HOME): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({ reporter_id: reporterId, location: MALANDAY, depth: "chest" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: moveError } = await admin
    .from("depth_reports")
    .update({ barangay })
    .eq("id", data.id);
  if (moveError) throw moveError;
  return data.id;
}

beforeAll(async () => {
  const master = await makeUser("master");
  const a = await makeUser("admin");
  const m = await makeUser("mod");
  const n = await makeUser("nobody");
  const r = await makeUser("reporter");
  reporterId = r.id;

  const { error } = await admin.from("moderators").insert([
    { user_id: master.id, barangay: HOME, role: "master_admin" },
    { user_id: a.id, barangay: HOME, role: "admin" },
    { user_id: m.id, barangay: HOME, role: "moderator" },
  ]);
  if (error) throw error;

  for (const [client, user] of [
    [masterClient, master],
    [adminClient, a],
    [modClient, m],
    [nobodyClient, n],
  ] as const) {
    const { error: signInError } = await client.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;
  }
});

describe("the master_admin role", () => {
  it("is accepted by the moderators check constraint", async () => {
    // The insert in beforeAll is the test; if 0032 did not widen the
    // constraint, beforeAll threw and nothing below runs.
    const { data } = await masterClient.rpc("is_master_admin");
    expect(data).toBe(true);
  });

  it("is not what an admin has", async () => {
    const { data } = await adminClient.rpc("is_master_admin");
    expect(data).toBe(false);
  });

  it("sees every barangay's queue, like an admin", async () => {
    const id = await newReport(AWAY);
    const { data } = await masterClient.rpc("report_queue");
    expect((data as { id: string }[]).map((r) => r.id)).toContain(id);
  });

  it("leaves an ordinary moderator exactly as confined as before", async () => {
    const id = await newReport(AWAY);
    const { data } = await modClient.rpc("report_queue");
    expect((data as { id: string }[]).map((r) => r.id)).not.toContain(id);
  });

  it("is reported by console_access, along with an assignment count", async () => {
    const { data } = await masterClient.rpc("console_access");
    expect(data).toEqual([{ role: "master_admin", open_assignments: 0 }]);
  });

  it("console_access says neither for a plain user", async () => {
    const { data } = await nobodyClient.rpc("console_access");
    expect(data).toEqual([{ role: null, open_assignments: 0 }]);
  });
});

describe("triage state", () => {
  it("starts at needs_checking and is carried by the queue", async () => {
    const id = await newReport();
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; triage_state: string }[]).find((r) => r.id === id);
    expect(row!.triage_state).toBe("needs_checking");
  });

  it("moves to needs_attention when a moderator confirms", async () => {
    const id = await newReport();
    const { error } = await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "confirm",
    });
    expect(error).toBeNull();
    const { data } = await admin
      .from("depth_reports")
      .select("triage_state, status")
      .eq("id", id)
      .single();
    expect(data).toEqual({ triage_state: "needs_attention", status: "active" });
  });

  it("moves to not_true when hidden, whatever the reason", async () => {
    // The column names the board's column, not the reason. A stale report
    // lands in "Hindi totoo" because that is the column the board has for
    // "a person decided this should come off the map".
    const id = await newReport();
    await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "stale",
    });
    const { data } = await admin
      .from("depth_reports")
      .select("triage_state, status")
      .eq("id", id)
      .single();
    expect(data).toEqual({ triage_state: "not_true", status: "hidden" });
  });

  it("refuses confirm from a moderator of another barangay", async () => {
    const id = await newReport(AWAY);
    const { error } = await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "confirm",
    });
    expect(error).not.toBeNull();
  });
});

describe("the roster", () => {
  it("is empty of anyone without a unit, and lists those with one", async () => {
    const responder = await makeUser("roster");
    await admin
      .from("profiles")
      .update({
        display_name: "Ana Reyes",
        responder_unit: "bfp",
        responder_barangay: HOME,
        phone: "+639171234567",
      })
      .eq("id", responder.id);

    const { data, error } = await masterClient.rpc("responder_roster");
    expect(error).toBeNull();
    const rows = data as { user_id: string; name: string; unit: string; phone: string }[];
    expect(rows.find((r) => r.user_id === responder.id)).toEqual({
      user_id: responder.id,
      name: "Ana Reyes",
      unit: "bfp",
      barangay: HOME,
      phone: "+639171234567",
    });
    expect(rows.find((r) => r.user_id === reporterId)).toBeUndefined();
  });

  it("is withheld from an admin", async () => {
    // A list of every responder's phone number is the one thing the wider
    // scope must not hand out by accident.
    const { data } = await adminClient.rpc("responder_roster");
    expect(data).toEqual([]);
  });

  it("is closed to anon at the grant layer", async () => {
    const stranger = createClient(url, anonKey, opts);
    const { error } = await stranger.rpc("responder_roster");
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run it**

Run: `npx vitest run tests/integration/master-admin.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 7: Write the assignments test**

```typescript
// tests/integration/assignments.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Access by assignment, not by role.
 *
 * The spec's rule: a user may read an incident if they moderate its barangay
 * OR they hold an open assignment on it. Half of this file is the second
 * clause working; the other half is it not widening by accident - one row,
 * not the barangay, and nothing once the assignment is closed.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const masterClient = createClient(url, anonKey, opts);
const adminClient = createClient(url, anonKey, opts);
const responderClient = createClient(url, anonKey, opts);
const bystanderClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";

let masterId: string;
let responderId: string;
let bystanderId: string;
let reporterId: string;

async function makeUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user!.id, email };
}

/** A medical report: the kind the public policy withholds, so a responder
 *  reading it proves the assignment policy and not the public one. */
async function newMedical(): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({
      reporter_id: reporterId,
      location: MALANDAY,
      hazard_type: "medical",
      severity: 3,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function newSignal(): Promise<string> {
  const reporter = await makeUser("sig");
  await admin.from("profiles").update({ phone: "+639170000001" }).eq("id", reporter.id);
  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: reporter.id,
      location: MALANDAY,
      photo_path: `${reporter.id}/x.jpg`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function assign(target: { incident?: string; sos?: string }, to = responderId) {
  const { data, error } = await masterClient.rpc("assign_responder", {
    p_incident_id: target.incident ?? null,
    p_sos_id: target.sos ?? null,
    p_responder_id: to,
  });
  if (error) throw error;
  return data as string;
}

beforeAll(async () => {
  const master = await makeUser("master");
  const a = await makeUser("admin");
  const resp = await makeUser("responder");
  const by = await makeUser("bystander");
  const r = await makeUser("reporter");
  masterId = master.id;
  responderId = resp.id;
  bystanderId = by.id;
  reporterId = r.id;

  await admin.from("moderators").insert([
    { user_id: masterId, barangay: HOME, role: "master_admin" },
    { user_id: a.id, barangay: HOME, role: "admin" },
  ]);
  await admin
    .from("profiles")
    .update({ display_name: "Ben Cruz", responder_unit: "barangay_rescue", responder_barangay: HOME })
    .eq("id", responderId);
  await admin.from("profiles").update({ phone: "+639171234567" }).eq("id", reporterId);

  for (const [client, user] of [
    [masterClient, master],
    [adminClient, a],
    [responderClient, resp],
    [bystanderClient, by],
  ] as const) {
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    if (error) throw error;
  }
});

describe("assign_responder", () => {
  it("is master admin only", async () => {
    const id = await newMedical();
    const { error } = await adminClient.rpc("assign_responder", {
      p_incident_id: id,
      p_sos_id: null,
      p_responder_id: responderId,
    });
    expect(error).not.toBeNull();
  });

  it("refuses somebody with no unit", async () => {
    const id = await newMedical();
    const { error } = await masterClient.rpc("assign_responder", {
      p_incident_id: id,
      p_sos_id: null,
      p_responder_id: bystanderId,
    });
    expect(error).not.toBeNull();
  });

  it("refuses both or neither target", async () => {
    const id = await newMedical();
    const sos = await newSignal();
    const both = await masterClient.rpc("assign_responder", {
      p_incident_id: id,
      p_sos_id: sos,
      p_responder_id: responderId,
    });
    expect(both.error).not.toBeNull();
    const neither = await masterClient.rpc("assign_responder", {
      p_incident_id: null,
      p_sos_id: null,
      p_responder_id: responderId,
    });
    expect(neither.error).not.toBeNull();
  });

  it("confirms a report on the way to assignment", async () => {
    const id = await newMedical();
    await assign({ incident: id });
    const { data } = await admin
      .from("depth_reports")
      .select("triage_state")
      .eq("id", id)
      .single();
    expect(data!.triage_state).toBe("needs_attention");
  });

  it("leaves an SOS's status alone", async () => {
    // Confirming an SOS raises the reporter's confirmed_count; that is a
    // judgement about a person and stays an explicit act.
    const sos = await newSignal();
    await assign({ sos });
    const { data } = await admin.from("sos_signals").select("status").eq("id", sos).single();
    expect(data!.status).toBe("pending");
  });

  it("refuses a dismissed signal", async () => {
    const sos = await newSignal();
    await masterClient.rpc("decide_sos", {
      signal_id: sos,
      decision: "dismissed",
      reason: "duplicate",
    });
    const { error } = await masterClient.rpc("assign_responder", {
      p_incident_id: null,
      p_sos_id: sos,
      p_responder_id: responderId,
    });
    expect(error).not.toBeNull();
  });

  it("records the assignment beside the record", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { data } = await admin
      .from("report_events")
      .select("actor_id, event_type, payload")
      .eq("report_id", id)
      .eq("event_type", "assigned")
      .single();
    expect(data!.actor_id).toBe(masterId);
    expect((data!.payload as { assignment_id: string }).assignment_id).toBe(assignmentId);
  });

  it("refuses the same person twice on one record", async () => {
    const id = await newMedical();
    await assign({ incident: id });
    const { error } = await masterClient.rpc("assign_responder", {
      p_incident_id: id,
      p_sos_id: null,
      p_responder_id: responderId,
    });
    expect(error).not.toBeNull();
  });
});

describe("what an assignment grants", () => {
  it("makes that one report readable to the responder, and no other", async () => {
    const mine = await newMedical();
    const other = await newMedical();
    await assign({ incident: mine });

    const { data } = await responderClient
      .from("depth_reports")
      .select("id")
      .in("id", [mine, other]);
    expect((data ?? []).map((r) => r.id)).toEqual([mine]);
  });

  it("makes that one signal readable to the responder", async () => {
    const sos = await newSignal();
    await assign({ sos });
    const { data } = await responderClient.from("sos_signals").select("id").eq("id", sos);
    expect((data ?? []).map((r) => r.id)).toEqual([sos]);
  });

  it("lists it in my_assignments with what identifies it and no phone", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { data } = await responderClient.rpc("my_assignments");
    const row = (data as Record<string, unknown>[]).find((r) => r.assignment_id === assignmentId);
    expect(row).toMatchObject({
      kind: "report",
      target_id: id,
      hazard_type: "medical",
      severity: 3,
      barangay: HOME,
    });
    expect(row).not.toHaveProperty("reporter_phone");
  });

  it("hands the number over through assignment_detail, and records it", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { data } = await responderClient.rpc("assignment_detail", {
      p_assignment_id: assignmentId,
    });
    expect((data as { reporter_phone: string }[])[0].reporter_phone).toBe("+639171234567");

    const { data: events } = await admin
      .from("report_events")
      .select("actor_id, event_type, payload")
      .eq("report_id", id)
      .eq("event_type", "viewed");
    expect(events).toContainEqual({
      actor_id: responderId,
      event_type: "viewed",
      payload: { via: "assignment", assignment_id: assignmentId },
    });
  });

  it("gives a bystander nothing and no trail", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { data } = await bystanderClient.rpc("assignment_detail", {
      p_assignment_id: assignmentId,
    });
    expect(data).toEqual([]);
    const { data: events } = await admin
      .from("report_events")
      .select("actor_id")
      .eq("report_id", id);
    expect((events ?? []).map((e) => e.actor_id)).not.toContain(bystanderId);
  });

  it("lets the responder open the SOS photo, by policy", async () => {
    // can_view_sos_photo is what the storage policy asks; the object itself
    // need not exist for the predicate to answer.
    const sos = await newSignal();
    const { data: row } = await admin.from("sos_signals").select("photo_path").eq("id", sos).single();
    const before = await responderClient.rpc("can_view_sos_photo", { p_path: row!.photo_path });
    expect(before.data).toBe(false);
    await assign({ sos });
    const after = await responderClient.rpc("can_view_sos_photo", { p_path: row!.photo_path });
    expect(after.data).toBe(true);
  });

  it("counts in console_access", async () => {
    const { data } = await responderClient.rpc("console_access");
    const row = (data as { role: string | null; open_assignments: number }[])[0];
    expect(row.role).toBeNull();
    expect(row.open_assignments).toBeGreaterThan(0);
  });
});

describe("when the assignment ends", () => {
  it("the responder can close it themselves, and access ends", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { error } = await responderClient.rpc("close_assignment", {
      p_assignment_id: assignmentId,
    });
    expect(error).toBeNull();
    const { data } = await responderClient.from("depth_reports").select("id").eq("id", id);
    expect(data).toEqual([]);
  });

  it("a bystander cannot close it", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { error } = await bystanderClient.rpc("close_assignment", {
      p_assignment_id: assignmentId,
    });
    expect(error).not.toBeNull();
  });

  it("hiding the report closes it", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    await masterClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "not_true",
    });
    const { data } = await admin
      .from("assignments")
      .select("closed_at")
      .eq("id", assignmentId)
      .single();
    expect(data!.closed_at).not.toBeNull();
  });

  it("dismissing the signal closes it", async () => {
    const sos = await newSignal();
    const assignmentId = await assign({ sos });
    await masterClient.rpc("decide_sos", {
      signal_id: sos,
      decision: "dismissed",
      reason: "insufficient_info",
    });
    const { data } = await admin
      .from("assignments")
      .select("closed_at")
      .eq("id", assignmentId)
      .single();
    expect(data!.closed_at).not.toBeNull();
  });

  it("closing writes an audit row", async () => {
    const sos = await newSignal();
    const assignmentId = await assign({ sos });
    await masterClient.rpc("close_assignment", { p_assignment_id: assignmentId });
    const { data } = await admin
      .from("signal_events")
      .select("event_type")
      .eq("sos_id", sos);
    expect((data ?? []).map((e) => e.event_type)).toContain("assignment_closed");
  });
});

describe("the table itself", () => {
  it("is unreachable to a signed-in user", async () => {
    const { error } = await responderClient.from("assignments").select("id").limit(1);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 8: Run both, and the suites that touch what changed**

Run: `npx vitest run tests/integration/assignments.test.ts tests/integration/master-admin.test.ts tests/integration/report-moderation.test.ts tests/integration/admin-role.test.ts tests/integration/moderation.test.ts tests/integration/sos-photo-access.test.ts`
Expected: all PASS. `report-moderation.test.ts` still passes because
`decide_report`'s two old decisions behave exactly as before.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0032_master_admin_and_assignments.sql tests/integration/master-admin.test.ts tests/integration/assignments.test.ts
git commit -m "feat: master admin role, triage state, responders and assignments"
```

---
### Task 2: Vocabularies and strings — board columns, responder units, both languages

**Files:**
- Create: `src/lib/i18n/strings/board.ts`
- Create: `src/lib/board/types.ts`, `src/lib/board/types.test.ts`
- Create: `src/lib/responder/types.ts`, `src/lib/responder/types.test.ts`
- Modify: `src/lib/i18n/strings/index.ts`
- Modify: `src/lib/i18n/strings/sos.ts` — one key, both halves

**Interfaces:**
- Consumes: `dict` from `@/lib/i18n/dict`; `HazardType`, `Severity` from
  `@/lib/hazard/types`; `DepthLevel` from `@/lib/depth/scale`
- Produces: `copy.board.*` (every key below); `copy.sos.hazardPrompt`;
  `BOARD_COLUMNS`, `type BoardColumn`, `type BoardKind`, `interface
  BoardRow`, `isBoardColumn(v: unknown)`, `movesFrom(from: BoardColumn):
  readonly BoardColumn[]`, `canMove(from, to)`, `moveNeeds(to: BoardColumn):
  "reason" | "responder" | null`, `columnLabel(col, copy.board)`,
  `groupByColumn(rows: BoardRow[]): Record<BoardColumn, BoardRow[]>`;
  `RESPONDER_UNITS`, `type ResponderUnit`, `isResponderUnit(v: unknown)`,
  `unitLabel(unit, copy.board)`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/board/types.test.ts
import { describe, it, expect } from "vitest";
import { copyFor } from "@/lib/i18n/strings";
import {
  BOARD_COLUMNS, isBoardColumn, movesFrom, canMove, moveNeeds,
  columnLabel, groupByColumn, type BoardRow,
} from "./types";

const tl = copyFor("tl").board;
const en = copyFor("en").board;

function row(over: Partial<BoardRow>): BoardRow {
  return {
    kind: "report", id: "r1", board_column: "needs_checking",
    hazard_type: "flood", severity: 1, depth: "ankle", barangay: "Malanday",
    status: "active", trust_score: null, confidence: null,
    created_at: "2026-08-28T00:00:00Z", assignment_id: null,
    responder_name: null, responder_unit: null, ...over,
  };
}

describe("board columns", () => {
  it("are four, in the order the board draws them", () => {
    expect([...BOARD_COLUMNS]).toEqual([
      "needs_checking", "not_true", "needs_attention", "assigned",
    ]);
  });

  it("have a label in both languages", () => {
    for (const c of BOARD_COLUMNS) {
      expect(columnLabel(c, tl)).toBeTruthy();
      expect(columnLabel(c, en)).toBeTruthy();
    }
  });

  it("rejects what it does not know", () => {
    expect(isBoardColumn("dispatched")).toBe(false);
    expect(isBoardColumn(null)).toBe(false);
  });
});

describe("moves", () => {
  it("follow the spec's arrows from needs_checking", () => {
    expect([...movesFrom("needs_checking")]).toEqual([
      "not_true", "needs_attention", "assigned",
    ]);
  });

  it("let an assigned record be handed back or declared not true", () => {
    expect(canMove("assigned", "needs_attention")).toBe(true);
    expect(canMove("assigned", "not_true")).toBe(true);
    expect(canMove("assigned", "needs_checking")).toBe(false);
  });

  it("leave not_true as a terminal column", () => {
    expect(movesFrom("not_true")).toEqual([]);
  });

  it("never move a record onto its own column", () => {
    for (const c of BOARD_COLUMNS) expect(canMove(c, c)).toBe(false);
  });

  it("say what a move has to ask for first", () => {
    // Not true needs a reason: for an SOS this is the path that raises
    // false_report_count, and a drag must never quietly cost somebody their
    // account. Assigned needs a person, because the column asserts one.
    expect(moveNeeds("not_true")).toBe("reason");
    expect(moveNeeds("assigned")).toBe("responder");
    expect(moveNeeds("needs_attention")).toBeNull();
    expect(moveNeeds("needs_checking")).toBeNull();
  });
});

describe("groupByColumn", () => {
  it("returns every column, empty ones included, in server order", () => {
    const rows = [
      row({ id: "a", board_column: "assigned" }),
      row({ id: "b", board_column: "needs_checking" }),
      row({ id: "c", board_column: "needs_checking" }),
    ];
    const grouped = groupByColumn(rows);
    expect(Object.keys(grouped)).toEqual([...BOARD_COLUMNS]);
    expect(grouped.needs_checking.map((r) => r.id)).toEqual(["b", "c"]);
    expect(grouped.not_true).toEqual([]);
    expect(grouped.assigned.map((r) => r.id)).toEqual(["a"]);
  });
});
```

```typescript
// src/lib/responder/types.test.ts
import { describe, it, expect } from "vitest";
import { copyFor } from "@/lib/i18n/strings";
import { RESPONDER_UNITS, isResponderUnit, unitLabel } from "./types";

describe("responder units", () => {
  it("match the responder_unit enum in 0032", () => {
    expect([...RESPONDER_UNITS]).toEqual([
      "bfp", "barangay_rescue", "medical", "police", "other",
    ]);
  });

  it("have a label in both languages", () => {
    for (const u of RESPONDER_UNITS) {
      expect(unitLabel(u, copyFor("tl").board)).toBeTruthy();
      expect(unitLabel(u, copyFor("en").board)).toBeTruthy();
    }
  });

  it("rejects the unknown", () => {
    expect(isResponderUnit("navy")).toBe(false);
    expect(isResponderUnit(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/board src/lib/responder`
Expected: FAIL — cannot find module `./types`, and `copy.board` does not exist.

- [ ] **Step 3: Write the strings**

```typescript
// src/lib/i18n/strings/board.ts
import { dict } from "../dict";

/**
 * The master admin's board, the responder roster, a responder's own list,
 * and the /ako section where somebody says they are a responder.
 *
 * One dictionary rather than four, because these are one workflow read by
 * two people: the master admin who assigns, and the responder who is
 * assigned. Whoever checks the wording should see both sides at once.
 *
 * NOTHING HERE PROMISES A RESCUE TO A RESIDENT. These strings are read on
 * the console and on /ako by people who have signed in to do a job. The
 * resident-facing screens keep their own wording, unchanged.
 */
export const board = dict(
  {
    title: "Board",
    noAccess: "Para lang sa master admin ang board na ito.",
    desktopOnly: "Sa desktop ginagamit ang board. Buksan ito sa mas malapad na screen.",
    backToConsole: "Bumalik sa konsola",
    openBoard: "Buksan ang board",
    loading: "Naglo-load...",
    loadFailed: "Hindi ma-load ang board. Subukan ulit.",

    // -- The four columns. Two arrows in the spec: suriin -> hindi totoo |
    // atensyon -> may nakatalaga. ----------------------------------------
    colNeedsChecking: "Kailangang suriin",
    colNotTrue: "Hindi totoo",
    colNeedsAttention: "Kailangan ng atensyon",
    colAssigned: "May nakatalaga",
    columnEmpty: "Wala",

    kindSos: "SOS",
    kindReport: "Report",
    unspecifiedHazard: "Hindi tinukoy",

    moveTo: (column: string) => `→ ${column}`,
    moveFailed: "Hindi nailipat. Subukan ulit.",
    reasonPrompt: "Bakit hindi totoo?",
    reasonConfirm: "Ilipat",
    cancel: "Kanselahin",

    pickResponder: "Sino ang itatalaga?",
    rosterEmpty:
      "Wala pang nakarehistrong responder. Ang isang responder ay nagfi-fill up ng Responder section sa Ako.",
    assign: "Italaga",
    assignedTo: (name: string) => `Nakatalaga kay ${name}`,
    unassign: "Tapos na",

    // -- Units. Short, because they sit beside a name on a card. --------------
    unitBfp: "BFP",
    unitBarangayRescue: "Barangay rescue",
    unitMedical: "Medikal",
    unitPolice: "Pulis",
    unitOther: "Iba pa",

    // -- The graph. ------------------------------------------------------------
    graphTitle: "Nakaraang 48 oras",
    graphPerHour: "Insidente kada oras",
    graphBarangays: "Bawat barangay",
    graphEmpty: "Walang insidente sa nakaraang 48 oras.",
    graphTable: "Ipakita bilang talahanayan",
    graphHour: "Oras",
    graphCount: "Bilang",

    // -- The responder's own tab on /console. ---------------------------------
    tabAssigned: "Nakatalaga sa akin",
    assignedEmpty: "Wala kang nakatalagang insidente.",
    assignedSince: (when: string) => `Itinalaga ${when}`,
    assignedOpen: "Buksan",
    assignedClose: "Isara",
    assignedCall: (phone: string) => `Tawagan ${phone}`,
    assignedNoPhone: "Walang naibigay na numero.",
    assignedPhoneUnverified: "Hindi pa na-verify ang numerong ito.",
    assignedDirections: "Direksyon papunta rito",
    assignedNote: "Sabi ng nagpadala:",
    assignedDone: "Tapos na",
    assignedDoneSure: "Sigurado ka? Mawawala ito sa listahan mo.",
    assignedFailed: "Hindi naitala. Subukan ulit.",

    consoleNoAccess:
      "Wala kang access sa konsola. Ang mga moderator at ang mga may nakatalagang insidente lang ang may access.",
    confirmedBadge: "Kumpirmado",

    // -- /ako: becoming assignable. -------------------------------------------
    responderTitle: "Responder",
    responderNote:
      "Opsyonal. Kung nasa BFP, rescue, medikal o pulisya ka, ilagay dito para maitalaga ka ng master admin sa isang insidente. Ang pangalan at numero mo ay makikita lang ng master admin.",
    responderName: "Pangalan",
    responderUnit: "Unit",
    responderBarangay: "Barangay",
    responderChoose: "Pumili...",
    responderSave: "I-save",
    responderSaving: "Sine-save...",
    responderSaved: "Naka-save.",
    responderFailed: "Hindi na-save. Subukan ulit.",
    responderNeedsName: "Ilagay ang pangalan mo.",
    responderNeedsUnit: "Pumili ng unit.",
    responderRegistered: "Nakarehistro ka bilang responder.",
  },
  {
    title: "Board",
    noAccess: "This board is for the master admin only.",
    desktopOnly: "The board is for desktop. Open it on a wider screen.",
    backToConsole: "Back to the console",
    openBoard: "Open the board",
    loading: "Loading...",
    loadFailed: "The board could not be loaded. Try again.",

    colNeedsChecking: "Needs checking",
    colNotTrue: "Not true",
    colNeedsAttention: "Needs attention",
    colAssigned: "Assigned",
    columnEmpty: "None",

    kindSos: "SOS",
    kindReport: "Report",
    unspecifiedHazard: "Not specified",

    moveTo: (column: string) => `→ ${column}`,
    moveFailed: "The move did not go through. Try again.",
    reasonPrompt: "Why is it not true?",
    reasonConfirm: "Move",
    cancel: "Cancel",

    pickResponder: "Who is being assigned?",
    rosterEmpty:
      "No responder is registered yet. A responder fills in the Responder section under Ako.",
    assign: "Assign",
    assignedTo: (name: string) => `Assigned to ${name}`,
    unassign: "Done",

    unitBfp: "BFP",
    unitBarangayRescue: "Barangay rescue",
    unitMedical: "Medical",
    unitPolice: "Police",
    unitOther: "Other",

    graphTitle: "Last 48 hours",
    graphPerHour: "Incidents per hour",
    graphBarangays: "By barangay",
    graphEmpty: "No incidents in the last 48 hours.",
    graphTable: "Show as a table",
    graphHour: "Hour",
    graphCount: "Count",

    tabAssigned: "Assigned to me",
    assignedEmpty: "Nothing is assigned to you.",
    assignedSince: (when: string) => `Assigned ${when}`,
    assignedOpen: "Open",
    assignedClose: "Close",
    assignedCall: (phone: string) => `Call ${phone}`,
    assignedNoPhone: "No number was given.",
    assignedPhoneUnverified: "This number is not verified.",
    assignedDirections: "Directions to here",
    assignedNote: "The sender said:",
    assignedDone: "Done",
    assignedDoneSure: "Are you sure? It will leave your list.",
    assignedFailed: "Not recorded. Try again.",

    consoleNoAccess:
      "You do not have access to the console. Only moderators and people with an assigned incident do.",
    confirmedBadge: "Confirmed",

    responderTitle: "Responder",
    responderNote:
      "Optional. If you are with the BFP, a rescue unit, a medical team or the police, fill this in so the master admin can assign you to an incident. Only the master admin sees your name and number.",
    responderName: "Name",
    responderUnit: "Unit",
    responderBarangay: "Barangay",
    responderChoose: "Choose...",
    responderSave: "Save",
    responderSaving: "Saving...",
    responderSaved: "Saved.",
    responderFailed: "Not saved. Try again.",
    responderNeedsName: "Enter your name.",
    responderNeedsUnit: "Choose a unit.",
    responderRegistered: "You are registered as a responder.",
  },
);
```

In `src/lib/i18n/strings/index.ts`: `import { board } from "./board";`, add
`board` to `DICTS`, and add `board: pick(board, lang),` to `copyFor`'s
return, following the six namespaces already there.

In `src/lib/i18n/strings/sos.ts`, add to **both halves**, directly after
`notePlaceholder`:

| half | key | value |
|---|---|---|
| tl | `hazardPrompt` | `"Ano ang nangyayari? (opsyonal)"` |
| en | `hazardPrompt` | `"What is happening? (optional)"` |

- [ ] **Step 4: Write the vocabularies**

```typescript
// src/lib/board/types.ts
import type { DepthLevel } from "@/lib/depth/scale";
import type { HazardType, Severity } from "@/lib/hazard/types";
import type { Copy } from "@/lib/i18n/strings";
import type { ResponderUnit } from "@/lib/responder/types";

/**
 * The master admin's four columns, in the order the board draws them.
 *
 * Kailangang suriin -> Hindi totoo | Kailangan ng atensyon -> May nakatalaga.
 * The fourth is not a stored state: `board_rows()` (0033) derives it from an
 * open row in `assignments`, so "assigned" can never disagree with the
 * assignment that makes it true.
 */
export const BOARD_COLUMNS = [
  "needs_checking",
  "not_true",
  "needs_attention",
  "assigned",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export type BoardKind = "sos" | "report";

/** One row of `board_rows()`. */
export interface BoardRow {
  kind: BoardKind;
  id: string;
  board_column: BoardColumn;
  /** Null on an SOS whose sender chose no chip. */
  hazard_type: HazardType | null;
  /** Null on every SOS: a person asking for help is not ranked 1-3. */
  severity: Severity | null;
  depth: DepthLevel | null;
  barangay: string | null;
  status: string;
  trust_score: number | null;
  confidence: string | null;
  created_at: string;
  assignment_id: string | null;
  responder_name: string | null;
  responder_unit: ResponderUnit | null;
}

/**
 * Where a card may go from each column.
 *
 * `assigned` -> `needs_attention` is "the responder is done": it closes the
 * assignment and the record falls back to needing attention, which is what
 * it was. `assigned` -> `not_true` is allowed because the master admin may
 * learn it was false after sending someone; the decision functions close
 * the assignment on the way. `not_true` is terminal on the board - undoing
 * a dismissal is not a drag.
 */
const MOVES: Readonly<Record<BoardColumn, readonly BoardColumn[]>> = Object.freeze({
  needs_checking: ["not_true", "needs_attention", "assigned"],
  not_true: [],
  needs_attention: ["not_true", "assigned"],
  assigned: ["needs_attention", "not_true"],
});

/**
 * What a move must collect before it can happen. A reason before "not true"
 * - for an SOS that is the path that raises false_report_count, and a drag
 * must never quietly cost somebody their account. A person before
 * "assigned", because the column asserts one.
 */
const NEEDS: Readonly<Record<BoardColumn, "reason" | "responder" | null>> = Object.freeze({
  needs_checking: null,
  not_true: "reason",
  needs_attention: null,
  assigned: "responder",
});

const LABEL_KEY: Readonly<Record<BoardColumn, keyof Copy["board"]>> = Object.freeze({
  needs_checking: "colNeedsChecking",
  not_true: "colNotTrue",
  needs_attention: "colNeedsAttention",
  assigned: "colAssigned",
});

export function isBoardColumn(value: unknown): value is BoardColumn {
  return typeof value === "string" && (BOARD_COLUMNS as readonly string[]).includes(value);
}

export function movesFrom(from: BoardColumn): readonly BoardColumn[] {
  return MOVES[from];
}

export function canMove(from: BoardColumn, to: BoardColumn): boolean {
  return MOVES[from].includes(to);
}

export function moveNeeds(to: BoardColumn): "reason" | "responder" | null {
  return NEEDS[to];
}

export function columnLabel(column: BoardColumn, copy: Copy["board"]): string {
  return copy[LABEL_KEY[column]] as string;
}

/**
 * Rows into columns, keeping the server's order inside each. Every column
 * is present even when empty, so the board always draws four.
 */
export function groupByColumn(rows: readonly BoardRow[]): Record<BoardColumn, BoardRow[]> {
  const grouped = Object.fromEntries(
    BOARD_COLUMNS.map((c) => [c, [] as BoardRow[]]),
  ) as Record<BoardColumn, BoardRow[]>;
  for (const r of rows) grouped[r.board_column] = [...grouped[r.board_column], r];
  return grouped;
}
```

```typescript
// src/lib/responder/types.ts
import type { Copy } from "@/lib/i18n/strings";

/**
 * Who can be put on an incident. Must match `responder_unit` in 0032.
 *
 * Five, and `other` is last as the fallback. BFP first because a fire is the
 * hazard most likely to need somebody who is not the barangay.
 */
export const RESPONDER_UNITS = [
  "bfp",
  "barangay_rescue",
  "medical",
  "police",
  "other",
] as const;

export type ResponderUnit = (typeof RESPONDER_UNITS)[number];

const LABEL_KEY: Readonly<Record<ResponderUnit, keyof Copy["board"]>> = Object.freeze({
  bfp: "unitBfp",
  barangay_rescue: "unitBarangayRescue",
  medical: "unitMedical",
  police: "unitPolice",
  other: "unitOther",
});

export function isResponderUnit(value: unknown): value is ResponderUnit {
  return typeof value === "string" && (RESPONDER_UNITS as readonly string[]).includes(value);
}

export function unitLabel(unit: ResponderUnit, copy: Copy["board"]): string {
  return copy[LABEL_KEY[unit]] as string;
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run src/lib/board src/lib/responder src/lib/i18n && npx tsc --noEmit`
Expected: PASS (11 new tests) and a clean typecheck — the proof that both
halves of `board.ts` are complete and `sos.ts` gained its key in both.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/strings/board.ts src/lib/i18n/strings/index.ts src/lib/i18n/strings/sos.ts src/lib/board src/lib/responder
git commit -m "feat: board columns, responder units and their strings, both languages"
```

---
### Task 3: The console knows who you are — access, the assigned tab, confirm, the script

**Files:**
- Modify: `scripts/make-moderator.ts`
- Modify: `src/app/actions/decide-report.ts`
- Create: `src/app/actions/assign.ts`, `src/app/actions/assign.test.ts`
- Modify: `src/components/ModeratorLink.tsx`
- Modify: `src/components/ReportCard.tsx`
- Create: `src/components/AssignmentCard.tsx`
- Modify: `src/app/console/page.tsx`
- Modify: `src/app/globals.css` — append

**Interfaces:**
- Consumes: `console_access()`, `my_assignments()`, `assignment_detail(uuid)`,
  `close_assignment(uuid)`, `assign_responder(uuid, uuid, uuid)` from
  Task 1; `copy.board.*` from Task 2; `BoardKind`
- Produces: `assignResponder(target: {kind: BoardKind; id: string},
  responderId: string): Promise<AssignResult>`,
  `closeAssignment(assignmentId: string): Promise<AssignResult>`,
  `type AssignResult = {ok: true; assignmentId: string | null} | {ok: false;
  code: "not_allowed" | "failed"}`; `decideReport` accepting `"confirm"`;
  `interface ConsoleAccess {role: "moderator" | "admin" | "master_admin" |
  null; open_assignments: number}` exported from `src/app/console/page.tsx`;
  `interface MyAssignment` exported from `AssignmentCard.tsx`

- [ ] **Step 1: The script**

In `scripts/make-moderator.ts`:

```typescript
const isMaster = args.includes("--master");
const isAdmin = args.includes("--admin");
```

Replace the usage line with
`"usage: npm run make-moderator -- <email> <barangay> [--admin | --master]"`,
replace `const role = isAdmin ? "admin" : "moderator";` with

```typescript
// --master wins over --admin if both are passed: the wider grant is the one
// being asked for, and refusing the command would be the only alternative.
const role = isMaster ? "master_admin" : isAdmin ? "admin" : "moderator";
```

and extend the final `console.log` with a third branch:

```typescript
console.log(
  isMaster
    ? `${email} is now the master admin, based at ${barangay}: every barangay, plus the board and the roster.`
    : isAdmin
      ? `${email} is now an admin, based at ${barangay} and able to see every barangay.`
      : `${email} is now a moderator for ${barangay}.`,
);
```

Add to the file's doc comment: *`--master` grants `master_admin`, which is
admin plus the board at `/console/board`, the responder roster, and the
right to assign responders. Same act of vetting, one level wider again.*

- [ ] **Step 2: The actions**

`src/app/actions/decide-report.ts`: change the `decision` parameter type to
`"keep" | "hide" | "confirm"`. Nothing else changes — the reason check
already applies only to `"hide"`, and `decide_report` accepts the third word
since 0032. Update the doc comment's list of rules to mention "and whether
confirming is allowed".

Write the failing test first:

```typescript
// src/app/actions/assign.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { assignResponder, closeAssignment } from "./assign";

beforeEach(() => rpc.mockReset());

describe("assignResponder", () => {
  it("sends a report as incident_id and nothing as sos_id", async () => {
    rpc.mockResolvedValue({ data: "asg-1", error: null });
    const result = await assignResponder({ kind: "report", id: "r-1" }, "u-1");
    expect(rpc).toHaveBeenCalledWith("assign_responder", {
      p_incident_id: "r-1",
      p_sos_id: null,
      p_responder_id: "u-1",
    });
    expect(result).toEqual({ ok: true, assignmentId: "asg-1" });
  });

  it("sends an SOS as sos_id", async () => {
    rpc.mockResolvedValue({ data: "asg-2", error: null });
    await assignResponder({ kind: "sos", id: "s-1" }, "u-1");
    expect(rpc).toHaveBeenCalledWith("assign_responder", {
      p_incident_id: null,
      p_sos_id: "s-1",
      p_responder_id: "u-1",
    });
  });

  it("maps a permission refusal to not_allowed, anything else to failed", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "nope" } });
    expect(await assignResponder({ kind: "sos", id: "s" }, "u")).toEqual({
      ok: false, code: "not_allowed",
    });
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });
    expect(await assignResponder({ kind: "sos", id: "s" }, "u")).toEqual({
      ok: false, code: "failed",
    });
  });
});

describe("closeAssignment", () => {
  it("calls close_assignment and reports success without an id", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await closeAssignment("asg-1")).toEqual({ ok: true, assignmentId: null });
    expect(rpc).toHaveBeenCalledWith("close_assignment", { p_assignment_id: "asg-1" });
  });
});
```

Run: `npx vitest run src/app/actions/assign.test.ts` — Expected: FAIL, cannot
find module `./assign`.

```typescript
// src/app/actions/assign.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BoardKind } from "@/lib/board/types";

/**
 * A code, not a sentence - the rule every action here follows. The board
 * maps `not_allowed` and `failed` onto `copy.board`.
 */
export type AssignError = "not_allowed" | "failed";

export type AssignResult =
  | { ok: true; assignmentId: string | null }
  | { ok: false; code: AssignError };

/** Postgres's insufficient_privilege, which 0032's functions raise on purpose. */
const NOT_ALLOWED = "42501";

/**
 * Thin wrapper. Who may assign, whether the responder has a unit, whether
 * the record can take an assignment, the audit row - all of it is in
 * `assign_responder`, so the whole thing is one transaction.
 */
export async function assignResponder(
  target: { kind: BoardKind; id: string },
  responderId: string,
): Promise<AssignResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_responder", {
    p_incident_id: target.kind === "report" ? target.id : null,
    p_sos_id: target.kind === "sos" ? target.id : null,
    p_responder_id: responderId,
  });

  if (error) {
    // TODO: replace with real telemetry once a logger exists.
    console.error("assign_responder failed", { target, code: error.code, message: error.message });
    return { ok: false, code: error.code === NOT_ALLOWED ? "not_allowed" : "failed" };
  }

  revalidatePath("/console");
  return { ok: true, assignmentId: (data as string | null) ?? null };
}

/** The master admin, or the responder themselves, saying it is done. */
export async function closeAssignment(assignmentId: string): Promise<AssignResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_assignment", {
    p_assignment_id: assignmentId,
  });

  if (error) {
    // TODO: replace with real telemetry once a logger exists.
    console.error("close_assignment failed", { assignmentId, code: error.code, message: error.message });
    return { ok: false, code: error.code === NOT_ALLOWED ? "not_allowed" : "failed" };
  }

  revalidatePath("/console");
  return { ok: true, assignmentId: null };
}
```

Run: `npx vitest run src/app/actions/assign.test.ts` — Expected: PASS, 4 tests.

- [ ] **Step 3: The link in the header**

Replace the body of `check()` in `src/components/ModeratorLink.tsx` so it
asks `console_access` instead of reading `moderators` directly, and rename
the state to match:

```typescript
const [hasConsole, setHasConsole] = useState(false);
// ...
const { data } = await supabase.rpc("console_access");
const row = ((data as { role: string | null; open_assignments: number }[]) ?? [])[0];
if (!cancelled) setHasConsole(Boolean(row && (row.role !== null || row.open_assignments > 0)));
```

Keep `if (!hasConsole) return null;` and the link. Update the doc comment:
the link now also shows to somebody holding an open assignment, because the
console is where their assigned incident is; it is still discoverability,
not access control - `my_assignments()` answers only about `auth.uid()`.

- [ ] **Step 4: The confirmed badge on the queue row**

In `src/components/ReportCard.tsx`, add `triage_state: "needs_checking" |
"not_true" | "needs_attention";` to `QueueReport` after `status`. In the
`report-head` button, directly after the `report-band` span, add:

```tsx
{report.triage_state === "needs_attention" && (
  // The moment a report becomes real to other people: the master admin
  // (or this desk) confirmed it. Shown as a second pill, not a colour,
  // because colour on this row already means priority.
  <span className="report-band" data-band="confirmed">
    {copy.board.confirmedBadge}
  </span>
)}
```

Append to `globals.css`, after `.report-band[data-band="routine"]`:

```css
.report-band[data-band="confirmed"] { background: var(--success-tint); color: var(--success); }
```

- [ ] **Step 5: The responder's card**

```tsx
// src/components/AssignmentCard.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { closeAssignment } from "@/app/actions/assign";
import type { DepthLevel } from "@/lib/depth/scale";
import { depthName } from "@/lib/depth/name";
import type { HazardType, Severity } from "@/lib/hazard/types";
import { hazardName, severityWord } from "@/lib/hazard/name";
import { HazardIcon } from "@/components/HazardIcon";
import { formatAccuracy, needsLocationConfirmation } from "@/lib/reports/accuracy";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { formatPhone } from "@/lib/profile/phone";
import { timestampLabel } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

/** One row of `my_assignments()`. */
export interface MyAssignment {
  assignment_id: string;
  kind: "sos" | "report";
  target_id: string;
  hazard_type: HazardType | null;
  severity: Severity | null;
  depth: DepthLevel | null;
  barangay: string | null;
  note: string | null;
  photo_path: string | null;
  created_at: string;
  assigned_at: string;
}

/** One row of `assignment_detail()`, fetched only when the card is opened. */
interface Detail {
  lat: number;
  lon: number;
  gps_accuracy_m: number | null;
  reporter_phone: string | null;
}

function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

/**
 * What a responder was put on, opening into where it is and whom to ring.
 *
 * Opening is a real fetch, as on ReportCard, and for the same reason: the
 * phone number comes from `assignment_detail()`, which writes an audit row.
 * A responder's list holds what identifies each incident; the act of
 * opening one is the act that gets logged, because it precedes a call.
 *
 * "Tapos na" closes the assignment, which ends this person's access to the
 * record. Two taps, in place, like Tanggalin on /ako.
 */
export function AssignmentCard({
  assignment,
  onClosed,
}: {
  assignment: MyAssignment;
  onClosed: () => void;
}) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const what =
    assignment.hazard_type === null
      ? copy.board.unspecifiedHazard
      : assignment.hazard_type === "flood"
        ? assignment.depth !== null
          ? depthName(assignment.depth, copy.map)
          : hazardName("flood", copy.hazard)
        : assignment.severity !== null
          ? `${hazardName(assignment.hazard_type, copy.hazard)} · ${severityWord(assignment.hazard_type, assignment.severity, copy.hazard)}`
          : hazardName(assignment.hazard_type, copy.hazard);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (detail) return;

    const supabase = createClient();
    const { data } = await supabase.rpc("assignment_detail", {
      p_assignment_id: assignment.assignment_id,
    });
    setDetail(((data as Detail[]) ?? [])[0] ?? null);

    // A report's photo is in the public bucket; an SOS photo is private and
    // needs a signed URL, which the storage policy now grants to an assigned
    // responder (0032 §9).
    if (assignment.photo_path) {
      if (assignment.kind === "report") {
        setPhotoUrl(reportPhotoUrl(assignment.photo_path));
      } else {
        const { data: signed } = await supabase.storage
          .from("sos-photos")
          .createSignedUrl(assignment.photo_path, 300);
        setPhotoUrl(signed?.signedUrl ?? null);
      }
    }
  }

  async function done() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await closeAssignment(assignment.assignment_id);
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      setError(copy.board.assignedFailed);
      return;
    }
    onClosed();
  }

  return (
    <article className="report-card" data-band="assigned">
      <button
        className="report-head"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? copy.board.assignedClose : copy.board.assignedOpen}
      >
        <span className="report-band" data-band="assigned">
          {assignment.kind === "sos" ? copy.board.kindSos : copy.board.kindReport}
        </span>
        {assignment.hazard_type && <HazardIcon hazard={assignment.hazard_type} size="sm" />}
        <strong>{what}</strong>
        <span className="report-meta">
          {assignment.barangay ?? copy.screens.signalNoBarangay} ·{" "}
          {timestampLabel(assignment.created_at, copy.screens)} ·{" "}
          {copy.board.assignedSince(timestampLabel(assignment.assigned_at, copy.screens))}
        </span>
      </button>

      {open && detail === null && <p className="task-lede">{copy.screens.consoleLoading}</p>}

      {open && detail !== null && (
        <div className="report-body">
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="report-photo" src={photoUrl} alt={copy.screens.signalPhotoAlt} />
          )}

          {assignment.note && (
            <p className="notice">
              {copy.board.assignedNote} &ldquo;{assignment.note}&rdquo;
            </p>
          )}

          {needsLocationConfirmation(detail.gps_accuracy_m) && (
            <p className="notice">
              {detail.gps_accuracy_m === null
                ? copy.screens.reportVagueUnknown
                : copy.screens.reportVague(formatAccuracy(detail.gps_accuracy_m))}
            </p>
          )}

          <div className="reach">
            {detail.reporter_phone ? (
              <a className="reach-call" href={`tel:${detail.reporter_phone}`}>
                {copy.board.assignedCall(formatPhone(detail.reporter_phone))}
              </a>
            ) : (
              <p className="reach-none">{copy.board.assignedNoPhone}</p>
            )}
            <a
              className="reach-route"
              href={directionsUrl(detail.lat, detail.lon)}
              target="_blank"
              rel="noreferrer"
            >
              {copy.board.assignedDirections}
            </a>
            {detail.reporter_phone && (
              <p className="reach-caveat">{copy.board.assignedPhoneUnverified}</p>
            )}
          </div>

          {error && <p className="alert" role="alert">{error}</p>}

          <div className="report-actions">
            <button className="btn" onClick={() => void done()} disabled={busy}>
              {confirming ? copy.board.assignedDoneSure : copy.board.assignedDone}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
```

Append to `globals.css`:

```css
/* A responder's own row: the pill says what kind of record it is, in the
   quiet colour, because on this list nothing is competing for priority -
   everything here is already theirs. */
.report-band[data-band="assigned"] { background: var(--raised); color: var(--ink); }
```

- [ ] **Step 6: The console page**

Rewrite `src/app/console/page.tsx` so that:

1. `type Tab = "sos" | "reports" | "assigned"`, and it exports
   `interface ConsoleAccess { role: "moderator" | "admin" | "master_admin" | null; open_assignments: number }`.
2. New state: `const [access, setAccess] = useState<ConsoleAccess | null | undefined>(undefined);`
   (`undefined` = not asked yet, `null` = signed out) and
   `const [assignments, setAssignments] = useState<MyAssignment[] | null>(null);`.
3. `load` first calls `supabase.auth.getUser()`; if no user, `setAccess(null)`
   and return. Otherwise `const { data } = await supabase.rpc("console_access")`,
   `const row = ((data as ConsoleAccess[]) ?? [])[0] ?? { role: null, open_assignments: 0 }`,
   `setAccess(row)`, then in one `Promise.all`: `moderator_queue` and
   `report_queue` **only if `row.role !== null`** (else set both to `[]`),
   and `my_assignments` **only if `row.open_assignments > 0`** (else `[]`).
   A user with no role and no assignments makes exactly one RPC.
4. Initial tab: `useState<Tab>("sos")`, but after `load` resolves, if
   `row.role === null && row.open_assignments > 0` then `setTab("assigned")`
   — a responder lands on their own list. Only set it when `access` was
   previously `undefined` (track with a `useRef(false)` named `landed`), so a
   realtime reload does not yank the tab away.
5. The realtime subscription is unchanged.
6. Render, inside `<main className="console-page">` after the title:
   - If `access === undefined`: `<p className="task-lede">{copy.screens.consoleLoading}</p>` and nothing else.
   - If `access === null`: `<p className="task-lede">{copy.screens.akoSignedOut}</p>` and a `<Link href="/login" className="btn">{copy.screens.loginTitle}</Link>`.
   - If `access.role === null && access.open_assignments === 0`: `<p className="task-lede">{copy.board.consoleNoAccess}</p>`.
   - Otherwise the tab list: the `sos` and `reports` tabs render only when
     `access.role !== null`; the `assigned` tab renders only when
     `access.open_assignments > 0`, labelled `copy.board.tabAssigned` with a
     count pill like the others. Above the tab list, when
     `access.role === "master_admin"`:
     ```tsx
     <Link href="/console/board" className="btn btn-quiet console-board-link">
       {copy.board.openBoard}
     </Link>
     ```
   - The `assigned` tab body mirrors the reports tab: loading line, then
     `copy.board.assignedEmpty` when empty, then
     `<AssignmentCard key={a.assignment_id} assignment={a} onClosed={() => void load()} />`.
7. `SimulationBanner` stays above `<main>` in every branch.

Append to `globals.css`:

```css
.console-board-link {
  display: inline-block;
  margin: 4px 0 12px;
}
```

- [ ] **Step 7: Typecheck, unit tests, and look**

Run: `npx tsc --noEmit && npx vitest run src`
Expected: clean, all green. `ReportCard` compiles because `QueueReport` now
carries `triage_state`, which `report_queue()` returns since 0032.

Then drive it (`npm run dev`, a browser at `http://127.0.0.1:3000`):

1. Signed out, `/console` shows the signed-out line and a login button. The
   header shows no Console link.
2. Sign in as a plain account: `/console` says `consoleNoAccess`. No link.
3. `npm run make-moderator -- <that email> Malanday --master`, reload:
   the tabs appear and "Buksan ang board" sits above them (the link 404s
   until Task 6 - expected).
4. With the service role, insert an assignment for a second plain account
   on any report (`assign_responder` from the browser is not built until
   Task 6; use Supabase Studio's table editor on `assignments`, with
   `assigned_by` = the master's id, after giving the second account a
   `responder_unit` on `profiles`). Sign in as that account: the header
   shows Console, `/console` opens on "Nakatalaga sa akin", the card opens
   to a phone/directions block, and "Tapos na" -> "Sigurado ka?" -> the card
   is gone and the tab with it.
5. Switch language to English and repeat 4's last step: every word changes.

- [ ] **Step 8: Commit**

```bash
git add scripts/make-moderator.ts src/app/actions/decide-report.ts src/app/actions/assign.ts src/app/actions/assign.test.ts src/components/ModeratorLink.tsx src/components/ReportCard.tsx src/components/AssignmentCard.tsx src/app/console/page.tsx src/app/globals.css
git commit -m "feat: the console knows who is asking - assigned tab, confirmed badge, --master"
```

---
### Task 4: Becoming assignable — the Responder section on /ako

**Files:**
- Create: `src/components/ResponderField.tsx`, `src/components/ResponderField.test.tsx`
- Modify: `src/app/ako/page.tsx`

**Interfaces:**
- Consumes: `profiles.display_name`, `profiles.responder_unit`,
  `profiles.responder_barangay` (writable by the owner since 0032 §3);
  `barangays` (readable by authenticated since 0009); `RESPONDER_UNITS`,
  `isResponderUnit`, `unitLabel`; `copy.board.responder*`
- Produces: `<ResponderField initial={{name, unit, barangay}} />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ResponderField.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const update = vi.fn();
const eq = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
    from: (table: string) =>
      table === "barangays"
        ? { select: () => ({ order: async () => ({ data: [{ name: "Malanday" }, { name: "Nangka" }] }) }) }
        : { update: update.mockReturnValue({ eq }) },
  }),
}));

import { ResponderField } from "./ResponderField";

beforeEach(() => {
  update.mockClear();
  eq.mockReset().mockResolvedValue({ error: null });
});

describe("ResponderField", () => {
  it("refuses to save without a name", async () => {
    render(<ResponderField initial={{ name: null, unit: null, barangay: null }} />);
    await userEvent.selectOptions(await screen.findByLabelText("Unit"), "bfp");
    await userEvent.click(screen.getByRole("button", { name: "I-save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ilagay ang pangalan mo.");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to save without a unit", async () => {
    render(<ResponderField initial={{ name: null, unit: null, barangay: null }} />);
    await userEvent.type(screen.getByLabelText("Pangalan"), "Ana Reyes");
    await userEvent.click(screen.getByRole("button", { name: "I-save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pumili ng unit.");
  });

  it("writes name, unit and barangay to the caller's own profile", async () => {
    render(<ResponderField initial={{ name: null, unit: null, barangay: null }} />);
    await userEvent.type(screen.getByLabelText("Pangalan"), "Ana Reyes");
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "bfp");
    await userEvent.selectOptions(await screen.findByLabelText("Barangay"), "Malanday");
    await userEvent.click(screen.getByRole("button", { name: "I-save" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        display_name: "Ana Reyes",
        responder_unit: "bfp",
        responder_barangay: "Malanday",
      }),
    );
    expect(eq).toHaveBeenCalledWith("id", "u-1");
    expect(await screen.findByText("Naka-save.")).toBeInTheDocument();
  });

  it("treats the placeholder name as empty", () => {
    // Every profile reads 'Anonymous' because nothing has ever written the
    // column. Pre-filling that word would put a name in somebody's mouth.
    render(<ResponderField initial={{ name: "Anonymous", unit: null, barangay: null }} />);
    expect(screen.getByLabelText("Pangalan")).toHaveValue("");
  });

  it("says so when the person is already registered", () => {
    render(<ResponderField initial={{ name: "Ben Cruz", unit: "police", barangay: "Nangka" }} />);
    expect(screen.getByText("Nakarehistro ka bilang responder.")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit")).toHaveValue("police");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ResponderField.test.tsx`
Expected: FAIL — cannot find module `./ResponderField`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/ResponderField.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RESPONDER_UNITS, isResponderUnit, unitLabel, type ResponderUnit } from "@/lib/responder/types";
import { useCopy } from "@/lib/i18n/context";

/**
 * Saying you are a responder.
 *
 * Three fields on the caller's own profile: a name, a unit, a barangay. Set
 * them and the master admin's roster lists you; leave them and you are an
 * ordinary user. There is no approval step - this is a demonstration build,
 * and the vetting that a real deployment would put here is an operational
 * question about that deployment, not a design question about this one.
 *
 * The name is `profiles.display_name`, which every row has carried as the
 * literal 'Anonymous' since 0001 because nothing wrote it. It is treated as
 * empty here, never shown as a name.
 */

/** The database's own placeholder, from handle_new_user() in 0001. */
const PLACEHOLDER_NAME = "Anonymous";

interface ResponderFieldProps {
  initial: { name: string | null; unit: string | null; barangay: string | null };
}

type Stage = "idle" | "saving" | "saved" | "needs_name" | "needs_unit" | "failed";

export function ResponderField({ initial }: ResponderFieldProps) {
  const copy = useCopy();
  const [name, setName] = useState(
    initial.name && initial.name !== PLACEHOLDER_NAME ? initial.name : "",
  );
  const [unit, setUnit] = useState<ResponderUnit | "">(
    isResponderUnit(initial.unit) ? initial.unit : "",
  );
  const [barangay, setBarangay] = useState(initial.barangay ?? "");
  const [barangays, setBarangays] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const registered = isResponderUnit(initial.unit);

  useEffect(() => {
    let cancelled = false;
    // Public reference data (0009). Loaded once; there are under a hundred.
    void createClient()
      .from("barangays")
      .select("name")
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setBarangays(((data as { name: string }[]) ?? []).map((b) => b.name));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    if (name.trim() === "") {
      setStage("needs_name");
      return;
    }
    if (unit === "") {
      setStage("needs_unit");
      return;
    }

    setStage("saving");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStage("failed");
      return;
    }

    // Own row only: the update grant is column-scoped (0032 §3) and the
    // policy is id = auth.uid(), so this can never touch anybody else.
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim(),
        responder_unit: unit,
        responder_barangay: barangay === "" ? null : barangay,
      })
      .eq("id", auth.user.id);

    setStage(error ? "failed" : "saved");
  }, [name, unit, barangay]);

  return (
    <section className="phone-card">
      <h2 className="my-reports-title" style={{ marginTop: 0 }}>
        {copy.board.responderTitle}
      </h2>
      <p className="phone-note">{copy.board.responderNote}</p>
      {registered && <p className="phone-note">{copy.board.responderRegistered}</p>}

      <label className="field">
        <span className="field-label">{copy.board.responderName}</span>
        <input
          className="field-input"
          type="text"
          autoComplete="name"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setStage("idle");
          }}
        />
      </label>

      <label className="field">
        <span className="field-label">{copy.board.responderUnit}</span>
        <select
          className="field-input"
          value={unit}
          onChange={(e) => {
            setUnit(isResponderUnit(e.target.value) ? e.target.value : "");
            setStage("idle");
          }}
        >
          <option value="">{copy.board.responderChoose}</option>
          {RESPONDER_UNITS.map((u) => (
            <option key={u} value={u}>
              {unitLabel(u, copy.board)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">{copy.board.responderBarangay}</span>
        <select
          className="field-input"
          value={barangay}
          onChange={(e) => {
            setBarangay(e.target.value);
            setStage("idle");
          }}
        >
          <option value="">{copy.board.responderChoose}</option>
          {barangays.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="btn btn-quiet"
        disabled={stage === "saving"}
        onClick={() => void save()}
      >
        {stage === "saving" ? copy.board.responderSaving : copy.board.responderSave}
      </button>

      {stage === "needs_name" && <p className="alert" role="alert">{copy.board.responderNeedsName}</p>}
      {stage === "needs_unit" && <p className="alert" role="alert">{copy.board.responderNeedsUnit}</p>}
      {stage === "failed" && <p className="alert" role="alert">{copy.board.responderFailed}</p>}
      {stage === "saved" && <p className="phone-note">{copy.board.responderSaved}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/ResponderField.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Put it on /ako**

In `src/app/ako/page.tsx`:

1. `import { ResponderField } from "@/components/ResponderField";`
2. Add state `const [responder, setResponder] = useState<{ name: string | null; unit: string | null; barangay: string | null } | null>(null);`
3. In `load`, change the profile select to
   `.select("phone, display_name, responder_unit, responder_barangay")` and
   after the phone line add:
   ```tsx
   setResponder({
     name: (profile?.display_name as string | null) ?? null,
     unit: (profile?.responder_unit as string | null) ?? null,
     barangay: (profile?.responder_barangay as string | null) ?? null,
   });
   ```
4. In the `ready` branch, directly after `<PhoneField ... />` and before the
   reports heading, and **only when the session is not anonymous** (an
   anonymous SOS sender has no way back in, so a responder registration on
   that account would be lost with the session):
   ```tsx
   {!anonymous && responder && <ResponderField initial={responder} />}
   ```

- [ ] **Step 6: Typecheck and look**

Run: `npx tsc --noEmit && npx vitest run src/app src/components`
Expected: clean.

Drive it: sign in with an email account, open `/ako`, the Responder card sits
under the phone card. Save with no name -> the alert; fill all three -> "Naka-
save."; reload -> the fields come back filled and "Nakarehistro ka bilang
responder." shows. In Supabase Studio, `profiles` shows the row. Switch to
English, reload, every label changes.

- [ ] **Step 7: Commit**

```bash
git add src/components/ResponderField.tsx src/components/ResponderField.test.tsx src/app/ako/page.tsx
git commit -m "feat: a signed-in person can register as a responder on /ako"
```

---
### Task 5: Migration 0033 — the board's two functions

**Files:**
- Create: `supabase/migrations/0033_board.sql`
- Test: `tests/integration/board.test.ts`

**Interfaces:**
- Consumes: `is_master_admin()`, `assignments`, `depth_reports.triage_state`
  (0032); `sos_signals.hazard_type` (0028)
- Produces: `board_rows()` returning the `BoardRow` shape from Task 2;
  `board_graph() returns jsonb` of shape
  `{hours: [{hour, hazard, count}], barangays: [{barangay, count}]}`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0033_board.sql
--
-- The master admin's board, and the graph above it.
--
-- Two definer functions, both master-admin-only, both raising rather than
-- returning empty so the page can say "not for you" instead of drawing four
-- empty columns. The tables stay separate underneath: an SOS carries
-- anonymity, a trust score, an environmental snapshot and the one-active-
-- signal rule, none of which belong on an observation. Only the SHAPE is
-- unified, here, for one screen.

-- 1. board_rows ---------------------------------------------------------------
--
-- The four columns, derived:
--
--   SOS   pending/under_review -> needs_checking; confirmed -> needs_attention;
--         dismissed -> not_true (last 48h); resolved -> not on the board.
--   Report triage_state, except that a report the reporter hid themselves
--         (status hidden, triage still needs_checking) is not on the board -
--         that was their choice about their own pin, not a judgement.
--   Either kind with an OPEN ASSIGNMENT -> assigned, whatever the state
--         above, unless it is not_true (dismissing closes assignments, so
--         that combination cannot persist).
--
-- Within a column: SOS above reports (a person asking for help outranks an
-- observation), then severity worst first, then newest first. SOS rows have
-- no severity, and `nulls first` is what puts them on top.
--
-- 200 rows per column. reports_near and the queues carry no LIMIT and
-- PostgREST truncates at 1000 silently; this one says its cap out loud.
create function board_rows()
returns table (
  kind           text,
  id             uuid,
  board_column   text,
  hazard_type    hazard_type,
  severity       smallint,
  depth          depth_level,
  barangay       text,
  status         text,
  trust_score    integer,
  confidence     text,
  created_at     timestamptz,
  assignment_id  uuid,
  responder_name text,
  responder_unit responder_unit
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not is_master_admin() then
    raise exception 'the board is for the master admin only' using errcode = '42501';
  end if;

  return query
  with open_assignment as (
    -- The newest open assignment per record, if several people are on it.
    -- The card shows one name; the others are still in the table.
    select distinct on (coalesce(a.incident_id, a.sos_id))
           coalesce(a.incident_id, a.sos_id) as target_id,
           a.id                              as oa_id,
           p.display_name                    as oa_name,
           p.responder_unit                  as oa_unit
      from assignments a
      join profiles p on p.id = a.responder_id
     where a.closed_at is null
     order by coalesce(a.incident_id, a.sos_id), a.assigned_at desc
  ),
  placed as (
    select 'sos'::text as k,
           s.id        as rid,
           case
             when oa.oa_id is not null and s.status in ('pending', 'under_review', 'confirmed')
                                                     then 'assigned'
             when s.status in ('pending', 'under_review') then 'needs_checking'
             when s.status = 'confirmed'                 then 'needs_attention'
             when s.status = 'dismissed'                 then 'not_true'
           end                          as col,
           s.hazard_type                as hz,
           null::smallint               as sev,
           s.depth                      as dp,
           s.barangay                   as bgy,
           s.status::text               as st,
           s.trust_score                as ts,
           s.confidence                 as cf,
           s.created_at                 as happened_at,
           oa.oa_id, oa.oa_name, oa.oa_unit
      from sos_signals s
      left join open_assignment oa on oa.target_id = s.id
     where s.status <> 'resolved'
       and (s.status <> 'dismissed' or s.created_at > now() - interval '48 hours')
    union all
    select 'report',
           r.id,
           case
             when oa.oa_id is not null and r.status <> 'hidden' then 'assigned'
             when r.triage_state = 'not_true'                    then 'not_true'
             when r.status = 'hidden'                            then null
             when r.triage_state = 'needs_attention'             then 'needs_attention'
             else                                                     'needs_checking'
           end,
           r.hazard_type,
           r.severity,
           r.depth,
           r.barangay,
           r.status,
           null::integer,
           null::text,
           r.reported_at,
           oa.oa_id, oa.oa_name, oa.oa_unit
      from depth_reports r
      left join open_assignment oa on oa.target_id = r.id
     where (r.status <> 'hidden' or r.triage_state = 'not_true')
       and (r.triage_state <> 'not_true' or r.reported_at > now() - interval '48 hours')
  ),
  ranked as (
    select p.*,
           row_number() over (
             partition by p.col
             order by (p.k = 'sos') desc, p.sev desc nulls first, p.happened_at desc
           ) as rn
      from placed p
     where p.col is not null
  )
  select rk.k, rk.rid, rk.col, rk.hz, rk.sev, rk.dp, rk.bgy, rk.st, rk.ts, rk.cf,
         rk.happened_at, rk.oa_id, rk.oa_name, rk.oa_unit
    from ranked rk
   where rk.rn <= 200
   order by rk.col, rk.rn;
end;
$fn$;

revoke execute on function board_rows() from public, anon;
grant  execute on function board_rows() to authenticated;

-- 2. board_graph --------------------------------------------------------------
--
-- Pre-bucketed counts, so no raw incident row travels to the browser to be
-- counted there. Reports and SOS together, because the question the graph
-- answers is about pressure on the city, not about source. Every status is
-- counted - a dismissed signal was still a signal somebody sent.
--
-- Hours are truncated in the server's zone (UTC on Supabase); the browser
-- labels them in Manila time. Barangays: the ten worst, ranked.
create function board_graph()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v jsonb;
begin
  if not is_master_admin() then
    raise exception 'the board is for the master admin only' using errcode = '42501';
  end if;

  with recent as (
    select r.reported_at as happened_at, r.hazard_type as hz, r.barangay as bgy
      from depth_reports r
     where r.reported_at > now() - interval '48 hours'
    union all
    select s.created_at, s.hazard_type, s.barangay
      from sos_signals s
     where s.created_at > now() - interval '48 hours'
  ),
  hours as (
    select date_trunc('hour', happened_at) as hour, hz, count(*) as n
      from recent
     group by 1, 2
  ),
  bgys as (
    select bgy, count(*) as n
      from recent
     where bgy is not null
     group by 1
     order by 2 desc, 1
     limit 10
  )
  select jsonb_build_object(
    'hours', coalesce(
      (select jsonb_agg(jsonb_build_object('hour', h.hour, 'hazard', h.hz, 'count', h.n)
                        order by h.hour)
         from hours h),
      '[]'::jsonb),
    'barangays', coalesce(
      (select jsonb_agg(jsonb_build_object('barangay', b.bgy, 'count', b.n)
                        order by b.n desc, b.bgy)
         from bgys b),
      '[]'::jsonb)
  ) into v;

  return v;
end;
$fn$;

revoke execute on function board_graph() from public, anon;
grant  execute on function board_graph() to authenticated;
```

- [ ] **Step 2: Apply it locally**

Run: `npx supabase migration up --local`
Expected: `Applying migration 0033_board.sql...` with no error.

- [ ] **Step 3: Write the failing test**

```typescript
// tests/integration/board.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * One shape for two tables, and the four columns derived from state.
 *
 * Most of these are about placement: which column a record lands in given
 * its status, its triage state and whether somebody is assigned. The
 * remaining few are about who may look, and about the graph being counts
 * rather than rows.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const masterClient = createClient(url, anonKey, opts);
const adminClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";

let responderId: string;
let reporterId: string;

interface Row {
  kind: "sos" | "report";
  id: string;
  board_column: string;
  hazard_type: string | null;
  severity: number | null;
  responder_name: string | null;
  responder_unit: string | null;
}

async function makeUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user!.id, email };
}

async function newReport(row: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({ reporter_id: reporterId, location: MALANDAY, hazard_type: "fire", severity: 2, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function newSignal(row: Record<string, unknown> = {}): Promise<string> {
  const reporter = await makeUser("sig");
  const { data, error } = await admin
    .from("sos_signals")
    .insert({ reporter_id: reporter.id, location: MALANDAY, photo_path: `${reporter.id}/x.jpg`, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function board(): Promise<Row[]> {
  const { data, error } = await masterClient.rpc("board_rows");
  if (error) throw error;
  return data as Row[];
}

async function placement(id: string): Promise<string | undefined> {
  return (await board()).find((r) => r.id === id)?.board_column;
}

beforeAll(async () => {
  const master = await makeUser("master");
  const a = await makeUser("admin");
  const resp = await makeUser("responder");
  const r = await makeUser("reporter");
  responderId = resp.id;
  reporterId = r.id;

  await admin.from("moderators").insert([
    { user_id: master.id, barangay: HOME, role: "master_admin" },
    { user_id: a.id, barangay: HOME, role: "admin" },
  ]);
  await admin
    .from("profiles")
    .update({ display_name: "Cora Dizon", responder_unit: "medical" })
    .eq("id", responderId);

  for (const [client, user] of [[masterClient, master], [adminClient, a]] as const) {
    const { error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
    if (error) throw error;
  }
});

describe("who may look", () => {
  it("refuses an admin, with an error rather than an empty board", async () => {
    const { error } = await adminClient.rpc("board_rows");
    expect(error).not.toBeNull();
    const graph = await adminClient.rpc("board_graph");
    expect(graph.error).not.toBeNull();
  });

  it("refuses anon at the grant layer", async () => {
    const { error } = await createClient(url, anonKey, opts).rpc("board_rows");
    expect(error).not.toBeNull();
  });
});

describe("where an SOS lands", () => {
  it("pending -> needs_checking", async () => {
    const id = await newSignal();
    expect(await placement(id)).toBe("needs_checking");
  });

  it("confirmed -> needs_attention", async () => {
    const id = await newSignal();
    await masterClient.rpc("decide_sos", { signal_id: id, decision: "confirmed" });
    expect(await placement(id)).toBe("needs_attention");
  });

  it("dismissed -> not_true", async () => {
    const id = await newSignal();
    await masterClient.rpc("decide_sos", { signal_id: id, decision: "dismissed", reason: "duplicate" });
    expect(await placement(id)).toBe("not_true");
  });

  it("assigned -> assigned, carrying the responder's name and unit", async () => {
    const id = await newSignal();
    await masterClient.rpc("assign_responder", { p_incident_id: null, p_sos_id: id, p_responder_id: responderId });
    const row = (await board()).find((r) => r.id === id)!;
    expect(row.board_column).toBe("assigned");
    expect(row.responder_name).toBe("Cora Dizon");
    expect(row.responder_unit).toBe("medical");
  });

  it("resolved -> not on the board", async () => {
    const id = await newSignal();
    await admin.from("sos_signals").update({ status: "resolved" }).eq("id", id);
    expect(await placement(id)).toBeUndefined();
  });
});

describe("where a report lands", () => {
  it("new -> needs_checking, with its hazard and severity", async () => {
    const id = await newReport();
    const row = (await board()).find((r) => r.id === id)!;
    expect(row.board_column).toBe("needs_checking");
    expect(row.hazard_type).toBe("fire");
    expect(row.severity).toBe(2);
  });

  it("flagged is still needs_checking", async () => {
    const id = await newReport({ status: "flagged" });
    expect(await placement(id)).toBe("needs_checking");
  });

  it("confirmed -> needs_attention", async () => {
    const id = await newReport();
    await masterClient.rpc("decide_report", { p_report_id: id, p_decision: "confirm" });
    expect(await placement(id)).toBe("needs_attention");
  });

  it("hidden by a moderator -> not_true", async () => {
    const id = await newReport();
    await masterClient.rpc("decide_report", { p_report_id: id, p_decision: "hide", p_reason: "wrong_place" });
    expect(await placement(id)).toBe("not_true");
  });

  it("hidden by its own reporter -> not on the board", async () => {
    // Their choice about their own pin, not a judgement that it was false.
    const id = await newReport();
    await admin.from("depth_reports").update({ status: "hidden" }).eq("id", id);
    expect(await placement(id)).toBeUndefined();
  });

  it("assigned -> assigned, and falls back to needs_attention when closed", async () => {
    const id = await newReport();
    const { data: assignmentId } = await masterClient.rpc("assign_responder", {
      p_incident_id: id, p_sos_id: null, p_responder_id: responderId,
    });
    expect(await placement(id)).toBe("assigned");
    await masterClient.rpc("close_assignment", { p_assignment_id: assignmentId });
    expect(await placement(id)).toBe("needs_attention");
  });

  it("a medical report is on the board even though it is not on the map", async () => {
    const id = await newReport({ hazard_type: "medical", severity: 3 });
    expect(await placement(id)).toBe("needs_checking");
  });
});

describe("order within a column", () => {
  it("puts an SOS above a report, and a worse report above a milder one", async () => {
    const mild = await newReport({ severity: 1 });
    const bad = await newReport({ severity: 3 });
    const sos = await newSignal();
    const ids = (await board())
      .filter((r) => r.board_column === "needs_checking")
      .map((r) => r.id);
    expect(ids.indexOf(sos)).toBeLessThan(ids.indexOf(bad));
    expect(ids.indexOf(bad)).toBeLessThan(ids.indexOf(mild));
  });
});

describe("the graph", () => {
  it("returns counts by hour and hazard, and a ranked barangay list", async () => {
    await newReport({ hazard_type: "earthquake", severity: 1 });
    const { data, error } = await masterClient.rpc("board_graph");
    expect(error).toBeNull();
    const graph = data as {
      hours: { hour: string; hazard: string | null; count: number }[];
      barangays: { barangay: string; count: number }[];
    };
    expect(graph.hours.some((h) => h.hazard === "earthquake" && h.count >= 1)).toBe(true);
    expect(graph.hours.every((h) => typeof h.hour === "string" && h.count > 0)).toBe(true);
    expect(graph.barangays[0].barangay).toBe(HOME);
    for (let i = 1; i < graph.barangays.length; i++) {
      expect(graph.barangays[i - 1].count).toBeGreaterThanOrEqual(graph.barangays[i].count);
    }
  });

  it("counts an SOS with no chip under a null hazard", async () => {
    await newSignal();
    const { data } = await masterClient.rpc("board_graph");
    const graph = data as { hours: { hazard: string | null; count: number }[] };
    expect(graph.hours.some((h) => h.hazard === null)).toBe(true);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run tests/integration/board.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0033_board.sql tests/integration/board.test.ts
git commit -m "feat: board_rows and board_graph for the master admin"
```

---
### Task 6: The board page — four columns, keyboard moves, reason and responder panels

**Files:**
- Create: `src/app/console/board/page.tsx`, `src/app/console/board/loading.tsx`
- Create: `src/components/board/BoardCard.tsx`, `src/components/board/BoardCard.test.tsx`
- Create: `src/components/board/MovePanel.tsx`, `src/components/board/MovePanel.test.tsx`
- Modify: `src/app/globals.css` — append

**Interfaces:**
- Consumes: `board_rows()` (Task 5); `BoardRow`, `BOARD_COLUMNS`, `movesFrom`,
  `moveNeeds`, `columnLabel`, `groupByColumn` (Task 2); `decideSos`,
  `decideReport`, `assignResponder`, `closeAssignment` (Task 3);
  `DISMISS_REASONS`, `dismissReasonLabel`, `HIDE_REASONS`, `hideReasonLabel`;
  `responder_roster()` (Task 1)
- Produces: `<BoardCard row onMove(to) />` (Task 7 adds drag props);
  `<MovePanel row to roster onCancel onConfirm(reason, responderId) />`;
  `interface RosterEntry {user_id, name, unit, barangay, phone}` exported
  from `MovePanel.tsx`

- [ ] **Step 1: Write the failing component tests**

```tsx
// src/components/board/BoardCard.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardCard } from "./BoardCard";
import type { BoardRow } from "@/lib/board/types";

function row(over: Partial<BoardRow>): BoardRow {
  return {
    kind: "report", id: "r1", board_column: "needs_checking",
    hazard_type: "fire", severity: 2, depth: null, barangay: "Malanday",
    status: "active", trust_score: null, confidence: null,
    created_at: new Date().toISOString(), assignment_id: null,
    responder_name: null, responder_unit: null, ...over,
  };
}

describe("BoardCard", () => {
  it("names a fire by hazard and severity word", () => {
    render(<BoardCard row={row({})} onMove={() => {}} />);
    expect(screen.getByText("Sunog · May apoy sa isang bahay")).toBeInTheDocument();
  });

  it("names a flood by its depth", () => {
    render(<BoardCard row={row({ hazard_type: "flood", depth: "waist", severity: 2 })} onMove={() => {}} />);
    expect(screen.getByText("Hanggang baywang")).toBeInTheDocument();
  });

  it("says an SOS with no chip is unspecified, and shows its score", () => {
    render(
      <BoardCard
        row={row({ kind: "sos", hazard_type: null, severity: null, trust_score: 61, confidence: "medium" })}
        onMove={() => {}}
      />,
    );
    expect(screen.getByText("Hindi tinukoy")).toBeInTheDocument();
    expect(screen.getByText(/medium · 61\/100/)).toBeInTheDocument();
  });

  it("offers exactly the moves allowed from its column, as buttons", async () => {
    const onMove = vi.fn();
    render(<BoardCard row={row({ board_column: "needs_attention" })} onMove={onMove} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["→ Hindi totoo", "→ May nakatalaga"]);
    await userEvent.click(buttons[1]);
    expect(onMove).toHaveBeenCalledWith("assigned");
  });

  it("shows who is on it when assigned, and offers to hand it back", () => {
    render(
      <BoardCard
        row={row({ board_column: "assigned", assignment_id: "a1", responder_name: "Cora Dizon", responder_unit: "medical" })}
        onMove={() => {}}
      />,
    );
    expect(screen.getByText("Nakatalaga kay Cora Dizon · Medikal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "→ Kailangan ng atensyon" })).toBeInTheDocument();
  });

  it("offers nothing from not_true", () => {
    render(<BoardCard row={row({ board_column: "not_true" })} onMove={() => {}} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
```

```tsx
// src/components/board/MovePanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MovePanel } from "./MovePanel";
import type { BoardRow } from "@/lib/board/types";

function row(over: Partial<BoardRow>): BoardRow {
  return {
    kind: "report", id: "r1", board_column: "needs_checking",
    hazard_type: "fire", severity: 2, depth: null, barangay: "Malanday",
    status: "active", trust_score: null, confidence: null,
    created_at: new Date().toISOString(), assignment_id: null,
    responder_name: null, responder_unit: null, ...over,
  };
}

const roster = [
  { user_id: "u1", name: "Ana Reyes", unit: "bfp", barangay: "Malanday", phone: "+639171234567" },
  { user_id: "u2", name: "Ben Cruz", unit: "police", barangay: null, phone: null },
];

describe("MovePanel to not_true", () => {
  it("asks for a report reason from the hide vocabulary and refuses without one", async () => {
    const onConfirm = vi.fn();
    render(<MovePanel row={row({})} to="not_true" roster={[]} onCancel={() => {}} onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Bakit hindi totoo?");
    const confirm = screen.getByRole("button", { name: "Ilipat" });
    expect(confirm).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole("combobox"), "stale");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("stale", null);
  });

  it("asks for an SOS reason from the dismiss vocabulary", async () => {
    render(<MovePanel row={row({ kind: "sos" })} to="not_true" roster={[]} onCancel={() => {}} onConfirm={() => {}} />);
    const options = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("false_report");
    expect(options).not.toContain("stale");
  });
});

describe("MovePanel to assigned", () => {
  it("lists the roster and confirms with the chosen person", async () => {
    const onConfirm = vi.fn();
    render(<MovePanel row={row({})} to="assigned" roster={roster} onCancel={() => {}} onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Sino ang itatalaga?");
    const confirm = screen.getByRole("button", { name: "Italaga" });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /Ana Reyes/ }));
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(null, "u1");
  });

  it("says so when nobody is registered", () => {
    render(<MovePanel row={row({})} to="assigned" roster={[]} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/Wala pang nakarehistrong responder/)).toBeInTheDocument();
  });

  it("cancels on Escape", async () => {
    const onCancel = vi.fn();
    render(<MovePanel row={row({})} to="assigned" roster={roster} onCancel={onCancel} onConfirm={() => {}} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/board`
Expected: FAIL — cannot find module `./BoardCard`, `./MovePanel`.

- [ ] **Step 3: Write BoardCard**

```tsx
// src/components/board/BoardCard.tsx
"use client";

import Link from "next/link";
import { depthName } from "@/lib/depth/name";
import { hazardName, severityWord } from "@/lib/hazard/name";
import { HazardIcon } from "@/components/HazardIcon";
import { movesFrom, columnLabel, type BoardColumn, type BoardRow } from "@/lib/board/types";
import { unitLabel } from "@/lib/responder/types";
import { timestampLabel } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

/**
 * One record on the board.
 *
 * Icon says what, the severity word says how bad, the pill says which kind
 * of record. The buttons at the bottom are the keyboard-reachable form of
 * every drag the card allows - an accessibility requirement, not a phone
 * one. They are the same moves in the same order as `movesFrom`, so a
 * reader who cannot drag loses nothing.
 */
export function BoardCard({
  row,
  onMove,
}: {
  row: BoardRow;
  onMove: (to: BoardColumn) => void;
}) {
  const copy = useCopy();

  const what =
    row.hazard_type === null
      ? copy.board.unspecifiedHazard
      : row.hazard_type === "flood"
        ? row.depth !== null
          ? depthName(row.depth, copy.map)
          : hazardName("flood", copy.hazard)
        : row.severity !== null
          ? `${hazardName(row.hazard_type, copy.hazard)} · ${severityWord(row.hazard_type, row.severity, copy.hazard)}`
          : hazardName(row.hazard_type, copy.hazard);

  const trust =
    row.kind === "sos"
      ? row.trust_score !== null
        ? `${row.confidence} · ${row.trust_score}/100`
        : copy.screens.signalUnscored
      : null;

  return (
    <article className="board-card" data-kind={row.kind} data-severity={row.severity ?? "sos"}>
      <div className="board-card-head">
        <span className="report-band" data-band={row.kind === "sos" ? "urgent" : "routine"}>
          {row.kind === "sos" ? copy.board.kindSos : copy.board.kindReport}
        </span>
        {row.hazard_type && <HazardIcon hazard={row.hazard_type} size="sm" />}
        <strong className="board-card-title">{what}</strong>
      </div>

      <p className="board-card-meta">
        {row.barangay ?? copy.screens.signalNoBarangay} ·{" "}
        {timestampLabel(row.created_at, copy.screens)}
        {trust ? ` · ${trust}` : ""}
      </p>

      {row.responder_name && row.responder_unit && (
        <p className="board-card-meta">
          {copy.board.assignedTo(row.responder_name)} · {unitLabel(row.responder_unit, copy.board)}
        </p>
      )}

      {/* The SOS detail page already exists and the master admin moderates
          everywhere, so it opens. Reports have no page of their own; their
          detail is the queue card on /console. */}
      {row.kind === "sos" && (
        <Link href={`/console/${row.id}`} className="quiet-link board-card-open">
          {copy.board.assignedOpen}
        </Link>
      )}

      <div className="board-moves">
        {movesFrom(row.board_column).map((to) => (
          <button
            key={to}
            type="button"
            className="board-move"
            onClick={() => onMove(to)}
          >
            {copy.board.moveTo(columnLabel(to, copy.board))}
          </button>
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Write MovePanel**

```tsx
// src/components/board/MovePanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { columnLabel, moveNeeds, type BoardColumn, type BoardRow } from "@/lib/board/types";
import { DISMISS_REASONS, dismissReasonLabel } from "@/lib/sos/decision";
import { HIDE_REASONS, hideReasonLabel } from "@/lib/reports/decision";
import { unitLabel, isResponderUnit } from "@/lib/responder/types";
import { formatPhone } from "@/lib/profile/phone";
import { useCopy } from "@/lib/i18n/context";

/** One row of `responder_roster()`. */
export interface RosterEntry {
  user_id: string;
  name: string;
  unit: string;
  barangay: string | null;
  phone: string | null;
}

/**
 * What a move has to ask before it happens.
 *
 * "Hindi totoo" asks for a reason, from the vocabulary that fits the record:
 * dismissing an SOS and hiding a report are different judgements with
 * different words (lib/sos/decision.ts and lib/reports/decision.ts say
 * why). For an SOS this is the path that raises false_report_count and can
 * suspend an account, and a drag must never do that quietly.
 *
 * "May nakatalaga" asks for a person. The column asserts one is on it, so
 * it cannot be entered without choosing.
 */
export function MovePanel({
  row,
  to,
  roster,
  onCancel,
  onConfirm,
}: {
  row: BoardRow;
  to: BoardColumn;
  roster: RosterEntry[];
  onCancel: () => void;
  onConfirm: (reason: string | null, responderId: string | null) => void;
}) {
  const copy = useCopy();
  const need = moveNeeds(to);
  const [reason, setReason] = useState("");
  const [responderId, setResponderId] = useState("");
  const first = useRef<HTMLSelectElement | HTMLInputElement | null>(null);

  useEffect(() => {
    first.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const title = need === "reason" ? copy.board.reasonPrompt : copy.board.pickResponder;
  const ready = need === "reason" ? reason !== "" : responderId !== "";

  return (
    <div className="board-panel" onClick={onCancel}>
      <div
        className="board-panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="board-panel-title" className="sheet-count">
          {title}
        </h2>
        <p className="board-card-meta">
          {row.kind === "sos" ? copy.board.kindSos : copy.board.kindReport} ·{" "}
          {columnLabel(row.board_column, copy.board)} → {columnLabel(to, copy.board)}
        </p>

        {need === "reason" && (
          <label className="field">
            <span className="field-label">
              {row.kind === "sos" ? copy.screens.signalDismissReason : copy.screens.reportHideReason}
            </span>
            <select
              ref={first as React.RefObject<HTMLSelectElement>}
              className="field-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">{copy.screens.signalChoose}</option>
              {row.kind === "sos"
                ? DISMISS_REASONS.map((r) => (
                    <option key={r} value={r}>{dismissReasonLabel(r, copy.screens)}</option>
                  ))
                : HIDE_REASONS.map((r) => (
                    <option key={r} value={r}>{hideReasonLabel(r, copy.screens)}</option>
                  ))}
            </select>
          </label>
        )}

        {need === "responder" && roster.length === 0 && (
          <p className="notice">{copy.board.rosterEmpty}</p>
        )}

        {need === "responder" && roster.length > 0 && (
          <div className="board-roster" role="radiogroup" aria-label={copy.board.pickResponder}>
            {roster.map((entry, i) => (
              <label key={entry.user_id} className="board-roster-row">
                <input
                  ref={i === 0 ? (first as React.RefObject<HTMLInputElement>) : undefined}
                  type="radio"
                  name="responder"
                  value={entry.user_id}
                  checked={responderId === entry.user_id}
                  onChange={() => setResponderId(entry.user_id)}
                />
                <span>
                  <strong>{entry.name}</strong>
                  {" · "}
                  {isResponderUnit(entry.unit) ? unitLabel(entry.unit, copy.board) : entry.unit}
                  {entry.barangay ? ` · ${entry.barangay}` : ""}
                  {entry.phone ? ` · ${formatPhone(entry.phone)}` : ""}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="report-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            {copy.board.cancel}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!ready}
            onClick={() =>
              onConfirm(need === "reason" ? reason : null, need === "responder" ? responderId : null)
            }
          >
            {need === "reason" ? copy.board.reasonConfirm : copy.board.assign}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the component tests**

Run: `npx vitest run src/components/board`
Expected: PASS, 11 tests.

- [ ] **Step 6: Write the page**

```tsx
// src/app/console/board/loading.tsx
import { PageSkeleton } from "@/components/PageSkeleton";

/** A title and four blocks: the columns, before they have anything in them. */
export default function Loading() {
  return <PageSkeleton blocks={4} lede={false} />;
}
```

```tsx
// src/app/console/board/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SimulationBanner } from "@/components/SimulationBanner";
import { BoardCard } from "@/components/board/BoardCard";
import { MovePanel, type RosterEntry } from "@/components/board/MovePanel";
import { decideSos } from "@/app/actions/decide-sos";
import { decideReport } from "@/app/actions/decide-report";
import { assignResponder, closeAssignment } from "@/app/actions/assign";
import {
  BOARD_COLUMNS, columnLabel, groupByColumn, moveNeeds,
  type BoardColumn, type BoardRow,
} from "@/lib/board/types";
import { useCopy } from "@/lib/i18n/context";

type Stage = "loading" | "denied" | "failed" | "ready";

/**
 * The master admin's board. Desktop only.
 *
 * Four columns, reports and SOS signals together, through one definer
 * function that unions the two into one shape. Every move is a button on the
 * card (and, from Task 7, a drag); the two moves that need something first -
 * a reason, a person - open a panel that asks for it.
 *
 * What each move calls is the existing decision function for that kind of
 * record. The board invents no new rule: "Hindi totoo" IS decide_sos
 * dismissed / decide_report hide, with the reputation and suspension
 * consequences those already carry; "Kailangan ng atensyon" IS decide_sos
 * confirmed / decide_report confirm; "May nakatalaga" IS assign_responder.
 */
export default function BoardPage() {
  const copy = useCopy();
  const [stage, setStage] = useState<Stage>("loading");
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [panel, setPanel] = useState<{ row: BoardRow; to: BoardColumn } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await createClient().rpc("board_rows");
    if (loadError) {
      // 42501 is the function's own refusal: not the master admin. Anything
      // else is a failure, and the two must not look the same.
      setStage(loadError.code === "42501" ? "denied" : "failed");
      return;
    }
    setRows((data as BoardRow[]) ?? []);
    setStage("ready");
  }, []);

  useEffect(() => {
    void load();
    const channel = createClient()
      .channel("board")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_signals" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "depth_reports" }, () => void load())
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [load]);

  /** Fetched the first time a responder is needed; the roster is short. */
  async function ensureRoster(): Promise<RosterEntry[]> {
    if (roster) return roster;
    const { data } = await createClient().rpc("responder_roster");
    const list = (data as RosterEntry[]) ?? [];
    setRoster(list);
    return list;
  }

  const perform = useCallback(
    async (row: BoardRow, to: BoardColumn, reason: string | null, responderId: string | null) => {
      setError(null);
      let ok: boolean;

      if (to === "not_true") {
        const result =
          row.kind === "sos"
            ? await decideSos(row.id, "dismissed", reason)
            : await decideReport(row.id, "hide", reason);
        ok = result.ok;
      } else if (to === "needs_attention") {
        // From "assigned" this is the responder being done; from anywhere
        // else it is confirmation.
        const result =
          row.board_column === "assigned" && row.assignment_id
            ? await closeAssignment(row.assignment_id)
            : row.kind === "sos"
              ? await decideSos(row.id, "confirmed", null)
              : await decideReport(row.id, "confirm", null);
        ok = result.ok;
      } else if (to === "assigned" && responderId) {
        const result = await assignResponder({ kind: row.kind, id: row.id }, responderId);
        ok = result.ok;
      } else {
        ok = false;
      }

      if (!ok) {
        setError(copy.board.moveFailed);
        return;
      }
      setPanel(null);
      await load();
    },
    [copy.board.moveFailed, load],
  );

  const move = useCallback(
    async (row: BoardRow, to: BoardColumn) => {
      const need = moveNeeds(to);
      if (need === "responder") await ensureRoster();
      if (need) {
        setPanel({ row, to });
        return;
      }
      await perform(row, to, null, null);
    },
    // ensureRoster reads `roster` state; listing it keeps the closure fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perform, roster],
  );

  const grouped = groupByColumn(rows);

  return (
    <>
      <SimulationBanner />
      <main className="board-page">
        <header className="board-head">
          <h1 className="task-title">{copy.board.title}</h1>
          <Link href="/console" className="quiet-link">{copy.board.backToConsole}</Link>
        </header>

        <p className="board-narrow">{copy.board.desktopOnly}</p>

        {stage === "loading" && <p className="task-lede">{copy.board.loading}</p>}
        {stage === "denied" && <p className="task-lede">{copy.board.noAccess}</p>}
        {stage === "failed" && (
          <p className="alert">
            {copy.board.loadFailed}{" "}
            <button type="button" className="btn btn-quiet" onClick={() => void load()}>
              {copy.map.retry}
            </button>
          </p>
        )}

        {error && <p className="alert" role="alert">{error}</p>}

        {stage === "ready" && (
          <div className="board-columns">
            {BOARD_COLUMNS.map((column) => (
              <section key={column} className="board-column" data-column={column}>
                <h2 className="board-column-title">
                  {columnLabel(column, copy.board)}
                  <span className="console-tab-count">{grouped[column].length}</span>
                </h2>
                {grouped[column].length === 0 && (
                  <p className="board-card-meta">{copy.board.columnEmpty}</p>
                )}
                {grouped[column].map((row) => (
                  <BoardCard key={`${row.kind}:${row.id}`} row={row} onMove={(to) => void move(row, to)} />
                ))}
              </section>
            ))}
          </div>
        )}

        {panel && (
          <MovePanel
            row={panel.row}
            to={panel.to}
            roster={roster ?? []}
            onCancel={() => setPanel(null)}
            onConfirm={(reason, responderId) => void perform(panel.row, panel.to, reason, responderId)}
          />
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 7: The stylesheet**

Append to `src/app/globals.css`:

```css
/* ---- The master admin's board ---------------------------------------------
   Desktop only. Four columns side by side is the whole point; under 900px
   the columns are hidden and the page says so, rather than stacking four
   lists into a scroll nobody could triage from. */
.board-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 20px 20px calc(48px + var(--tabbar-total));
}

.board-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.board-narrow { display: none; }

.board-columns {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
  align-items: start;
}

.board-column {
  background: var(--raised);
  border-radius: var(--radius-control);
  padding: 10px;
  min-height: 240px;
}

.board-column[data-over="true"] {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.board-column-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

/* A card, unlike the queue rows, because a card is a thing you drag. The
   left edge carries severity from the depth palette, and the SOS colour is
   the danger red - a person asking for help, not a reading. */
.board-card {
  background: var(--ground);
  border: 1px solid var(--line);
  border-left-width: 4px;
  border-radius: var(--radius-control);
  padding: 10px 12px;
  margin-bottom: 8px;
}

.board-card[data-severity="1"]   { border-left-color: var(--depth-ankle); }
.board-card[data-severity="2"]   { border-left-color: var(--depth-waist); }
.board-card[data-severity="3"]   { border-left-color: var(--depth-above-head); }
.board-card[data-severity="sos"] { border-left-color: var(--danger); }

.board-card[draggable="true"] { cursor: grab; }
.board-card[data-dragging="true"] { opacity: 0.5; }

.board-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.board-card-title { font-size: 15px; }

.board-card-meta {
  margin: 4px 0 0;
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.4;
}

.board-card-open {
  display: inline-block;
  margin-top: 6px;
  font-size: 13px;
}

.board-moves {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.board-move {
  appearance: none;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
}

.board-move:hover { border-color: var(--ink-muted); }

/* The reason / responder panel. A dialog rather than an inline expansion
   because it interrupts a drag, and the interruption is the point. */
.board-panel {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.board-panel-card {
  background: var(--ground);
  border-radius: var(--radius-control);
  padding: 20px;
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
}

.board-roster {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

.board-roster-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 15px;
  cursor: pointer;
}

@media (max-width: 899px) {
  .board-columns, .board-graph { display: none; }
  .board-narrow { display: block; margin-top: 12px; color: var(--ink-muted); }
}
```

- [ ] **Step 8: Typecheck, then drive it end to end**

Run: `npx tsc --noEmit && npx vitest run src`
Expected: clean.

Then in a desktop browser, signed in as the master admin from Task 3:

1. `/console` -> "Buksan ang board" -> four columns with counts. Seed a few
   records if the board is empty: file a fire report at `/report` from a
   second account, and send an SOS from `/sos` (a real photo is required;
   use the laptop camera).
2. On a *Kailangang suriin* card: "→ Kailangan ng atensyon" moves it. The
   same report in `/console` -> Mga report now wears "Kumpirmado".
3. "→ May nakatalaga" on it: the panel lists the responder registered in
   Task 4 with unit and number; nothing chosen -> Italaga disabled; choose
   -> the card is in the fourth column with "Nakatalaga kay …". Sign in as
   that responder in another browser: `/console` opens on their tab with
   the card.
4. "→ Hindi totoo" on an SOS: the panel's reasons are the SOS four; choose
   "Hindi totoo"; the card moves; in Studio, `signal_events` has the
   decision row and `reputation` moved. On a report, the reasons are the
   hide four.
5. On an assigned card, "→ Kailangan ng atensyon": the responder's tab
   loses the card; the board card is back in the third column.
6. Sign in as an admin (not master): `/console/board` says
   `copy.board.noAccess`.
7. Narrow the window under 900px: columns disappear, the sentence appears.
8. English: every label on the board changes, including the column titles
   and the panel.
9. Keyboard only: Tab reaches every "→" button; Enter opens the panel with
   focus on its first control; Escape closes it.

- [ ] **Step 9: Commit**

```bash
git add src/app/console/board src/components/board src/app/globals.css
git commit -m "feat: the master admin's board - four columns, moves, reason and responder panels"
```

---
### Task 7: Dragging a card

**Files:**
- Modify: `src/components/board/BoardCard.tsx`, `BoardCard.test.tsx`
- Modify: `src/app/console/board/page.tsx`

**Interfaces:**
- Consumes: `canMove(from, to)` (Task 2); the `move` callback in the page
- Produces: `<BoardCard row onMove onDragStart onDragEnd dragging />`;
  columns that accept a drop only where `canMove` allows it

Native HTML5 drag-and-drop, no library. Every drop lands on exactly the
same `move()` the buttons call, so a drag can never do something a button
cannot, and the reason/responder panels interrupt it in the same way.

- [ ] **Step 1: Add the failing tests to BoardCard.test.tsx**

```tsx
  it("is draggable, announces what it carries, and reports its lifecycle", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    render(
      <BoardCard row={row({})} onMove={() => {}} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={false} />,
    );
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("draggable", "true");
    const setData = vi.fn();
    fireEvent.dragStart(card, { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith("text/plain", "report:r1");
    expect(onDragStart).toHaveBeenCalled();
    fireEvent.dragEnd(card);
    expect(onDragEnd).toHaveBeenCalled();
  });

  it("is not draggable from not_true, where there is nowhere to go", () => {
    render(<BoardCard row={row({ board_column: "not_true" })} onMove={() => {}} dragging={false} />);
    expect(screen.getByRole("article")).toHaveAttribute("draggable", "false");
  });
```

Add `fireEvent` to the `@testing-library/react` import at the top of the
file.

Run: `npx vitest run src/components/board/BoardCard.test.tsx`
Expected: FAIL — `draggable` attribute absent.

- [ ] **Step 2: Make the card draggable**

In `BoardCard.tsx`, extend the props:

```tsx
export function BoardCard({
  row,
  onMove,
  onDragStart,
  onDragEnd,
  dragging = false,
}: {
  row: BoardRow;
  onMove: (to: BoardColumn) => void;
  /** Task 7: the page tracks which row is in flight. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}) {
```

and replace the opening `<article ...>` with:

```tsx
    <article
      className="board-card"
      data-kind={row.kind}
      data-severity={row.severity ?? "sos"}
      data-dragging={dragging}
      // Nowhere to go from not_true, so nothing to pick up.
      draggable={movesFrom(row.board_column).length > 0}
      onDragStart={(e) => {
        // The payload is for other drop targets and devtools; the page
        // already knows which row this is through onDragStart.
        e.dataTransfer.setData("text/plain", `${row.kind}:${row.id}`);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
    >
```

Run: `npx vitest run src/components/board/BoardCard.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 3: Make the columns drop targets**

In `src/app/console/board/page.tsx`:

1. Import `canMove` from `@/lib/board/types`.
2. Add state:
   ```tsx
   const [dragging, setDragging] = useState<BoardRow | null>(null);
   const [over, setOver] = useState<BoardColumn | null>(null);
   ```
3. Replace the `<section key={column} className="board-column" data-column={column}>`
   opening tag with:
   ```tsx
   <section
     key={column}
     className="board-column"
     data-column={column}
     data-over={over === column}
     onDragOver={(e) => {
       // Only a column the card may move to accepts it. preventDefault is
       // what makes a drop possible at all; withholding it is the refusal.
       if (dragging && canMove(dragging.board_column, column)) {
         e.preventDefault();
         e.dataTransfer.dropEffect = "move";
         if (over !== column) setOver(column);
       }
     }}
     onDragLeave={(e) => {
       // Leaving for a child element fires dragleave too; only clear when
       // the pointer has actually left the column.
       if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
     }}
     onDrop={(e) => {
       e.preventDefault();
       const row = dragging;
       setDragging(null);
       setOver(null);
       if (row && canMove(row.board_column, column)) void move(row, column);
     }}
   >
   ```
4. Pass the drag props to every card:
   ```tsx
   <BoardCard
     key={`${row.kind}:${row.id}`}
     row={row}
     onMove={(to) => void move(row, to)}
     onDragStart={() => setDragging(row)}
     onDragEnd={() => {
       setDragging(null);
       setOver(null);
     }}
     dragging={dragging?.id === row.id && dragging.kind === row.kind}
   />
   ```

- [ ] **Step 4: Typecheck and drive it**

Run: `npx tsc --noEmit && npx vitest run src/components/board`
Expected: clean, 13 tests.

In the browser as the master admin:

1. Drag a *Kailangang suriin* card over *Hindi totoo*: the column outlines
   in the accent colour; drop -> the reason panel opens; cancel -> the card
   is where it was; drop again, choose a reason -> it moves.
2. Drag the same kind of card over *Kailangang suriin* (its own column):
   no outline, the drop is refused (the cursor shows the not-allowed
   glyph).
3. Drag a *Hindi totoo* card: it does not pick up.
4. Drag onto *May nakatalaga*: the responder panel opens; Escape cancels.
5. Drag an assigned card onto *Kailangan ng atensyon*: the assignment
   closes; the responder's `/console` tab loses it.
6. Every one of those, done with the buttons instead, gives the same result.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/BoardCard.tsx src/components/board/BoardCard.test.tsx src/app/console/board/page.tsx
git commit -m "feat: drag a card between board columns, refused where the buttons would be"
```

---
### Task 8: The graph — two SVG panels above the board

**Files:**
- Create: `src/lib/board/graph.ts`, `src/lib/board/graph.test.ts`
- Create: `src/components/board/TrendChart.tsx`, `src/components/board/TrendChart.test.tsx`
- Create: `src/components/board/BarangayRanking.tsx`
- Modify: `src/app/console/board/page.tsx`
- Modify: `src/app/globals.css` — append

**Interfaces:**
- Consumes: `board_graph()` (Task 5); `HAZARDS`, `HazardType`; `hazardName`;
  `clockTime`; `copy.board.graph*`, `copy.board.unspecifiedHazard`
- Produces: `interface HourBucket {hour: string; hazard: HazardType | null;
  count: number}`, `interface BarangayBucket {barangay: string; count:
  number}`, `interface BoardGraph {hours: HourBucket[]; barangays:
  BarangayBucket[]}`, `interface HourColumn {hour: Date; total: number;
  segments: {hazard: HazardType | null; count: number}[]}`,
  `hourColumns(buckets, now?, hours?): HourColumn[]`,
  `HAZARD_CHART_HEX: Record<HazardType, string>`, `UNSPECIFIED_HEX`,
  `chartColour(hazard: HazardType | null): string`;
  `<TrendChart graph />`, `<BarangayRanking graph />`

Palette, validated with the dataviz skill's `validate_palette.js` on the
app's white surface in light mode - all six checks pass for the six hazards
in `HAZARDS` order. The seventh colour, for an SOS with no chip, is a
deliberately low-chroma slate that reads as "unknown"; it is adjacent only
to `other` in the stack. Colour carries hazard on this chart and nowhere
else in Antas.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/board/graph.test.ts
import { describe, it, expect } from "vitest";
import { hourColumns, chartColour, HAZARD_CHART_HEX, UNSPECIFIED_HEX } from "./graph";
import { HAZARDS } from "@/lib/hazard/types";

const NOW = new Date("2026-08-28T10:30:00Z");

describe("hourColumns", () => {
  it("returns one column per hour for the window, ending at the current hour", () => {
    const cols = hourColumns([], NOW, 48);
    expect(cols).toHaveLength(48);
    expect(cols[47].hour.toISOString()).toBe("2026-08-28T10:00:00.000Z");
    expect(cols[0].hour.toISOString()).toBe("2026-08-26T11:00:00.000Z");
    expect(cols.every((c) => c.total === 0 && c.segments.length === 0)).toBe(true);
  });

  it("places a bucket in its hour and stacks hazards in HAZARDS order, unspecified last", () => {
    const cols = hourColumns(
      [
        { hour: "2026-08-28T10:00:00+00:00", hazard: null, count: 1 },
        { hour: "2026-08-28T10:00:00+00:00", hazard: "fire", count: 2 },
        { hour: "2026-08-28T10:00:00+00:00", hazard: "flood", count: 3 },
      ],
      NOW,
      48,
    );
    const last = cols[47];
    expect(last.total).toBe(6);
    expect(last.segments.map((s) => s.hazard)).toEqual(["flood", "fire", null]);
  });

  it("drops a bucket outside the window rather than throwing", () => {
    const cols = hourColumns([{ hour: "2026-08-20T10:00:00+00:00", hazard: "flood", count: 9 }], NOW, 48);
    expect(cols.reduce((n, c) => n + c.total, 0)).toBe(0);
  });
});

describe("chart colours", () => {
  it("gives every hazard its own hue and the unspecified case a neutral", () => {
    const hexes = HAZARDS.map((h) => HAZARD_CHART_HEX[h]);
    expect(new Set(hexes).size).toBe(HAZARDS.length);
    expect(chartColour(null)).toBe(UNSPECIFIED_HEX);
    expect(chartColour("fire")).toBe(HAZARD_CHART_HEX.fire);
  });
});
```

```tsx
// src/components/board/TrendChart.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

describe("TrendChart", () => {
  it("says so when there is nothing to draw", () => {
    render(<TrendChart graph={{ hours: [], barangays: [] }} />);
    expect(screen.getByText("Walang insidente sa nakaraang 48 oras.")).toBeInTheDocument();
  });

  it("draws one bar per hour with a segment per hazard, and a legend naming each hue", () => {
    const hour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    render(
      <TrendChart
        graph={{
          hours: [
            { hour, hazard: "flood", count: 2 },
            { hour, hazard: "fire", count: 1 },
          ],
          barangays: [],
        }}
      />,
    );
    expect(screen.getAllByTestId("trend-segment")).toHaveLength(2);
    expect(screen.getByText("Baha")).toBeInTheDocument();
    expect(screen.getByText("Sunog")).toBeInTheDocument();
  });

  it("offers the same numbers as a table", () => {
    const hour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    render(<TrendChart graph={{ hours: [{ hour, hazard: "flood", count: 2 }], barangays: [] }} />);
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/board/graph.test.ts src/components/board/TrendChart.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the pure half**

```typescript
// src/lib/board/graph.ts
import { HAZARDS, type HazardType } from "@/lib/hazard/types";

/** What `board_graph()` returns, parsed. */
export interface HourBucket {
  hour: string;
  hazard: HazardType | null;
  count: number;
}

export interface BarangayBucket {
  barangay: string;
  count: number;
}

export interface BoardGraph {
  hours: HourBucket[];
  barangays: BarangayBucket[];
}

/** One bar: an hour, its stacked segments in a fixed order, and the total. */
export interface HourColumn {
  hour: Date;
  total: number;
  segments: { hazard: HazardType | null; count: number }[];
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Colour by hazard, ON THE CHART ONLY.
 *
 * Everywhere else in Antas the icon says what and colour says how bad. A
 * stacked bar cannot carry an icon per segment, so this is the one place a
 * hue means a hazard. Validated with the dataviz skill's checker against the
 * app's white surface: lightness band, chroma floor, adjacent-pair CVD
 * separation, normal-vision floor and contrast all pass for these six in
 * HAZARDS order. Do not reorder HAZARDS without re-running it.
 */
export const HAZARD_CHART_HEX: Readonly<Record<HazardType, string>> = Object.freeze({
  flood: "#0284c7",
  fire: "#ea580c",
  earthquake: "#7c3aed",
  accident: "#ca8a04",
  medical: "#db2777",
  other: "#16a34a",
});

/** An SOS whose sender chose no chip. Deliberately grey: it means "unknown". */
export const UNSPECIFIED_HEX = "#64748b";

export function chartColour(hazard: HazardType | null): string {
  return hazard === null ? UNSPECIFIED_HEX : HAZARD_CHART_HEX[hazard];
}

/** HAZARDS order, then the unspecified bucket last. */
const STACK_ORDER: readonly (HazardType | null)[] = [...HAZARDS, null];

function floorToHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Buckets into a full row of columns, one per hour, gaps filled with zero.
 *
 * The database returns only the hours that had something in them; a chart
 * that draws only those would compress a quiet night into nothing and make
 * two incidents a day apart look adjacent. Every hour is drawn, and an
 * empty one is drawn empty.
 */
export function hourColumns(
  buckets: readonly HourBucket[],
  now: Date = new Date(),
  hours = 48,
): HourColumn[] {
  const end = floorToHour(now).getTime();
  const start = end - (hours - 1) * HOUR_MS;

  const byHour = new Map<number, Map<HazardType | null, number>>();
  for (const b of buckets) {
    const t = floorToHour(new Date(b.hour)).getTime();
    if (Number.isNaN(t) || t < start || t > end) continue;
    const row = byHour.get(t) ?? new Map<HazardType | null, number>();
    row.set(b.hazard, (row.get(b.hazard) ?? 0) + b.count);
    byHour.set(t, row);
  }

  return Array.from({ length: hours }, (_, i) => {
    const t = start + i * HOUR_MS;
    const row = byHour.get(t);
    const segments = STACK_ORDER.flatMap((hazard) => {
      const count = row?.get(hazard) ?? 0;
      return count > 0 ? [{ hazard, count }] : [];
    });
    return {
      hour: new Date(t),
      total: segments.reduce((n, s) => n + s.count, 0),
      segments,
    };
  });
}
```

- [ ] **Step 4: Write the two panels**

```tsx
// src/components/board/TrendChart.tsx
"use client";

import { useMemo, useState } from "react";
import { HAZARDS, type HazardType } from "@/lib/hazard/types";
import { hazardName } from "@/lib/hazard/name";
import { chartColour, hourColumns, type BoardGraph } from "@/lib/board/graph";
import { clockTime } from "@/lib/time/relative";
import { useCopy } from "@/lib/i18n/context";

/** Drawing area. The SVG scales to its container; these are unit-space. */
const W = 960;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 28, left: 32 };
const GAP = 2;
const HOURS = 48;

/**
 * Incidents per hour, last 48 hours, stacked by hazard.
 *
 * Hand-written SVG - two panels of this shape are a hundred and fifty lines
 * against a hundred kilobytes of charting library, in an app that must open
 * fast offline on a cheap phone. Thin bars, a 2px gap between stacked
 * segments, a recessive baseline, y ticks at 0 / mid / max, x labels every
 * six hours in Manila time. Hover on a bar shows the hour's breakdown; a
 * table under the chart carries the same numbers for anyone who cannot read
 * the bars, and a legend names every hue because colour is never the only
 * channel.
 */
export function TrendChart({ graph }: { graph: BoardGraph }) {
  const copy = useCopy();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const columns = useMemo(() => hourColumns(graph.hours, new Date(), HOURS), [graph.hours]);
  const max = Math.max(1, ...columns.map((c) => c.total));
  const any = columns.some((c) => c.total > 0);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / HOURS;
  const barW = Math.max(2, slot - GAP);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const present = new Set(graph.hours.map((h) => h.hazard));
  const legend: (HazardType | null)[] = [...HAZARDS.filter((h) => present.has(h)), ...(present.has(null) ? [null] : [])];
  const nameOf = (h: HazardType | null) => (h === null ? copy.board.unspecifiedHazard : hazardName(h, copy.hazard));

  if (!any) {
    return (
      <section className="board-graph-panel">
        <h2 className="board-column-title">{copy.board.graphPerHour}</h2>
        <p className="board-card-meta">{copy.board.graphEmpty}</p>
      </section>
    );
  }

  return (
    <section className="board-graph-panel">
      <h2 className="board-column-title">{copy.board.graphPerHour}</h2>

      <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img" aria-label={copy.board.graphPerHour}>
        {/* y axis: three ticks, recessive. */}
        {[0, Math.ceil(max / 2), max].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={PAD.left - 6} y={y(v) + 4} className="trend-tick" textAnchor="end">{v}</text>
          </g>
        ))}

        {columns.map((col, i) => {
          const x = PAD.left + i * slot;
          let acc = 0;
          const label = i % 6 === 0 ? clockTime(col.hour.toISOString()) : null;
          return (
            <g
              key={col.hour.getTime()}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* Hit target wider than the bar, so a thin bar is still hoverable. */}
              <rect x={x} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {col.segments.map((s) => {
                const y1 = y(acc + s.count);
                const y0 = y(acc);
                acc += s.count;
                return (
                  <rect
                    key={String(s.hazard)}
                    data-testid="trend-segment"
                    x={x + GAP / 2}
                    y={y1}
                    width={barW}
                    height={Math.max(0, y0 - y1 - GAP)}
                    rx={2}
                    fill={chartColour(s.hazard)}
                  />
                );
              })}
              {label && (
                <text x={x + slot / 2} y={H - 8} className="trend-tick" textAnchor="middle">{label}</text>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && columns[hover].total > 0 && (
        <p className="board-card-meta trend-tooltip" role="status">
          {clockTime(columns[hover].hour.toISOString())} ·{" "}
          {columns[hover].segments.map((s) => `${nameOf(s.hazard)} ${s.count}`).join(" · ")}
        </p>
      )}

      <ul className="trend-legend" aria-label={copy.board.graphPerHour}>
        {legend.map((h) => (
          <li key={String(h)}>
            <span className="trend-swatch" style={{ background: chartColour(h) }} aria-hidden="true" />
            {nameOf(h)}
          </li>
        ))}
      </ul>

      <button type="button" className="quiet-link" onClick={() => setTable((t) => !t)}>
        {copy.board.graphTable}
      </button>
      <table className="trend-table" hidden={!table}>
        <thead>
          <tr>
            <th>{copy.board.graphHour}</th>
            {legend.map((h) => <th key={String(h)}>{nameOf(h)}</th>)}
            <th>{copy.board.graphCount}</th>
          </tr>
        </thead>
        <tbody>
          {columns.filter((c) => c.total > 0).map((c) => (
            <tr key={c.hour.getTime()}>
              <td>{clockTime(c.hour.toISOString())}</td>
              {legend.map((h) => (
                <td key={String(h)}>{c.segments.find((s) => s.hazard === h)?.count ?? 0}</td>
              ))}
              <td>{c.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

```tsx
// src/components/board/BarangayRanking.tsx
"use client";

import type { BoardGraph } from "@/lib/board/graph";
import { useCopy } from "@/lib/i18n/context";

/**
 * The barangays under most pressure in the window, worst first.
 *
 * A ranked list with a proportional bar, not a chart with axes: the
 * question is "where first", and a list answers it in reading order. One
 * hue - magnitude, not identity - and the number printed beside every bar,
 * so the bar is a glance and the number is the fact.
 */
export function BarangayRanking({ graph }: { graph: BoardGraph }) {
  const copy = useCopy();
  const max = Math.max(1, ...graph.barangays.map((b) => b.count));

  return (
    <section className="board-graph-panel">
      <h2 className="board-column-title">{copy.board.graphBarangays}</h2>
      {graph.barangays.length === 0 ? (
        <p className="board-card-meta">{copy.board.graphEmpty}</p>
      ) : (
        <ol className="barangay-ranking">
          {graph.barangays.map((b) => (
            <li key={b.barangay}>
              <span className="barangay-ranking-name">{b.barangay}</span>
              <span className="barangay-ranking-bar" aria-hidden="true">
                <span style={{ width: `${(b.count / max) * 100}%` }} />
              </span>
              <span className="barangay-ranking-count">{b.count}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Wire the page and style it**

In `src/app/console/board/page.tsx`:

1. Import `TrendChart`, `BarangayRanking`, and `type BoardGraph` from
   `@/lib/board/graph`.
2. State: `const [graph, setGraph] = useState<BoardGraph | null>(null);`
3. In `load`, fetch both in one round: replace the single `rpc("board_rows")`
   with
   ```tsx
   const supabase = createClient();
   const [rowsResult, graphResult] = await Promise.all([
     supabase.rpc("board_rows"),
     supabase.rpc("board_graph"),
   ]);
   ```
   keep the error handling on `rowsResult.error`, then
   `setGraph((graphResult.data as BoardGraph | null) ?? { hours: [], barangays: [] });`
   before `setStage("ready")`.
4. Render, inside `stage === "ready"` and **before** `.board-columns`:
   ```tsx
   {graph && (
     <div className="board-graph">
       <h2 className="sheet-count">{copy.board.graphTitle}</h2>
       <div className="board-graph-panels">
         <TrendChart graph={graph} />
         <BarangayRanking graph={graph} />
       </div>
     </div>
   )}
   ```

Append to `globals.css`:

```css
/* ---- The graph above the board ------------------------------------------ */
.board-graph { margin-top: 16px; }

.board-graph-panels {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
  margin-top: 8px;
}

.board-graph-panel {
  background: var(--raised);
  border-radius: var(--radius-control);
  padding: 10px 12px;
}

.trend-chart { width: 100%; height: auto; display: block; }
.trend-grid { stroke: var(--line); stroke-width: 1; }
.trend-tick { fill: var(--ink-muted); font-size: 11px; font-family: var(--font-body); }
.trend-tooltip { min-height: 18px; }

.trend-legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 8px 0 4px;
  padding: 0;
  font-size: 13px;
}

.trend-legend li { display: inline-flex; align-items: center; gap: 6px; }

.trend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.trend-table {
  width: 100%;
  margin-top: 8px;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.trend-table th, .trend-table td {
  text-align: right;
  padding: 3px 6px;
  border-bottom: 1px solid var(--line);
}

.trend-table th:first-child, .trend-table td:first-child { text-align: left; }

.barangay-ranking {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.barangay-ranking li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2fr auto;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.barangay-ranking-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.barangay-ranking-bar {
  height: 8px;
  background: var(--line);
  border-radius: 4px;
  overflow: hidden;
}

.barangay-ranking-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
}

.barangay-ranking-count { font-variant-numeric: tabular-nums; color: var(--ink-muted); }
```

- [ ] **Step 6: Tests, typecheck, and look**

Run: `npx vitest run src/lib/board src/components/board && npx tsc --noEmit`
Expected: PASS, clean.

In the browser as the master admin: the two panels sit above the columns.
With a few records filed in the last hour, the rightmost bar is stacked and
the legend names each hue; hovering a bar prints the hour and breakdown;
"Ipakita bilang talahanayan" reveals the table with the same numbers; the
barangay list is ranked with Malanday (or wherever you filed) first. Nothing
in either panel is a raw incident row - only counts arrive (check the
Network tab: `board_graph` returns one small JSON object). English: every
label changes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/board/graph.ts src/lib/board/graph.test.ts src/components/board/TrendChart.tsx src/components/board/TrendChart.test.tsx src/components/board/BarangayRanking.tsx src/app/console/board/page.tsx src/app/globals.css
git commit -m "feat: incidents per hour and barangay ranking above the board, hand-drawn SVG"
```

---
### Task 9: The hazard on an SOS — chips, scorer, queue and detail

**Files:**
- Create: `supabase/migrations/0034_sos_hazard.sql`
- Create: `tests/integration/sos-hazard.test.ts`
- Create: `src/components/HazardChips.tsx`, `src/components/HazardChips.test.tsx`
- Modify: `src/lib/sos/row.ts`, `src/app/actions/build-sos-row.test.ts`
- Modify: `src/lib/scoring/types.ts`, `src/lib/scoring/score.ts`, `src/lib/scoring/score.test.ts`
- Modify: `src/app/actions/submit-sos.ts`
- Modify: `src/app/sos/page.tsx` (and `page.test.tsx` if it asserts the submit payload)
- Modify: `src/components/SignalCard.tsx`, `src/app/console/[id]/page.tsx`
- Modify: `src/app/globals.css` — append

**Interfaces:**
- Consumes: `sos_signals.hazard_type` (0028, nullable); `moderator_queue()`
  (0020), `sos_detail(uuid)` (0025), `corroborating_reports(...)` (0028);
  `HAZARDS`, `isHazardType`, `HazardIcon`, `hazardName`; `copy.sos.hazardPrompt`
- Produces: `moderator_queue()` and `sos_detail()` with `hazard_type` after
  `depth`; `corroborating_reports(lat, lon, radius_m, within_minutes, hazard
  hazard_type default null)`; `SosInput.hazard: HazardType | null`;
  `SosRow.hazard_type`; `ScoringSnapshot.hazard: HazardType | null`;
  `<HazardChips value onChange />`; `QueueSignal.hazard_type`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0034_sos_hazard.sql
--
-- The hazard reaches the SOS queue, the detail, and the corroboration count.
--
-- 0028 added sos_signals.hazard_type, nullable, and nothing read it: /sos
-- did not ask, and the console functions did not return it. This migration
-- is the reading half; the /sos chip is the writing half, in the same task.

-- 1. moderator_queue: 0020's body, hazard_type after depth. Shape changes,
--    so drop and recreate; grants restated per 0030.
drop function if exists moderator_queue();

create function moderator_queue()
returns table (
  id           uuid,
  barangay     text,
  depth        depth_level,
  hazard_type  hazard_type,
  status       sos_status,
  trust_score  integer,
  confidence   text,
  reasons      jsonb,
  note         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.id, s.barangay, s.depth, s.hazard_type, s.status, s.trust_score,
         s.confidence, s.reasons, s.note, s.created_at
    from sos_signals s
   where s.status in ('pending', 'under_review', 'confirmed')
     and moderates(s.barangay)
   -- Unscored signals first: a signal we could not assess is not a signal we
   -- may bury. `nulls first` is deliberate.
   order by s.trust_score desc nulls first, s.created_at asc;
$fn$;

revoke execute on function moderator_queue() from public, anon;
grant  execute on function moderator_queue() to authenticated;

-- 2. sos_detail: 0025's body (the viewed event, the under_review promotion,
--    the phone number), hazard_type after depth. Drop, recreate, regrant.
drop function if exists sos_detail(uuid);

create function sos_detail(signal_id uuid)
returns table (
  id                      uuid,
  barangay                text,
  depth                   depth_level,
  hazard_type             hazard_type,
  status                  sos_status,
  trust_score             integer,
  confidence              text,
  reasons                 jsonb,
  note                    text,
  photo_path              text,
  gps_accuracy_m          double precision,
  created_at              timestamptz,
  lat                     double precision,
  lon                     double precision,
  rainfall_24h_mm         double precision,
  elevation_m             double precision,
  surrounding_elevation_m double precision,
  corroborating_reports   integer,
  provider_ok             boolean,
  reporter_phone          text
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
begin
  -- Record the view before returning anything. If the caller may not see this
  -- signal the insert matches nothing and the select returns nothing, so an
  -- unauthorised probe leaves no misleading trail. This function hands out a
  -- phone number, so "who looked at this" is also the record of who could
  -- have called.
  insert into signal_events (sos_id, actor_id, event_type, payload)
  select s.id, auth.uid(), 'viewed', '{}'::jsonb
    from sos_signals s
   where s.id = sos_detail.signal_id
     and moderates(s.barangay);

  -- Only from 'pending', so opening a signal a second time cannot walk back a
  -- decision somebody already made. moderates is re-checked rather than
  -- assumed from the insert above.
  update sos_signals s
     set status = 'under_review'
   where s.id = sos_detail.signal_id
     and s.status = 'pending'
     and moderates(s.barangay);

  return query
  select s.id, s.barangay, s.depth, s.hazard_type, s.status, s.trust_score,
         s.confidence, s.reasons, s.note, s.photo_path, s.gps_accuracy_m,
         s.created_at,
         st_y(s.location::geometry), st_x(s.location::geometry),
         e.rainfall_24h_mm, e.elevation_m, e.surrounding_elevation_m,
         e.corroborating_reports, e.provider_ok,
         p.phone
    from sos_signals s
    left join env_snapshots e on e.sos_id = s.id
    left join profiles p      on p.id     = s.reporter_id
   where s.id = sos_detail.signal_id
     and moderates(s.barangay);
end;
$fn$;

revoke execute on function sos_detail(uuid) from public, anon;
grant  execute on function sos_detail(uuid) to authenticated;

-- 3. corroborating_reports: like corroborates like ------------------------------
--
-- 0028 restricted this to flood, because an SOS carried no hazard to match
-- on. Now it can: a fire SOS is corroborated by fire reports nearby. NULL -
-- the sender chose no chip - matches any active report: an unspecified
-- emergency is corroborated by anything happening on that street.
--
-- A new parameter with a default is a DIFFERENT function to Postgres, and
-- leaving the four-argument one in place would give PostgREST two
-- candidates for a four-argument call. Dropped and recreated with the
-- default, so the old call shape still resolves - to this one.
drop function if exists corroborating_reports(double precision, double precision, double precision, integer);

create function corroborating_reports(
  lat            double precision,
  lon            double precision,
  radius_m       double precision,
  within_minutes integer,
  hazard         hazard_type default null
)
returns integer
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select count(*)::integer
    from depth_reports r
   where r.status = 'active'
     and (corroborating_reports.hazard is null or r.hazard_type = corroborating_reports.hazard)
     and r.reported_at >= now() - make_interval(mins => within_minutes)
     and st_dwithin(
           r.location,
           st_point(corroborating_reports.lon, corroborating_reports.lat)::geography,
           corroborating_reports.radius_m
         );
$fn$;

revoke execute on function corroborating_reports(double precision, double precision, double precision, integer, hazard_type) from public, anon;
grant  execute on function corroborating_reports(double precision, double precision, double precision, integer, hazard_type) to authenticated, service_role;
```

Run: `npx supabase migration up --local` — Expected: applied, no error.

- [ ] **Step 2: Integration test**

```typescript
// tests/integration/sos-hazard.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/** The hazard on an SOS, read back where a moderator and the scorer need it. */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const modClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";
/** Well away from Malanday, so this file's corroboration counts are its own. */
const FORTUNE = "SRID=4326;POINT(121.1220 14.6720)";
const NEAR_FORTUNE = { lat: 14.672, lon: 121.122, radius_m: 300, within_minutes: 60 };

let reporterId: string;

async function makeUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return { id: data.user!.id, email };
}

async function newSignal(hazard: string | null): Promise<string> {
  const reporter = await makeUser("sig");
  const { data, error } = await admin
    .from("sos_signals")
    .insert({ reporter_id: reporter.id, location: MALANDAY, photo_path: `${reporter.id}/x.jpg`, hazard_type: hazard })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  const m = await makeUser("mod");
  const r = await makeUser("reporter");
  reporterId = r.id;
  await admin.from("moderators").insert({ user_id: m.id, barangay: HOME, role: "admin" });
  const { error } = await modClient.auth.signInWithPassword({ email: m.email, password: PASSWORD });
  if (error) throw error;
});

describe("the queue and the detail", () => {
  it("carry the hazard, and null when none was chosen", async () => {
    const fire = await newSignal("fire");
    const none = await newSignal(null);
    const { data } = await modClient.rpc("moderator_queue");
    const rows = data as { id: string; hazard_type: string | null }[];
    expect(rows.find((r) => r.id === fire)!.hazard_type).toBe("fire");
    expect(rows.find((r) => r.id === none)!.hazard_type).toBeNull();

    const { data: detail } = await modClient.rpc("sos_detail", { signal_id: fire });
    expect((detail as { hazard_type: string }[])[0].hazard_type).toBe("fire");
  });

  it("still promotes a pending signal to under_review on open", async () => {
    // 0025's behaviour must survive the recreate.
    const id = await newSignal("flood");
    await modClient.rpc("sos_detail", { signal_id: id });
    const { data } = await admin.from("sos_signals").select("status").eq("id", id).single();
    expect(data!.status).toBe("under_review");
  });
});

describe("corroborating_reports with a hazard", () => {
  beforeAll(async () => {
    const { error } = await admin.from("depth_reports").insert([
      { reporter_id: reporterId, location: FORTUNE, hazard_type: "fire", severity: 2 },
      { reporter_id: reporterId, location: FORTUNE, hazard_type: "fire", severity: 3 },
      { reporter_id: reporterId, location: FORTUNE, depth: "knee" },
    ]);
    if (error) throw error;
  });

  it("counts only the same hazard when one is given", async () => {
    const { data } = await admin.rpc("corroborating_reports", { ...NEAR_FORTUNE, hazard: "fire" });
    expect(data).toBe(2);
  });

  it("counts everything when none is given - the old call shape still works", async () => {
    const { data, error } = await admin.rpc("corroborating_reports", NEAR_FORTUNE);
    expect(error).toBeNull();
    expect(data).toBe(3);
  });

  it("is closed to anon", async () => {
    const { error } = await createClient(url, anonKey, opts).rpc("corroborating_reports", NEAR_FORTUNE);
    expect(error).not.toBeNull();
  });
});
```

Run: `npx vitest run tests/integration/sos-hazard.test.ts tests/integration/moderation.test.ts tests/integration/signal-opened.test.ts tests/integration/reporter-phone.test.ts tests/integration/sos-functions.test.ts`
Expected: all PASS.

- [ ] **Step 3: The scorer, test first**

In `src/lib/scoring/score.test.ts`, add `hazard: null` to the `baseline`
fixture (the field becomes required), then add:

```typescript
describe("hazard", () => {
  const wet = { rainfall24hMm: 30, elevationM: 10, surroundingElevationM: 15 };

  it("keeps the rainfall and elevation groups for a flood and for an unspecified hazard", () => {
    // Unspecified keeps them: with no claimed depth those two groups can
    // only ever support, and withdrawing support from the people who had no
    // seconds to choose a chip would penalise the product's own design.
    const flood = scoreSignal({ ...baseline, claimedDepth: null, hazard: "flood", ...wet });
    const none = scoreSignal({ ...baseline, claimedDepth: null, hazard: null, ...wet });
    expect(flood.reasons.some((r) => /rainfall/i.test(r.text))).toBe(true);
    expect(none.reasons.some((r) => /rainfall/i.test(r.text))).toBe(true);
  });

  it("withdraws them for a fire, and says so rather than scoring the gap", () => {
    const fire = scoreSignal({ ...baseline, claimedDepth: null, hazard: "fire", ...wet });
    expect(fire.reasons.some((r) => /rainfall/i.test(r.text) && r.kind !== "unknown")).toBe(false);
    expect(fire.reasons.some((r) => /terrain/i.test(r.text))).toBe(false);
    expect(fire.reasons).toContainEqual({
      kind: "unknown",
      text: "Rainfall and elevation checks apply to flood only.",
    });
  });

  it("does not degrade a fire to medium on missing weather, because weather was never asked", () => {
    const fire = scoreSignal({
      ...baseline, claimedDepth: null, hazard: "fire",
      rainfall24hMm: null, elevationM: null, surroundingElevationM: null,
      hasLivePhoto: false, corroboratingReports: 0, reporterFalseReportCount: 2,
    });
    expect(fire.confidence).toBe("low");
  });
});
```

Run: `npx vitest run src/lib/scoring` — Expected: FAIL, `hazard` unknown.

In `src/lib/scoring/types.ts`, add to `ScoringSnapshot` after `claimedDepth`:

```typescript
  /**
   * What the sender said is happening, or `null` because they chose no
   * chip. Rainfall and elevation are evidence about water; for a fire or an
   * earthquake they are withdrawn rather than scored, and the reasons say
   * so. `null` keeps them: see `scoreSignal`.
   */
  hazard: HazardType | null;
```

with `import type { HazardType } from "@/lib/hazard/types";` at the top.

In `src/lib/scoring/score.ts`, add after the `START` constant:

```typescript
/**
 * The two environmental groups are evidence about water. They run for flood
 * and for an unspecified hazard (no chip chosen - the old assumption, and
 * with no claimed depth they can only support), and are withdrawn for
 * everything else. A gap that was never asked about must not become a
 * caution mark, so `environmentUnknown` stays false for those.
 */
function environmentApplies(hazard: HazardType | null): boolean {
  return hazard === null || hazard === "flood";
}
```

import `HazardType`, and wrap the Rainfall and Elevation sections:

```typescript
  if (environmentApplies(snapshot.hazard)) {
    // --- Rainfall --- (existing block, unchanged)
    // --- Elevation relative to surroundings --- (existing block, unchanged)
    if (environmentUnknown) {
      reasons.push({ kind: "unknown", text: "Environmental data unavailable - treat with caution." });
    }
  } else {
    reasons.push({
      kind: "unknown",
      text: "Rainfall and elevation checks apply to flood only.",
    });
  }
```

(Move the existing `if (environmentUnknown)` push inside the first branch.)
The `confidence` degrade at the bottom already keys on `environmentUnknown`,
which stays false for non-flood, so the third test passes without touching
it.

Run: `npx vitest run src/lib/scoring` — Expected: PASS.

- [ ] **Step 4: The row and the action**

`src/lib/sos/row.ts`: add `hazard: HazardType | null;` to `SosInput` and
`hazard_type: HazardType | null;` to `SosRow` (import the type), and
`hazard_type: input.hazard,` in `buildSosRow`. Update the doc comment: an
SOS *may* carry a hazard now, chosen from an optional row of chips; `null`
records that none was chosen, never a guess. In
`src/app/actions/build-sos-row.test.ts`, add `hazard: null` to the fixture
and one assertion that `hazard: "fire"` becomes `hazard_type: "fire"`.

`src/app/actions/submit-sos.ts`:

1. `import { isHazardType } from "@/lib/hazard/types";`
2. At the top of `submitSos`, before validation:
   ```typescript
   // Optional, so null passes; anything else must be a hazard we know. An
   // unknown word is refused rather than nulled, because silently
   // recording "unspecified" for a sender who chose something would put
   // the wrong fact in the console.
   if (input.hazard !== null && !isHazardType(input.hazard)) {
     return { ok: false, errors: ["insert_failed"] };
   }
   ```
3. In `enrichAndScore`, pass `hazard: input.hazard` to the
   `corroborating_reports` rpc call and `hazard: input.hazard` to
   `scoreSignal`.

- [ ] **Step 5: The chips, test first**

```tsx
// src/components/HazardChips.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HazardChips } from "./HazardChips";

describe("HazardChips", () => {
  it("offers the six hazards with nothing chosen", () => {
    render(<HazardChips value={null} onChange={() => {}} />);
    const chips = screen.getAllByRole("radio");
    expect(chips.map((c) => c.getAttribute("aria-checked"))).toEqual(Array(6).fill("false"));
    expect(screen.getByText("Ano ang nangyayari? (opsyonal)")).toBeInTheDocument();
  });

  it("reports a choice", async () => {
    const onChange = vi.fn();
    render(<HazardChips value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Sunog" }));
    expect(onChange).toHaveBeenCalledWith("fire");
  });

  it("tapping the chosen chip again clears it - none is a real answer", async () => {
    const onChange = vi.fn();
    render(<HazardChips value="fire" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Sunog" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Sunog" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

Run: `npx vitest run src/components/HazardChips.test.tsx` — Expected: FAIL.

```tsx
// src/components/HazardChips.tsx
"use client";

import { HAZARDS, type HazardType } from "@/lib/hazard/types";
import { hazardName } from "@/lib/hazard/name";
import { HazardIcon } from "./HazardIcon";
import { useCopy } from "@/lib/i18n/context";

/**
 * An optional row of hazards on /sos.
 *
 * Six chips, icon and word, nothing preselected, and NOTHING REQUIRED: the
 * three-second hold works whether or not one is chosen. Tapping the chosen
 * chip again clears it, because "I did not say" is a real answer and the
 * console shows it as one rather than guessing.
 *
 * /sos deliberately stopped asking for a depth because seconds matter
 * there. This row costs no seconds: it is glanceable, optional, and above
 * the hold rather than in its way.
 */
export function HazardChips({
  value,
  onChange,
}: {
  value: HazardType | null;
  onChange: (h: HazardType | null) => void;
}) {
  const copy = useCopy();
  return (
    <div className="hazard-chips" role="radiogroup" aria-label={copy.sos.hazardPrompt}>
      <p className="field-label">{copy.sos.hazardPrompt}</p>
      <div className="hazard-chips-row">
        {HAZARDS.map((h) => (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={value === h}
            className="hazard-chip"
            data-hazard={h}
            onClick={() => onChange(value === h ? null : h)}
          >
            <HazardIcon hazard={h} size="sm" />
            {hazardName(h, copy.hazard)}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Append to `globals.css`:

```css
/* Six optional chips above the SOS hold. Wrap to two rows on a narrow phone
   rather than shrink below a thumb. */
.hazard-chips { margin-top: 20px; }

.hazard-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.hazard-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 999px;
  font: inherit;
  font-weight: 600;
  font-size: 15px;
  color: var(--ink);
  cursor: pointer;
}

.hazard-chip[aria-checked="true"] {
  border-color: var(--ink);
  background: var(--raised);
}
```

Run: `npx vitest run src/components/HazardChips.test.tsx` — Expected: PASS, 3 tests.

- [ ] **Step 6: On the page, and in the console**

`src/app/sos/page.tsx`:

1. `import { HazardChips } from "@/components/HazardChips";` and
   `import type { HazardType } from "@/lib/hazard/types";`
2. State: `const [hazard, setHazard] = useState<HazardType | null>(null);`
3. Render `<HazardChips value={hazard} onChange={setHazard} />` directly
   **after** the photo block and **before** the note field - above the hold,
   never between the sender and it.
4. Pass `hazard,` in the `submitSos({...})` call.

`src/components/SignalCard.tsx`: add `hazard_type: HazardType | null;` to
`QueueSignal` (import the type and `HazardIcon`, `hazardName`). In the
`signal-head` span, before the `<strong>`, add
`{signal.hazard_type && <HazardIcon hazard={signal.hazard_type} size="sm" />}`,
and change the `<strong>` so a signal with a depth keeps `depthName`; a
signal with a hazard and no depth reads `hazardName(signal.hazard_type,
copy.hazard)`; neither keeps `copy.screens.signalTitle`.

`src/app/console/[id]/page.tsx`: add `hazard_type: HazardType | null;` to
`Detail`, and apply the same three-way rule to the `<h1>`. In
`src/app/sos/page.test.tsx`, if it asserts on `submitSos`'s argument, add
`hazard: null` to the expected object.

- [ ] **Step 7: Typecheck, all unit tests, and drive it**

Run: `npx tsc --noEmit && npx vitest run src`
Expected: clean, all green.

On a phone or a narrow browser, `/sos`: the chip row sits under the photo
prompt and above the note; the hold works with no chip; choose Sunog, send
(camera required); on `/console` the SOS row shows the flame and "Sunog";
open it, the title is "Sunog". Send another with no chip: the row reads
"Humihingi ng tulong" as before. In Studio, `sos_signals.reasons` on the
fire signal includes "Rainfall and elevation checks apply to flood only."
English: chips and titles change.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0034_sos_hazard.sql tests/integration/sos-hazard.test.ts src/components/HazardChips.tsx src/components/HazardChips.test.tsx src/lib/sos/row.ts src/app/actions/build-sos-row.test.ts src/lib/scoring src/app/actions/submit-sos.ts src/app/sos/page.tsx src/app/sos/page.test.tsx src/components/SignalCard.tsx "src/app/console/[id]/page.tsx" src/app/globals.css
git commit -m "feat: an optional hazard on an SOS, read by the queue, the detail and the scorer"
```

---
### Task 10: Ship it — service worker, status doc, e2e smoke, the full run

**Files:**
- Modify: `public/sw.js:41`
- Create: `tests/e2e/board.spec.ts`
- Modify: `tests/e2e/console.spec.ts`
- Modify: `docs/STATUS.md`
- Modify: `docs/superpowers/specs/2026-08-27-antas-multi-hazard-design.md` — the status header only

- [ ] **Step 1: The service worker**

`public/sw.js:41`: `const VERSION = "antas-v3";` → `"antas-v4"`. The
previous build is served for one load per device after a deploy; every
function this plan calls is additive, so that load still works, but the
console and `/sos` must pick up the new build on the next one.

- [ ] **Step 2: The e2e smoke test**

```typescript
// tests/e2e/board.spec.ts
import { test, expect } from "@playwright/test";

test("the board refuses a signed-out visitor in words, not an empty grid", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/console/board");
  // board_rows() is revoked from anon, so the RPC errors and the page must
  // say so rather than draw four empty columns or crash.
  await expect(page.getByText("Para lang sa master admin ang board na ito.")).toBeVisible();
  await expect(page.locator(".board-column")).toHaveCount(0);
});

test("the board still warns that nobody is dispatched", async ({ page }) => {
  await page.goto("/console/board");
  await expect(page.getByText("Demonstrasyon lamang.")).toBeVisible();
});
```

Note: an anonymous RPC to `board_rows` fails at the grant layer with a
PostgREST permission error whose `code` is `42501` too, so the page lands on
`denied` - which is the sentence asserted above. If it lands on `failed`
instead, the assertion tells you, and the fix is to also treat a
`401`/`403` HTTP status as denied in `load()`.

The existing `tests/e2e/console.spec.ts` asserts a signed-out visitor sees
`consoleEmpty`. Task 3 changed that branch to the signed-out line and a
login button; update that test to

```typescript
test("a signed-out visitor is told the console needs a sign-in", async ({ page }) => {
  await page.goto("/console");
  await expect(page.getByRole("link", { name: "Mag-sign in" })).toBeVisible();
});
```

using the exact Tagalog of `copy.screens.loginTitle` from `screens.ts` if it
differs from "Mag-sign in".

Run: `npx playwright test tests/e2e/board.spec.ts tests/e2e/console.spec.ts`
Expected: PASS (needs `npm run dev` reachable on 127.0.0.1:3000).

- [ ] **Step 3: The full suite**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test`
Expected: all green. If anything in `tests/integration/*.test.ts` that this
plan did not touch now fails, it is a regression from a recreated function
- most likely a grant. Fix the migration, not the test.

- [ ] **Step 4: Docs**

`docs/STATUS.md`: add a section at the top of "Do these first" titled
**"Plan B — master admin, board, responders (2026-08-28)"** covering, in
this file's own voice:

- Migrations `0032`–`0034`, applied locally; **must be applied to hosted
  before deploying**, in order, with `npx supabase db push` from
  `.env.hosted` (never `db reset`).
- `npm run make-moderator -- <email> <barangay> --master` grants the role;
  the two live accounts are still `admin` until the owner runs it.
- `/console/board` is desktop-only; `/console` shows tabs by access; a
  responder registers under Ako → Responder; `/sos` has optional chips.
- The decisions a reader of STATUS needs: `dispatched` is derived from an
  open assignment; assigning a report confirms it; dismissing or hiding
  closes assignments; the board's not-true column is 48h.
- The known limits: the board does not live-update on assignment changes
  made by somebody else; `board_rows` caps at 200 per column; the trend
  chart is the one place colour means hazard.

The spec's **Status** header: change to *"Plan A implemented and deployed
2026-08-28. Plan B (master admin, board, roster, assignment, graph, SOS
hazard) implemented 2026-08-28 — see
`docs/superpowers/plans/2026-08-28-antas-multi-hazard-b-master-admin.md`."*
Touch nothing else in the spec.

- [ ] **Step 5: Look at it one more time, in both languages**

The full flow, on the running app, before calling this done — green tests
have missed real bugs on this project repeatedly:

1. A resident files a fire report from a phone-sized window. Nothing about
   `/report` changed.
2. The same resident sends an SOS with the Lindol chip. The hold works;
   the confirmation screen is unchanged.
3. The master admin opens the board: both records in *Kailangang suriin*,
   the SOS first, the trend panel has a bar for this hour with two hues in
   the legend.
4. Drag the report to *May nakatalaga*, choose the responder. Drag the SOS
   to *Kailangan ng atensyon*.
5. The responder opens `/console`: one card. Opens it: phone, directions.
   "Tapos na" twice. Gone.
6. The board: the report is back in *Kailangan ng atensyon*. Drag it to
   *Hindi totoo* with "Mali ang lugar". It is in the second column; the
   public map no longer shows it.
7. Everything above in English.
8. A phone-sized window on `/console/board` says it is for desktop.

- [ ] **Step 6: Commit and push**

```bash
git add public/sw.js tests/e2e/board.spec.ts tests/e2e/console.spec.ts docs/STATUS.md docs/superpowers/specs/2026-08-27-antas-multi-hazard-design.md
git commit -m "chore: Plan B shipped - sw antas-v4, board smoke test, status"
git push
```

Then, **only after the push**, apply `0032`–`0034` to hosted and confirm the
deploy went live (`docs/STATUS.md` records that deploys once failed
silently for ten days - check the Vercel dashboard, not a `curl`).

---

## Self-review against the spec

Each spec section and the task that covers it:

| Spec | Task |
|---|---|
| §1 hazard/severity; `triage_state` on reports | 1 (three values; `dispatched` derived — see Decisions) |
| §2 trust score for every hazard (SOS side) | 9 |
| §3 SOS optional chips, nullable `hazard_type` | 9 |
| §4 roles: `master_admin`; access by assignment; `responder_unit`/`responder_barangay`; `assignments` with audit | 1, 3, 4 |
| §5 board: four columns, union function, SOS-first ordering, reason before not-true, person before assigned, drag + keyboard | 5, 6, 7 |
| §6 graph: per-hour by hazard, barangay breakdown, one definer function, no library | 5, 8 |
| §7 icons: one `HazardIcon` at three sizes | built in Plan A; reused on every new card and chip |
| §8 public map unchanged | nothing here touches `reports_near` |
| Testing: predicates; one-and-not-other; closed ends access; moderator scope unchanged; master admin across barangays; non-public hazards absent from `reports_near` | 1 (`assignments.test.ts`, `master-admin.test.ts`); the last is `0031`'s existing test, unchanged |
| Rollout: additive, migrate before deploy | every migration; Task 10 |
| "Do not narrow out of caution about dispatch" | no task withholds a feature; the demo statements are untouched |

Not in the spec, added by this plan and named in Decisions: the console's
access-aware tabs (a responder needs somewhere to see their card), the
`confirm` decision on reports (the spec's "marks it confirmed" needed a
writer), and the 48-hour window on the not-true column.

Type consistency: `BoardRow` (Task 2) matches `board_rows()` (Task 5)
column for column; `MyAssignment` (Task 3) matches `my_assignments()`
(Task 1); `RosterEntry` (Task 6) matches `responder_roster()` (Task 1);
`AssignResult` is what both `assign.ts` functions return and what the
board's `perform` reads `.ok` from; `ScoringSnapshot.hazard` (Task 9) is
passed by `submit-sos.ts` (Task 9); `QueueReport.triage_state` (Task 3) is
returned by `report_queue()` (Task 1); `QueueSignal.hazard_type` (Task 9) is
returned by `moderator_queue()` (Task 9); `ConsoleAccess` (Task 3) matches
`console_access()` (Task 1).
