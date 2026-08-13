-- Start from zero rather than inheriting any default ACL, which can hand out
-- TRUNCATE and TRIGGER. RLS does not govern TRUNCATE.
revoke all on sos_signals   from anon, authenticated;
revoke all on env_snapshots from anon, authenticated;
revoke all on signal_events from anon, authenticated;
revoke all on reputation    from anon, authenticated;
revoke all on moderators    from anon, authenticated;

-- A distressed person's location and photograph are never public. anon holds
-- nothing on any of these tables: denied at the grant layer as well as by RLS.
grant select, insert on sos_signals to authenticated;
grant select         on moderators  to authenticated;

grant select, insert, update, delete on sos_signals   to service_role;
grant select, insert, update, delete on env_snapshots to service_role;
grant select, insert, update, delete on signal_events to service_role;
grant select, insert, update, delete on reputation    to service_role;
grant select, insert, update, delete on moderators    to service_role;

alter table sos_signals   enable row level security;
alter table env_snapshots enable row level security;
alter table signal_events enable row level security;
alter table reputation    enable row level security;
alter table moderators    enable row level security;

-- A reporter may read their own signals, and file only in their own name.
create policy "reporters read their own signals"
  on sos_signals for select
  to authenticated
  using (reporter_id = auth.uid());

create policy "reporters create signals in their own name"
  on sos_signals for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- A moderator may read signals in their own barangay only.
create policy "moderators read their barangay"
  on sos_signals for select
  to authenticated
  using (
    exists (
      select 1
        from moderators m
       where m.user_id = auth.uid()
         and m.barangay = sos_signals.barangay
    )
  );

create policy "moderators read their own row"
  on moderators for select
  to authenticated
  using (user_id = auth.uid());

-- env_snapshots, signal_events and reputation get NO policy for authenticated.
-- They are service-role only in this phase; the console reads them through a
-- security-definer function in Phase 2B, so no policy is the correct posture.
