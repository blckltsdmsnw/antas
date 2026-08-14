-- The `admin` role, which has existed since 0005 and never done anything.
--
-- `moderators.role` has allowed 'moderator' and 'admin' from the start, and no
-- query has ever read the column. This makes it real: an admin sees every
-- barangay's queue, a moderator still sees exactly one.
--
-- The need is ordinary. Whoever runs the deployment has to be able to look at a
-- signal outside their own barangay - to check the console works at all, or to
-- cover a desk that is unstaffed - without editing the database each time.
--
-- WHAT THIS IS NOT: a way for a moderator to re-scope themselves. Admin is
-- granted exactly the way moderator is, by a script run by whoever holds the
-- service key, and never from inside the application. An SOS carries a
-- distressed person's exact location and their photograph; if scope were
-- self-service, one account could read every signal in the country by typing a
-- different barangay. Nor does physical presence grant it - browser geolocation
-- is trivially forged, so "I am standing here" can never be an access claim.

/*
 * One predicate, because it was four copies.
 *
 * The barangay check was repeated in moderator_queue, twice in sos_detail, and
 * once in decide_sos. Four copies of a security rule is three chances to update
 * it incompletely, and the copy that gets missed is a hole nobody sees. Now the
 * rule - including who is exempt from it - lives in one place.
 *
 * Reads auth.uid() and nothing the caller supplies about themselves, so it can
 * only ever answer for the person asking.
 */
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
       and (m.role = 'admin' or m.barangay = p_barangay)
  );
$fn$;

-- Nobody calls this directly. The three functions below are security definer
-- and owned by the same role, so they reach it regardless; leaving it
-- unreachable from the API keeps the console's surface exactly as wide as it
-- was. Revoked from PUBLIC rather than from anon - see 0016 for why that
-- distinction is the whole difference between a lock and a comment.
revoke execute on function moderates(text) from public;

create or replace function moderator_queue()
returns table (
  id           uuid,
  barangay     text,
  depth        depth_level,
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
  select s.id, s.barangay, s.depth, s.status, s.trust_score, s.confidence,
         s.reasons, s.note, s.created_at
    from sos_signals s
   where s.status in ('pending', 'under_review', 'confirmed')
     and moderates(s.barangay)
   -- Unscored signals first: a signal we could not assess is not a signal we
   -- may bury. `nulls first` is deliberate.
   order by s.trust_score desc nulls first, s.created_at asc;
$fn$;

-- Unchanged but for the scope check, and still VOLATILE: it writes, because
-- every detail view is recorded. Opening a distressed person's exact location
-- and photograph is an act worth auditing, and that matters MORE now that an
-- admin can open signals anywhere - "who looked at this, and when" is the only
-- thing that makes a wide scope accountable rather than merely convenient.
create or replace function sos_detail(signal_id uuid)
returns table (
  id                      uuid,
  barangay                text,
  depth                   depth_level,
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
  provider_ok             boolean
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
begin
  -- Record the view before returning anything. If the caller may not see this
  -- signal the insert matches nothing and the select returns nothing, so an
  -- unauthorised probe leaves no misleading trail.
  insert into signal_events (sos_id, actor_id, event_type, payload)
  select s.id, auth.uid(), 'viewed', '{}'::jsonb
    from sos_signals s
   where s.id = sos_detail.signal_id
     and moderates(s.barangay);

  return query
  select s.id, s.barangay, s.depth, s.status, s.trust_score, s.confidence,
         s.reasons, s.note, s.photo_path, s.gps_accuracy_m, s.created_at,
         st_y(s.location::geometry), st_x(s.location::geometry),
         e.rainfall_24h_mm, e.elevation_m, e.surrounding_elevation_m,
         e.corroborating_reports, e.provider_ok
    from sos_signals s
    left join env_snapshots e on e.sos_id = s.id
   where s.id = sos_detail.signal_id
     and moderates(s.barangay);
end;
$fn$;

-- The whole decision in one transaction: status, audit entry, reputation, and
-- suspension. Split across four round trips, a failure after the first would
-- leave a confirmed signal with no audit trail - and an audit trail with holes
-- is worse than none, because it looks complete.
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

  -- Only fabrication counts. Dismissing a duplicate says nothing bad about the
  -- reporter; penalising it would punish people for reporting a real flood
  -- somebody else reported first.
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

-- `create or replace` keeps existing privileges, so these are restatements
-- rather than changes. They are here because the grant is part of what the
-- function IS, and a future rewrite that drops and recreates one of these would
-- otherwise reopen the console to anonymous callers by omission.
revoke execute on function moderator_queue() from public, anon;
revoke execute on function sos_detail(uuid) from public, anon;
revoke execute on function decide_sos(uuid, text, dismiss_reason) from public, anon;

grant execute on function moderator_queue() to authenticated;
grant execute on function sos_detail(uuid) to authenticated;
grant execute on function decide_sos(uuid, text, dismiss_reason) to authenticated;
