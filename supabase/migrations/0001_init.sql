-- Install into `extensions`, NOT `public`. PostGIS ships a writable catalog table,
-- spatial_ref_sys, and PostgREST serves every table in `public` — so installing here
-- would expose it at the REST API with anon holding DELETE and TRUNCATE and no RLS,
-- letting anyone drop the SRID 4326 definition every geography column depends on.
-- The `extensions` schema is not in PostgREST's exposed list, and this matches what
-- hosted Supabase does by default. postgis is not relocatable, so it must be created
-- in the right schema up front rather than moved later.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create type depth_level as enum ('ankle', 'knee', 'waist', 'chest', 'above_head');

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null,
  barangay     text,
  suspended_at timestamptz,
  created_at   timestamptz not null default now()
);

create table depth_reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid                   not null references profiles (id) on delete cascade,
  location       geography(Point, 4326) not null,
  depth          depth_level            not null,
  photo_path     text,
  gps_accuracy_m double precision,
  reported_at    timestamptz            not null default now(),
  source         text                   not null default 'user'
                   check (source in ('user', 'seed')),
  status         text                   not null default 'active'
                   check (status in ('active', 'flagged', 'hidden'))
);

create index depth_reports_location_idx    on depth_reports using gist (location);
create index depth_reports_reported_at_idx on depth_reports (reported_at desc);

-- Create a profile automatically whenever an auth user is created.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Anonymous'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
