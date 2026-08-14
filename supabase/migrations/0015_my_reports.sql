-- The reports you filed yourself.
--
-- Until now a report vanished the moment it was sent: it became one pin among
-- hundreds, with no way to see what you had contributed, no way to notice you
-- had picked the wrong depth, and no way to tell whether it was still on the
-- map at all. Asking someone to contribute and then hiding their contribution
-- from them is a poor deal to offer a volunteer.
--
-- A function rather than a client-side filter, for the same reason as
-- `reports_near`: `location` is a geography column, and selecting it through
-- PostgREST returns WKB hex the browser would then have to decode. The database
-- already knows how to turn a point into two numbers.
--
-- Scoped to auth.uid() inside the body, never by a filter the caller passes. A
-- caller-supplied reporter_id would be a request to trust the client about
-- whose reports these are.

create or replace function my_reports()
returns table (
  id          uuid,
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
-- rather than relying on an empty result to mean "denied".
revoke execute on function my_reports() from anon;
grant execute on function my_reports() to authenticated, service_role;
