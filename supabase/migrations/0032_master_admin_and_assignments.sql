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
