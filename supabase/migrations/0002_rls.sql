-- This local Supabase stack's default privileges for the `postgres` role (the role
-- migrations run as) do not include select/insert/update/delete for anon,
-- authenticated, or service_role on tables it creates -- only truncate/references/
-- trigger/maintain. (Objects owned by supabase_admin, e.g. the PostGIS extension
-- views, do carry the permissive defaults; objects created via migrations do not.)
-- Row-level security restricts *which rows* a role can see or touch; it has no
-- effect until the role can attempt the operation at all. Both grants below are
-- required before the policies further down can do anything.

-- Start from zero rather than inheriting the stack's default ACL, which hands
-- out TRUNCATE and TRIGGER. RLS does not apply to TRUNCATE, so an inherited
-- TRUNCATE would let a role empty the table with no policy able to stop it.
revoke all on depth_reports from anon, authenticated;
revoke all on profiles      from anon, authenticated;

grant select                         on depth_reports to anon, authenticated;
grant insert                         on depth_reports to authenticated;
grant select, insert, update, delete on depth_reports to service_role;

-- profiles will hold verified phone numbers from Phase 2 onward. Deny anon at
-- the grant layer, not just via RLS: today anon matches no select policy so it
-- would see nothing anyway, but that safety is one layer (RLS). Withholding the
-- grant is a second, independent layer, so a future permissive policy or an
-- accidental "disable row level security" cannot expose this table to the
-- public. Do not restore this grant to anon.
grant select                         on profiles to authenticated;
grant update                         on profiles to authenticated;
grant select, insert, update, delete on profiles to service_role;

alter table profiles      enable row level security;
alter table depth_reports enable row level security;

-- Depth reports are public data: anyone may read active ones.
create policy "active depth reports are publicly readable"
  on depth_reports for select
  using (status = 'active');

-- Only a signed-in user may create a report, and only in their own name.
create policy "users insert their own depth reports"
  on depth_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- A user may read and update only their own profile.
create policy "users read their own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "users update their own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
