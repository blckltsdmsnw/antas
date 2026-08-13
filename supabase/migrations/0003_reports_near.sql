create or replace function reports_near(
  lat      double precision,
  lon      double precision,
  radius_m double precision
)
returns table (
  id          uuid,
  depth       depth_level,
  reported_at timestamptz,
  lat         double precision,
  lon         double precision,
  distance_m  double precision
)
language sql
stable
security invoker
-- `extensions` must be on the path: PostGIS lives there, not in public, so pinning
-- to public alone would make st_dwithin and st_distance unresolvable inside here.
set search_path = public, extensions
as $$
  select
    r.id,
    r.depth,
    r.reported_at,
    st_y(r.location::geometry) as lat,
    st_x(r.location::geometry) as lon,
    st_distance(r.location, st_point(reports_near.lon, reports_near.lat)::geography) as distance_m
  from depth_reports r
  where r.status = 'active'
    and st_dwithin(r.location, st_point(reports_near.lon, reports_near.lat)::geography, reports_near.radius_m)
  order by distance_m;
$$;
