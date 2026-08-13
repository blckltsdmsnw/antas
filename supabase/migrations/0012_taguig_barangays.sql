-- Fill in Taguig properly.
--
-- 0011 seeded 12 Taguig barangays and got one of them wrong: "Signal Village"
-- is not a barangay. Taguig has Central, North and South Signal Village as
-- three separate barangays. It also omitted New Lower Bicutan entirely, which
-- is distinct from Lower Bicutan.
--
-- Same caveat as 0009 and 0011, and it matters more the finer the granularity
-- gets: these are approximate centroids, not official boundaries. Two adjacent
-- barangays a few hundred metres apart can be resolved the wrong way by a
-- nearest-centroid match. That is acceptable for routing a signal to a desk in
-- a pilot; it is not acceptable as a basis for telling a rescuer which street
-- to go down. Official boundary polygons and st_contains are the real fix.

-- Repoint anything already assigned to the name that should not have existed,
-- before removing it. Deleting first would orphan those rows.
update sos_signals
   set barangay = 'Central Signal Village'
 where barangay = 'Signal Village';

update moderators
   set barangay = 'Central Signal Village'
 where barangay = 'Signal Village';

insert into barangays (name, city, centroid) values
  ('Central Signal Village', 'Taguig', 'SRID=4326;POINT(121.0590 14.5090)'),
  ('North Signal Village',   'Taguig', 'SRID=4326;POINT(121.0620 14.5140)'),
  ('South Signal Village',   'Taguig', 'SRID=4326;POINT(121.0580 14.5040)'),
  ('New Lower Bicutan',      'Taguig', 'SRID=4326;POINT(121.0530 14.4970)'),
  ('Maharlika Village',      'Taguig', 'SRID=4326;POINT(121.0500 14.5120)'),
  ('Katuparan',              'Taguig', 'SRID=4326;POINT(121.0540 14.5150)'),
  ('Tanyag',                 'Taguig', 'SRID=4326;POINT(121.0700 14.5060)'),
  ('North Daang Hari',       'Taguig', 'SRID=4326;POINT(121.0480 14.4900)'),
  ('South Daang Hari',       'Taguig', 'SRID=4326;POINT(121.0450 14.4850)'),
  ('Calzada',                'Taguig', 'SRID=4326;POINT(121.0810 14.5330)'),
  ('Ibayo-Tipas',            'Taguig', 'SRID=4326;POINT(121.0840 14.5390)'),
  ('Ligid-Tipas',            'Taguig', 'SRID=4326;POINT(121.0870 14.5360)'),
  ('Palingon',               'Taguig', 'SRID=4326;POINT(121.0770 14.5310)'),
  ('Wawa',                   'Taguig', 'SRID=4326;POINT(121.0830 14.5290)'),
  ('Bambang',                'Taguig', 'SRID=4326;POINT(121.0740 14.5290)')
on conflict (name) do nothing;

delete from barangays where name = 'Signal Village';
