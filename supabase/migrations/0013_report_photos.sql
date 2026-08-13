-- Photos on ordinary depth reports.
--
-- Deliberately a *public* bucket, unlike sos-photos. These are pictures of a
-- street, attached to a pin that anyone can tap, and the whole point is that a
-- stranger deciding whether to drive down that road can see the water. The
-- capture screen says so in plain Filipino before the shutter is offered.
--
-- The privacy asymmetry with SOS is intentional and worth stating: an SOS photo
-- is a person in distress and stays behind a signed URL for moderators only. A
-- depth report is a street.
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

-- Upload only into your own folder, keyed by user id - same shape as sos-photos.
create policy "users upload their own report photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update or delete policy, for either role. A report that turns out to be
-- wrong is hidden by moving depth_reports.status off 'active', which drops it
-- from reports_near and therefore from the map. Letting a reporter mutate the
-- object in place would leave the map showing one photo under another's caption.

-- reports_near gains photo_path. CREATE OR REPLACE cannot change a function's
-- OUT columns, so the old signature has to go first.
drop function if exists reports_near(double precision, double precision, double precision);

create function reports_near(
  lat      double precision,
  lon      double precision,
  radius_m double precision
)
returns table (
  id          uuid,
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
-- `extensions` must be on the path: PostGIS lives there, not in public, so pinning
-- to public alone would make st_dwithin and st_distance unresolvable inside here.
set search_path = public, extensions
as $fn$
  select
    r.id,
    r.depth,
    r.reported_at,
    r.photo_path,
    st_y(r.location::geometry) as lat,
    st_x(r.location::geometry) as lon,
    st_distance(r.location, st_point(reports_near.lon, reports_near.lat)::geography) as distance_m
  from depth_reports r
  where r.status = 'active'
    and st_dwithin(r.location, st_point(reports_near.lon, reports_near.lat)::geography, reports_near.radius_m)
  order by distance_m;
$fn$;

-- Dropping the function dropped its grants with it.
revoke all on function reports_near(double precision, double precision, double precision) from public;
grant execute on function reports_near(double precision, double precision, double precision) to anon, authenticated;
