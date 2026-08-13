-- Barangay scoping.
--
-- 0005 created sos_signals.barangay and 0006 wrote the moderator policy that
-- matches on it, but nothing ever populated it. A NULL never equals anything,
-- so every moderator would have opened an empty queue forever, with no error.
--
-- PRECISION NOTE, read before trusting this: these are approximate centroids,
-- not official boundaries. A nearest-centroid match is good enough to route a
-- signal to the right barangay desk in a pilot, and is honest about being
-- approximate - but a real deployment should load official barangay boundary
-- polygons and use st_contains instead. Do not present this as authoritative
-- to a responder deciding where to send a boat.
create table barangays (
  name     text primary key,
  centroid geography(Point, 4326) not null
);

create index barangays_centroid_idx on barangays using gist (centroid);

-- Marikina City's 16 barangays.
insert into barangays (name, centroid) values
  ('Barangka',            'SRID=4326;POINT(121.0850 14.6300)'),
  ('Calumpang',           'SRID=4326;POINT(121.0900 14.6250)'),
  ('Concepcion Uno',      'SRID=4326;POINT(121.1010 14.6480)'),
  ('Concepcion Dos',      'SRID=4326;POINT(121.1150 14.6600)'),
  ('Fortune',             'SRID=4326;POINT(121.1220 14.6720)'),
  ('Industrial Valley',   'SRID=4326;POINT(121.1000 14.6350)'),
  ('Jesus de la Pena',    'SRID=4326;POINT(121.0950 14.6180)'),
  ('Malanday',            'SRID=4326;POINT(121.0950 14.6560)'),
  ('Marikina Heights',    'SRID=4326;POINT(121.1180 14.6560)'),
  ('Nangka',              'SRID=4326;POINT(121.1080 14.6800)'),
  ('Parang',              'SRID=4326;POINT(121.1000 14.6680)'),
  ('San Roque',           'SRID=4326;POINT(121.0960 14.6330)'),
  ('Santa Elena',         'SRID=4326;POINT(121.0930 14.6300)'),
  ('Santo Nino',          'SRID=4326;POINT(121.0980 14.6270)'),
  ('Tanong',              'SRID=4326;POINT(121.0870 14.6220)'),
  ('Tumana',              'SRID=4326;POINT(121.0880 14.6620)');

-- Barangay names are public reference data - there is nothing sensitive in a
-- list of place names, and the public SOS aggregate already returns them.
alter table barangays enable row level security;

grant select on barangays to anon, authenticated;
grant select, insert, update, delete on barangays to service_role;

create policy "barangay names are public reference data"
  on barangays for select
  using (true);

-- Nearest barangay to a point. Uses the KNN operator against the GiST index
-- rather than computing distance to all 16 rows.
create or replace function nearest_barangay(point geography)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select b.name
    from barangays b
   order by b.centroid <-> point
   limit 1;
$fn$;

-- Assigned by trigger rather than by the application, so it holds for every
-- writer: the server action, the seed script, tests, and anything added later.
-- An application-level assignment is one forgotten call site away from the
-- NULL this migration exists to fix.
create or replace function set_sos_barangay()
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

create trigger sos_signals_set_barangay
  before insert on sos_signals
  for each row execute function set_sos_barangay();

-- Backfill signals created before this migration, so the moderator queue is
-- not permanently blind to them.
update sos_signals
   set barangay = nearest_barangay(location)
 where barangay is null;
