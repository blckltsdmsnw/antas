-- Search the pilot area by name.
--
-- The map opens at the centre of Metro Manila and the premise of the product is
-- "has MY street flooded". Without this, answering that question starts with
-- panning and pinching across the region to find your own barangay, which is
-- the longest possible route to the shortest possible answer.
--
-- Searches `barangays`, which already exists to route SOS signals to a desk, so
-- this adds no new source of truth. It inherits that table's caveat, and the
-- caveat matters differently here: the centroids are approximate, so a result
-- centres the map NEAR a place, never ON its boundary. Fine for "take me to
-- Malanday"; not a basis for anything claiming to draw where a barangay ends.
--
-- GRANULARITY IS UNEVEN, per 0011. Marikina and Taguig are at barangay level;
-- the rest of NCR is one row per city. So "Pasig" finds a city centre and
-- "Tumana" finds a barangay - both honest, because every row carries its city
-- and the interface shows it.

create or replace function search_places(q text)
returns table (
  name text,
  city text,
  lat  double precision,
  lon  double precision
)
language sql
stable
security invoker
-- `extensions` must be on the path: PostGIS lives there, not in public, so
-- st_x and st_y would be unresolvable pinned to public alone.
set search_path = public, extensions
as $$
  select
    b.name,
    b.city,
    st_y(b.centroid::geometry) as lat,
    st_x(b.centroid::geometry) as lon
  from barangays b
  where length(btrim(search_places.q)) >= 2
    and (
      b.name ilike '%' || btrim(search_places.q) || '%'
      or b.city ilike '%' || btrim(search_places.q) || '%'
    )
  order by
    -- Prefix matches first: typing "Tan" should surface Tanong above
    -- Bagumbayan, which only contains those letters in the middle.
    (b.name ilike btrim(search_places.q) || '%') desc,
    (b.city ilike btrim(search_places.q) || '%') desc,
    length(b.name),
    b.name
  limit 8;
$$;

-- Place names are public reference data - the table's own select policy already
-- says so, and a visitor who has never signed in is exactly the person who
-- needs to find their street. Granted explicitly rather than left to the
-- default, matching how 0013 grants reports_near.
grant execute on function search_places(text) to anon, authenticated, service_role;
