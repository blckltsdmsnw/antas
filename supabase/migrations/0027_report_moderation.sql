-- Moderating depth reports.
--
-- 0010 built a triage queue for SOS signals and stopped there. Depth reports
-- have carried a `status` column since 0001 with a `hidden` value nobody at a
-- desk could ever set: the only writer is the reporter's own Tanggalin control
-- in /ako, and the only other route is scripts/remove-report.ts, run by hand.
-- A moderator opening the console saw rescue requests and nothing else, while
-- the map filled with readings no one was reviewing.
--
-- Asked for by name when the system was reviewed: a dashboard for the admin to
-- monitor submitted reports, organised and categorised so that priorities are
-- visible. This migration is the data half of that.

-- 1. Barangay scope ---------------------------------------------------------
--
-- sos_signals has carried a barangay since 0009 and depth_reports never did,
-- because nothing scoped a report to a desk. A queue does. The column is
-- filled by trigger rather than by the application for the reason 0009 gives:
-- an application-level assignment is one forgotten call site away from the
-- NULL that silently empties a queue forever, with no error.

alter table depth_reports add column barangay text;

create index depth_reports_barangay_idx on depth_reports (barangay);

create or replace function set_report_barangay()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
begin
  if new.barangay is null then
    new.barangay := nearest_barangay(new.location);
  end if;
  return new;
end;
$fn$;

create trigger depth_reports_set_barangay
  before insert on depth_reports
  for each row execute function set_report_barangay();

-- Backfill, so the queue is not permanently blind to every report filed before
-- today. Same reasoning as 0009's backfill of sos_signals.
update depth_reports
   set barangay = nearest_barangay(location)
 where barangay is null;

-- 2. Priority ---------------------------------------------------------------
--
-- "Organise the reports and categorise them to identify priorities" is the
-- instruction this answers, and the honest way to meet it is a rule a person
-- can read rather than a score. The SOS queue carries a trust score because a
-- rescue request is weighed against rainfall and elevation before a human sees
-- it; a depth reading has no comparable evidence behind it, and inventing a
-- number would dress a guess up as an assessment.
--
-- So: severity and freshness, both of which the report states about itself.
--
-- Severity is the depth enum's own order - `ankle` through `above_head` as
-- declared in 0001 - so `>= 'chest'` below means what it reads as.
--
-- Freshness is SIX HOURS, and that number is not invented here. It is
-- MAX_CACHE_AGE_HOURS from lib/offline/staleness.ts, agreed with the owner as
-- the point past which a depth reading describes a street that has almost
-- certainly changed. The queue uses the same boundary at which the map refuses
-- to draw a cached pin at all: past it, a report is a record rather than a
-- thing to act on. If that constant moves, move this with it.
create or replace function report_priority(
  p_depth       depth_level,
  p_reported_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $fn$
  select case
    when p_depth >= 'chest' and p_reported_at > now() - interval '6 hours'
      then 'urgent'
    when p_depth  = 'waist' and p_reported_at > now() - interval '6 hours'
      then 'watch'
    when p_depth >= 'chest'
      then 'watch'
    else 'routine'
  end;
$fn$;

revoke execute on function report_priority(depth_level, timestamptz) from public;

-- 3. The queue --------------------------------------------------------------
--
-- Security definer for the reason moderator_queue is: 0002 makes only
-- `status = 'active'` reports publicly readable, so a flagged report - the one
-- most in need of a decision - is invisible to every role at the RLS layer. A
-- moderator reaches it through this function or not at all.
--
-- Hidden reports are excluded. Hiding is the outcome of moderating, not a
-- state to keep re-deciding, and a queue that never empties is a queue people
-- stop opening.
--
-- No phone number here. `moderator_queue` withholds it too, and `report_detail`
-- hands it over one report at a time: a list view that sprays contact numbers
-- down every row is a different thing from a moderator opening one report
-- because they mean to act on it.
create or replace function report_queue()
returns table (
  id             uuid,
  barangay       text,
  depth          depth_level,
  status         text,
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
  select r.id, r.barangay, r.depth, r.status,
         report_priority(r.depth, r.reported_at),
         r.reported_at,
         r.photo_path is not null,
         r.gps_accuracy_m,
         (select count(*)::integer from report_updates u where u.report_id = r.id)
    from depth_reports r
   where r.status in ('active', 'flagged')
     and moderates(r.barangay)
   -- Flagged first, whatever its depth: somebody has contested that reading,
   -- and a contested report is waiting on a person rather than on the water.
   -- Then by priority, then freshest first inside a band. This mirrors the SOS
   -- queue's "unscored signals first" - the rows that need a human lead, not
   -- the rows that merely score highest.
   order by (r.status = 'flagged') desc,
            case report_priority(r.depth, r.reported_at)
              when 'urgent' then 0
              when 'watch'  then 1
              else 2
            end,
            r.reported_at desc;
$fn$;

-- 4. One report in full -----------------------------------------------------
--
-- Carries the reporter's phone number, which is the whole reason this exists
-- separately from the queue. 0022 added that column so a moderator could ring
-- an SOS caller; the review that asked for this dashboard asked for a contact
-- number so that a report could be followed up for more detail, which is the
-- same need arriving at the other kind of row.
--
-- VOLATILE, and it writes, exactly as sos_detail does. 0022 states the rule
-- being followed: a function that hands out a phone number must leave a record
-- of who was handed it, because "who looked at this" is also the record of who
-- could have called. The insert carries the same `moderates` check as the
-- select, so an unauthorised probe writes nothing and reads nothing rather
-- than leaving a misleading trail.
create table report_events (
  id         bigint generated always as identity primary key,
  report_id  uuid        not null references depth_reports (id) on delete cascade,
  actor_id   uuid                 references profiles (id),
  event_type text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index report_events_report_idx on report_events (report_id, created_at);

-- The console reads through definer functions and never touches this table.
-- Same posture as signal_events: it is the server's record, not a view.
alter table report_events enable row level security;
revoke all on report_events from anon, authenticated;
grant select, insert on report_events to service_role;

create or replace function report_detail(p_report_id uuid)
returns table (
  id                 uuid,
  barangay           text,
  depth              depth_level,
  status             text,
  priority           text,
  reported_at        timestamptz,
  photo_path         text,
  gps_accuracy_m     double precision,
  lat                double precision,
  lon                double precision,
  answers            integer,
  reporter_phone     text,
  reporter_confirmed integer,
  reporter_false     integer
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
begin
  insert into report_events (report_id, actor_id, event_type, payload)
  select r.id, auth.uid(), 'viewed', '{}'::jsonb
    from depth_reports r
   where r.id = report_detail.p_report_id
     and moderates(r.barangay);

  return query
  select r.id, r.barangay, r.depth, r.status,
         report_priority(r.depth, r.reported_at),
         r.reported_at, r.photo_path, r.gps_accuracy_m,
         st_y(r.location::geometry), st_x(r.location::geometry),
         (select count(*)::integer from report_updates u where u.report_id = r.id),
         p.phone,
         coalesce(rep.confirmed_count, 0),
         coalesce(rep.false_report_count, 0)
    from depth_reports r
    left join profiles   p   on p.id       = r.reporter_id
    left join reputation rep on rep.user_id = r.reporter_id
   where r.id = report_detail.p_report_id
     and moderates(r.barangay);
end;
$fn$;

-- 5. The decision -----------------------------------------------------------
--
-- Two outcomes, and deliberately not the four decide_sos has. A depth reading
-- is either standing or it is off the map; there is no "resolved" for a
-- measurement, and no confirmation step, because confirming a depth is what
-- the freshness answers under the pin already do - by people standing there.
--
-- Hiding does NOT touch reputation. decide_sos raises false_report_count and
-- suspends at three, which is right for a fabricated rescue request. A depth
-- report hidden as stale or misplaced says nothing bad about the person who
-- filed it, and quietly accruing strikes for it would suspend honest reporters
-- for reporting.
create type report_decision_reason as enum (
  'not_true', 'duplicate', 'stale', 'wrong_place'
);

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
  if p_decision not in ('keep', 'hide') then
    raise exception 'decision must be keep or hide, got %', p_decision;
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

  update depth_reports
     set status = case when p_decision = 'hide' then 'hidden' else 'active' end
   where id = decide_report.p_report_id;

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

-- 6. Grants -----------------------------------------------------------------
--
-- Revoked from PUBLIC rather than merely from anon - 0016 explains why that
-- distinction is the whole difference between a lock and a comment.
revoke execute on function report_queue()                                    from public;
revoke execute on function report_detail(uuid)                               from public;
revoke execute on function decide_report(uuid, text, report_decision_reason) from public;

grant execute on function report_queue()                                    to authenticated;
grant execute on function report_detail(uuid)                               to authenticated;
grant execute on function decide_report(uuid, text, report_decision_reason) to authenticated;

-- Realtime, matching 0010: a report should reach the dashboard as it is filed.
alter publication supabase_realtime add table depth_reports;
