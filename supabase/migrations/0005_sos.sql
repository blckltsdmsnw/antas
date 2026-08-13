create type sos_status as enum (
  'pending', 'under_review', 'confirmed', 'dismissed', 'resolved'
);

create type dismiss_reason as enum (
  'false_report', 'duplicate', 'resolved_already', 'insufficient_info'
);

create table sos_signals (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid                   not null references profiles (id) on delete cascade,
  location       geography(Point, 4326) not null,
  depth          depth_level            not null,
  photo_path     text                   not null,
  note           text,
  gps_accuracy_m double precision,
  status         sos_status             not null default 'pending',
  barangay       text,
  trust_score    integer,
  confidence     text check (confidence in ('high', 'medium', 'low')),
  reasons        jsonb                  not null default '[]'::jsonb,
  dismissed_as   dismiss_reason,
  created_at     timestamptz            not null default now(),
  resolved_at    timestamptz
);

-- The one-active-signal rule, enforced by the database rather than by
-- application code. 'dismissed' and 'resolved' are excluded deliberately:
-- someone whose signal was dismissed last week can be in danger today.
create unique index sos_one_active_per_reporter
  on sos_signals (reporter_id)
  where status in ('pending', 'under_review', 'confirmed');

create index sos_signals_location_idx on sos_signals using gist (location);
create index sos_signals_triage_idx
  on sos_signals (status, trust_score desc nulls first, created_at);

-- Environmental facts as they were AT SUBMISSION. Checking the weather days
-- later reveals nothing about conditions when the signal was sent.
create table env_snapshots (
  sos_id                  uuid primary key references sos_signals (id) on delete cascade,
  rainfall_24h_mm         double precision,
  elevation_m             double precision,
  surrounding_elevation_m double precision,
  corroborating_reports   integer     not null default 0,
  provider_ok             boolean     not null,
  fetched_at              timestamptz not null default now()
);

-- Append-only. Nothing is ever deleted, only transitioned; accountability
-- requires the trail to survive the decision.
create table signal_events (
  id         bigint generated always as identity primary key,
  sos_id     uuid        not null references sos_signals (id) on delete cascade,
  actor_id   uuid                 references profiles (id),
  event_type text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index signal_events_sos_idx on signal_events (sos_id, created_at);

create table reputation (
  user_id            uuid primary key references profiles (id) on delete cascade,
  confirmed_count    integer     not null default 0,
  false_report_count integer     not null default 0,
  updated_at         timestamptz not null default now()
);

create table moderators (
  user_id    uuid primary key references profiles (id) on delete cascade,
  barangay   text        not null,
  role       text        not null default 'moderator'
               check (role in ('moderator', 'admin')),
  created_at timestamptz not null default now()
);

create index moderators_barangay_idx on moderators (barangay);
