-- Manila, at district level instead of one city-wide bucket.
--
-- 0011 seeded every NCR city outside the pilot as a single centroid, so an SOS
-- anywhere in Manila was labelled "Manila" - a bucket covering 1.8 million
-- people. Whoever moderated it was moderating the whole city.
--
-- WHY DISTRICTS AND NOT BARANGAYS. Manila has 896 barangays, most of them a few
-- blocks across. Writing 896 centroids from memory would be inventing the data
-- that decides which desk an emergency reaches, and at that spacing the error
-- would exceed the distance between neighbours - a nearest-centroid match would
-- be worse than useless, because it would look precise while being wrong. The
-- 16 districts are large, long-established divisions that can be placed
-- honestly, and they are a real improvement: CEU Mendiola now resolves to San
-- Miguel rather than to the entire city.
--
-- THESE ARE DISTRICTS IN A TABLE CALLED `barangays`, which is a wart worth
-- naming rather than hiding. The table already holds city-level placeholders
-- that are not barangays either; what it actually stores is "the smallest area
-- we can route to here". Renaming it would touch the trigger, nearest_barangay,
-- search_places, the moderators table and every scope check - and moving to
-- official boundary polygons would replace all of it anyway - so the honest
-- description lives here instead.
--
-- Same caveat as 0009 and 0011: approximate centroids, not official boundaries.
-- Good enough to route a signal to a desk; not something to hand a responder
-- deciding which street to go down.

insert into barangays (name, city, centroid) values
  ('Binondo',     'Manila', 'SRID=4326;POINT(120.9740 14.6000)'),
  ('Ermita',      'Manila', 'SRID=4326;POINT(120.9820 14.5820)'),
  ('Intramuros',  'Manila', 'SRID=4326;POINT(120.9750 14.5890)'),
  ('Malate',      'Manila', 'SRID=4326;POINT(120.9870 14.5700)'),
  ('Paco',        'Manila', 'SRID=4326;POINT(120.9930 14.5830)'),
  ('Pandacan',    'Manila', 'SRID=4326;POINT(121.0010 14.5920)'),
  ('Port Area',   'Manila', 'SRID=4326;POINT(120.9640 14.5920)'),
  ('Quiapo',      'Manila', 'SRID=4326;POINT(120.9840 14.5990)'),
  ('Sampaloc',    'Manila', 'SRID=4326;POINT(120.9930 14.6130)'),
  ('San Andres',  'Manila', 'SRID=4326;POINT(120.9950 14.5730)'),
  ('San Miguel',  'Manila', 'SRID=4326;POINT(120.9920 14.5980)'),
  ('San Nicolas', 'Manila', 'SRID=4326;POINT(120.9710 14.5980)'),
  ('Santa Ana',   'Manila', 'SRID=4326;POINT(121.0080 14.5840)'),
  ('Santa Cruz',  'Manila', 'SRID=4326;POINT(120.9820 14.6060)'),
  ('Santa Mesa',  'Manila', 'SRID=4326;POINT(121.0110 14.5990)'),
  ('Tondo',       'Manila', 'SRID=4326;POINT(120.9670 14.6150)');

-- Repoint anyone scoped to the placeholder BEFORE removing it, exactly as 0012
-- did for 'Signal Village'. Deleting first would leave a moderator pointing at
-- a name that no longer exists, and they would open an empty queue forever with
-- no error - the same silent failure 0009 was written to fix.
--
-- The replacement is the district nearest to where the placeholder stood, which
-- is the city centre, so "whoever covered Manila" becomes "whoever covers the
-- middle of Manila" rather than an arbitrary pick. No such rows existed on
-- either database when this was written; it is here so that stops being luck.
update moderators
   set barangay = (
     select b.name
       from barangays b
      where b.city = 'Manila'
        and b.name <> 'Manila'
      -- extensions.st_distance, not the `<->` KNN operator. PostGIS is
      -- installed into `extensions` rather than `public` (see 0003), and a bare
      -- migration statement does not carry the search_path that the functions
      -- here set for themselves - so `<->` resolves locally and fails on the
      -- hosted project with "operator does not exist". Qualifying the function
      -- is immune to that, and the index it forgoes is irrelevant over 16 rows.
      order by extensions.st_distance(
        b.centroid,
        (select centroid from barangays where name = 'Manila')
      )
      limit 1
   )
 where barangay = 'Manila';

delete from barangays where name = 'Manila';

-- Now that the bucket is gone, re-resolve the signals that were in it. After
-- the delete on purpose: run this before, and nearest_barangay would simply
-- hand back 'Manila' again.
update sos_signals
   set barangay = nearest_barangay(location)
 where barangay = 'Manila';
