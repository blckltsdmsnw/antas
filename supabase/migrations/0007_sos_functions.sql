-- How many independent depth reports back up a claim at this point, recently.
-- security definer because the caller is the server action, and the count must
-- not vary with who is asking.
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
     and r.reported_at >= now() - make_interval(mins => within_minutes)
     and st_dwithin(
           r.location,
           st_point(corroborating_reports.lon, corroborating_reports.lat)::geography,
           corroborating_reports.radius_m
         );
$fn$;

-- The ONLY public view of distress activity: a count per barangay. No pins,
-- no photos, no identities. Publicly pinning a distressed person's exact
-- location endangers them - looting and harassment follow disasters.
create or replace function sos_counts_by_barangay()
returns table (barangay text, active_count bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.barangay, count(*) as active_count
    from sos_signals s
   where s.status in ('pending', 'under_review', 'confirmed')
     and s.barangay is not null
   group by s.barangay;
$fn$;

revoke execute on function corroborating_reports(double precision, double precision, double precision, integer) from anon;
