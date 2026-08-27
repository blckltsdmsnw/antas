-- supabase/migrations/0029_my_reports_hazard.sql
--
-- /ako survives a non-flood report.
--
-- 0028 widened depth_reports past flood and made depth NULL for every other
-- hazard, but my_reports() (0015) still returns only depth - so a resident
-- who filed a fire opens "my reports" and sees a colourless swatch and an
-- empty label where the hazard should be. report_queue and report_detail
-- already carry hazard_type and severity (0028 §7); my_reports is the one
-- function that section missed because /ako was outside that migration's
-- file list.
--
-- Return shape changes, so create or replace cannot be used - Postgres
-- refuses to change a returns table. Dropped and recreated instead, which
-- also drops the grants (0013's lesson, repeated in 0028's own comment on
-- report_queue/report_detail): restated below.
--
-- Restated from 0016, NOT from 0015. 0015's own `revoke ... from anon` did
-- nothing - PostgreSQL grants EXECUTE to PUBLIC by default and anon inherits
-- from PUBLIC, so revoking only from anon leaves the inherited grant intact.
-- 0016 is the migration that actually closed this off, by revoking from
-- `public, anon` together. Dropping the function drops that fix along with
-- the old shape; recreating with 0015's spelling would silently reopen this
-- function to every anonymous caller. Checked, not assumed - see the note
-- after the grant below.
drop function my_reports();

create function my_reports()
returns table (
  id          uuid,
  hazard_type hazard_type,
  severity    smallint,
  depth       depth_level,
  reported_at timestamptz,
  photo_path  text,
  lat         double precision,
  lon         double precision,
  barangay    text,
  status      text
)
language sql
stable
security invoker
-- `extensions` must be on the path: PostGIS lives there, not in public.
set search_path = public, extensions
as $$
  select
    r.id,
    r.hazard_type,
    r.severity,
    r.depth,
    r.reported_at,
    r.photo_path,
    st_y(r.location::geometry) as lat,
    st_x(r.location::geometry) as lon,
    -- Approximate, per the caveat in 0009. Enough to remind you which report
    -- this was; never presented as the report's official location.
    nearest_barangay(r.location) as barangay,
    r.status
  from depth_reports r
  where r.reporter_id = auth.uid()
  order by r.reported_at desc
  limit 100;
$$;

-- A signed-out caller has no uid and would get nothing anyway, but saying so
-- explicitly matches how 0007 and 0010 lock down their user-scoped functions,
-- rather than relying on an empty result to mean "denied". `from public,
-- anon` together, per 0016 - `from anon` alone is a no-op.
revoke execute on function my_reports() from public, anon;
grant execute on function my_reports() to authenticated, service_role;
