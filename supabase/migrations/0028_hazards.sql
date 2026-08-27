-- supabase/migrations/0028_hazards.sql
--
-- Antas past flood.
--
-- 0001 built a table for one hazard and named it for the measurement that
-- hazard admits: depth_reports, with a not-null depth on every row. This
-- migration widens it without renaming it and without rewriting a single
-- existing row.
--
-- NOT RENAMED, deliberately. The table is named by fifteen functions and
-- thirteen files, and the service worker serves the previous build for one
-- load per device after a deploy - so a rename would make every resident's
-- report fail for one load each, on a production site with a real
-- third-party user. A misleading name is a smaller harm than that. It can be
-- renamed later, alone, after turnover; do not fold that into anything else.

create type hazard_type as enum (
  'flood', 'fire', 'earthquake', 'accident', 'medical', 'other'
);

-- 1. Columns -----------------------------------------------------------------

alter table depth_reports add column hazard_type hazard_type not null default 'flood';
alter table depth_reports add column severity    smallint;

-- Backfill from depth. The mapping is the one in lib/hazard/severity.ts and
-- must stay identical to it: ankle and knee are water you walk through, waist
-- is water you struggle in, chest and above are water you do not survive
-- misjudging.
update depth_reports
   set severity = case depth
                    when 'ankle'      then 1
                    when 'knee'       then 1
                    when 'waist'      then 2
                    when 'chest'      then 3
                    when 'above_head' then 3
                  end;

-- 2. Severity by trigger, so old writers keep working --------------------------
--
-- Every existing caller - the previous deployed build, scripts/seed.ts, seven
-- integration test files - inserts a depth and no severity. If severity were
-- simply NOT NULL, all of them would fail the moment this applied. Deriving it
-- here is the same argument 0027 makes for barangay: a value assigned by
-- trigger holds for every writer, and an application-level assignment is one
-- forgotten call site away from a failed insert.
create or replace function set_report_severity()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.hazard_type = 'flood' and new.depth is not null then
    -- Always derived for flood. A caller that sends a severity disagreeing
    -- with its own depth is overruled; the depth is the measurement.
    new.severity := case new.depth
                      when 'ankle'      then 1
                      when 'knee'       then 1
                      when 'waist'      then 2
                      when 'chest'      then 3
                      when 'above_head' then 3
                    end;
  end if;
  return new;
end;
$fn$;

create trigger depth_reports_set_severity
  before insert or update of depth, hazard_type, severity on depth_reports
  for each row execute function set_report_severity();

alter table depth_reports alter column severity set not null;
alter table depth_reports add constraint depth_reports_severity_range
  check (severity between 1 and 3);

-- 3. Depth is flood's own detail now -------------------------------------------
--
-- Permitted when and only when the hazard is flood: a fire cannot carry a body
-- measurement, and a flood report cannot lose one.
alter table depth_reports alter column depth drop not null;
alter table depth_reports add constraint depth_only_for_flood
  check (
    (hazard_type =  'flood' and depth is not null) or
    (hazard_type <> 'flood' and depth is null)
  );

create index depth_reports_hazard_idx on depth_reports (hazard_type);

-- 4. sos_signals ----------------------------------------------------------------
--
-- Nullable, and no severity. Plan B offers a hazard on the SOS screen as an
-- optional chip that must never block the hold, so "unspecified" is the honest
-- value for a signal sent by somebody with no seconds to spare. An SOS is an
-- emergency by definition and goes on ranking by trust score.
alter table sos_signals add column hazard_type hazard_type;

-- 5. What the public map may draw ----------------------------------------------
--
-- Flood, fire and earthquake describe a place. Accident and medical describe a
-- person, and pinning one to an address exposes somebody at their worst moment
-- to their whole neighbourhood. They still reach the console in full.
create function public_hazard(h hazard_type)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select h in ('flood', 'fire', 'earthquake');
$fn$;

revoke execute on function public_hazard(hazard_type) from public;

-- 6. report_priority moves from depth to severity --------------------------------
--
-- Identical outcome for flood: chest and above_head are exactly the depths
-- that map to 3, so today's bands are preserved rather than re-tuned. Six
-- hours is still MAX_CACHE_AGE_HOURS from lib/offline/staleness.ts.
drop function if exists report_priority(depth_level, timestamptz);

create function report_priority(
  p_severity    smallint,
  p_reported_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $fn$
  select case
    when p_severity = 3 and p_reported_at > now() - interval '6 hours' then 'urgent'
    when p_severity = 2 and p_reported_at > now() - interval '6 hours' then 'watch'
    when p_severity = 3                                                then 'watch'
    else 'routine'
  end;
$fn$;

revoke execute on function report_priority(smallint, timestamptz) from public;

-- 7. report_queue and report_detail gain the hazard -----------------------------
--
-- Return shapes change, so both are dropped and recreated. Dropping a function
-- drops its grants - 0013 learned this - so they are restated at the end.
drop function if exists report_queue();

create function report_queue()
returns table (
  id             uuid,
  barangay       text,
  hazard_type    hazard_type,
  severity       smallint,
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
  select r.id, r.barangay, r.hazard_type, r.severity, r.depth, r.status,
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

drop function if exists report_detail(uuid);

create function report_detail(p_report_id uuid)
returns table (
  id                 uuid,
  barangay           text,
  hazard_type        hazard_type,
  severity           smallint,
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
  select r.id, r.barangay, r.hazard_type, r.severity, r.depth, r.status,
         report_priority(r.severity, r.reported_at),
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

revoke execute on function report_queue()      from public;
revoke execute on function report_detail(uuid) from public;
grant  execute on function report_queue()      to authenticated;
grant  execute on function report_detail(uuid) to authenticated;

-- 8. reports_near: the hazard, and the public filter ---------------------------
--
-- Live definition is 0013's, which added photo_path - NOT 0003's. Reproduced
-- from 0013 with three changes: hazard_type and severity in the shape, and the
-- public_hazard filter.
drop function if exists reports_near(double precision, double precision, double precision);

create function reports_near(
  lat      double precision,
  lon      double precision,
  radius_m double precision
)
returns table (
  id          uuid,
  hazard_type hazard_type,
  severity    smallint,
  depth       depth_level,
  reported_at timestamptz,
  photo_path  text,
  lat         double precision,
  lon         double precision,
  distance_m  double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $fn$
  select
    r.id,
    r.hazard_type,
    r.severity,
    r.depth,
    r.reported_at,
    r.photo_path,
    st_y(r.location::geometry) as lat,
    st_x(r.location::geometry) as lon,
    st_distance(r.location, st_point(reports_near.lon, reports_near.lat)::geography) as distance_m
  from depth_reports r
  where r.status = 'active'
    and public_hazard(r.hazard_type)
    and st_dwithin(r.location, st_point(reports_near.lon, reports_near.lat)::geography, reports_near.radius_m)
  order by distance_m;
$fn$;

-- service_role named explicitly, for the reason 0013 records.
revoke all on function reports_near(double precision, double precision, double precision) from public;
grant execute on function reports_near(double precision, double precision, double precision) to anon, authenticated, service_role;

-- 9. corroborating_reports: like corroborates like ------------------------------
--
-- The trust score's corroboration group counted any active nearby report.
-- After this migration a fire report would corroborate a flood SOS, which is
-- not corroboration. SOS carries no hazard until Plan B, so for now an SOS is
-- corroborated by flood reports only - the assumption every SOS made before
-- today. Same shape, so create or replace suffices and grants survive.
create or replace function corroborating_reports(
  lat            double precision,
  lon            double precision,
  radius_m       double precision,
  within_minutes integer
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
     and r.hazard_type = 'flood'
     and r.reported_at >= now() - make_interval(mins => within_minutes)
     and st_dwithin(
           r.location,
           st_point(corroborating_reports.lon, corroborating_reports.lat)::geography,
           corroborating_reports.radius_m
         );
$fn$;
