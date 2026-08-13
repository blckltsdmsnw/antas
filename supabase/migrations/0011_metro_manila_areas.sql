-- Widen the pilot area from Marikina to Metro Manila.
--
-- The application bounds moved first, but bounds alone are not enough: the
-- BEFORE INSERT trigger from 0009 assigns the NEAREST row in this table, so a
-- signal sent from Taguig would have been labelled "Jesus de la Pena,
-- Marikina" and routed to the wrong barangay desk - silently, with no error.
-- Widening the map without widening this table is the dangerous half of the
-- change.
--
-- GRANULARITY IS DELIBERATELY UNEVEN, and worth understanding before relying
-- on it. Marikina and Taguig are seeded at barangay level because they are the
-- active pilot areas. The remaining NCR cities are seeded as a single entry at
-- the city centre, so a signal from, say, Pasig is labelled "Pasig" rather than
-- a barangay. That is coarse but honest - inventing centroids for all ~1,700
-- barangays in the region would be precision we do not have.
--
-- Same caveat as 0009: these are approximate centroids, not official
-- boundaries. Good enough to route a signal to the right desk; not something to
-- present as authoritative to a responder deciding where to send a boat.

alter table barangays add column city text not null default 'Marikina';

-- Taguig, at barangay level.
insert into barangays (name, city, centroid) values
  ('Fort Bonifacio',   'Taguig', 'SRID=4326;POINT(121.0490 14.5510)'),
  ('Ususan',           'Taguig', 'SRID=4326;POINT(121.0680 14.5290)'),
  ('Bagumbayan',       'Taguig', 'SRID=4326;POINT(121.0620 14.5400)'),
  ('Signal Village',   'Taguig', 'SRID=4326;POINT(121.0570 14.5100)'),
  ('Western Bicutan',  'Taguig', 'SRID=4326;POINT(121.0430 14.5170)'),
  ('Central Bicutan',  'Taguig', 'SRID=4326;POINT(121.0500 14.5060)'),
  ('Lower Bicutan',    'Taguig', 'SRID=4326;POINT(121.0640 14.5030)'),
  ('Upper Bicutan',    'Taguig', 'SRID=4326;POINT(121.0480 14.5090)'),
  ('Pinagsama',        'Taguig', 'SRID=4326;POINT(121.0560 14.5240)'),
  ('Tuktukan',         'Taguig', 'SRID=4326;POINT(121.0700 14.5340)'),
  ('Napindan',         'Taguig', 'SRID=4326;POINT(121.0900 14.5450)'),
  ('Hagonoy',          'Taguig', 'SRID=4326;POINT(121.0760 14.5220)')
on conflict (name) do nothing;

-- The rest of the National Capital Region, at city level.
insert into barangays (name, city, centroid) values
  ('Manila',        'Manila',        'SRID=4326;POINT(120.9842 14.5995)'),
  ('Quezon City',   'Quezon City',   'SRID=4326;POINT(121.0437 14.6760)'),
  ('Caloocan',      'Caloocan',      'SRID=4326;POINT(120.9668 14.6507)'),
  ('Las Pinas',     'Las Pinas',     'SRID=4326;POINT(120.9833 14.4499)'),
  ('Makati',        'Makati',        'SRID=4326;POINT(121.0244 14.5547)'),
  ('Malabon',       'Malabon',       'SRID=4326;POINT(120.9568 14.6626)'),
  ('Mandaluyong',   'Mandaluyong',   'SRID=4326;POINT(121.0359 14.5794)'),
  ('Muntinlupa',    'Muntinlupa',    'SRID=4326;POINT(121.0415 14.4081)'),
  ('Navotas',       'Navotas',       'SRID=4326;POINT(120.9417 14.6667)'),
  ('Paranaque',     'Paranaque',     'SRID=4326;POINT(121.0198 14.4793)'),
  ('Pasay',         'Pasay',         'SRID=4326;POINT(121.0014 14.5378)'),
  ('Pasig',         'Pasig',         'SRID=4326;POINT(121.0851 14.5764)'),
  ('Pateros',       'Pateros',       'SRID=4326;POINT(121.0687 14.5456)'),
  ('San Juan',      'San Juan',      'SRID=4326;POINT(121.0355 14.6019)'),
  ('Valenzuela',    'Valenzuela',    'SRID=4326;POINT(120.9830 14.7000)')
on conflict (name) do nothing;
