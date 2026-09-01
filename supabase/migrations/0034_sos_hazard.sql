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
