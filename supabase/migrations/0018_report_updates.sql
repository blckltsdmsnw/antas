-- "Kumusta na?" - is that report still true?
--
-- The question people actually ask of a pin is not "who said this" but "is it
-- still like that". Free-text comments were the obvious way to allow it and the
-- wrong one: nobody moderates this application, and a comment reading "wala na
-- po" under a report where the water is still chest-deep can get somebody hurt.
-- A structured answer carries the same information, needs no moderation because
-- there is no prose to moderate, and - unlike a comment thread - it can feed the
-- map rather than sitting beside it.
--
-- Three states, deliberately not five. This is not a second depth reading; it is
-- a statement about the reading that already exists. Somebody recording an
-- actual new depth files a report, which is a different act.

create type report_state as enum ('gone', 'same', 'deeper');

create table report_updates (
  id          uuid         primary key default gen_random_uuid(),
  report_id   uuid         not null references depth_reports (id) on delete cascade,
  reporter_id uuid         not null references profiles (id)      on delete cascade,
  state       report_state not null,
  created_at  timestamptz  not null default now(),

  -- One standing answer per person per report. Without this a single user can
  -- post "wala na" fifty times and manufacture a consensus; with it, saying it
  -- again replaces what they said before - which is what a person changing
  -- their mind actually means.
  unique (report_id, reporter_id)
);

create index report_updates_report_idx on report_updates (report_id, created_at desc);

/*
 * NOBODY REACHES THIS TABLE DIRECTLY. Not anonymous visitors, not signed-in
 * users - no select, no insert, no update, no delete. The two functions below
 * are the entire public surface.
 *
 * The reason is the reporter_id column. Rows here say who was standing where
 * and when, which is the same thing `profiles` is locked down to protect, and
 * PostgREST will happily serve any column a role can select. Column-scoped
 * grants were tried first and are not enough: an upsert needs SELECT on the
 * table to resolve its conflict target, so permitting people to answer at all
 * would have meant permitting them to read who else had.
 *
 * So: no grants, and row-level security left enabled with no policy attached.
 * Either barrier alone would do. Both together mean a future migration that
 * copy-pastes a `grant select ... to anon` still exposes nothing, because there
 * is no policy for those rows to pass.
 */
revoke all on report_updates from anon, authenticated;
grant  all on report_updates to service_role;

alter table report_updates enable row level security;

/*
 * A summary, not the rows.
 *
 * Counts and the latest timestamp answer "kumusta na" without naming anybody.
 * Public on purpose: a visitor who has never signed in is exactly the person
 * who needs to know the water has gone.
 */
create or replace function report_update_summary(report_id uuid)
returns table (
  state  report_state,
  votes  integer,
  latest timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.state, count(*)::integer, max(u.created_at)
  from report_updates u
  where u.report_id = report_update_summary.report_id
  group by u.state
  order by max(u.created_at) desc;
$$;

-- Revoked from PUBLIC, not from anon. EXECUTE is granted to PUBLIC by default,
-- and anon inherits it from there - so revoking "from anon" is a no-op that
-- reads like a lock. This is the same mistake 0016 exists to correct.
revoke execute on function report_update_summary(uuid) from public;
grant  execute on function report_update_summary(uuid) to anon, authenticated, service_role;

/*
 * Answering, with the name taken from the session rather than the request.
 *
 * There is no reporter_id parameter, so there is nothing to forge: the function
 * writes auth.uid() and only auth.uid(). That is a stronger guarantee than the
 * `with check (reporter_id = auth.uid())` policy it replaces, which could only
 * reject a lie after the caller had told it.
 */
-- The p_ prefixes are not decoration. A plpgsql parameter named `report_id`
-- shadows the column of that name everywhere in the body - including the
-- `on conflict` target, where it fails as "column reference is ambiguous" only
-- once a second answer to the same report actually arrives. That is a bug that
-- passes a first-write test and breaks in front of a user.
create or replace function submit_report_update(p_report_id uuid, p_state report_state)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- A definer function runs as its owner, so this check is the only thing
  -- standing between an anonymous caller and a write. Not decoration.
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into report_updates (report_id, reporter_id, state)
  values (p_report_id, auth.uid(), p_state)
  on conflict (report_id, reporter_id)
  -- Changing your mind moves your one answer, and re-dates it: the freshness
  -- of an answer is the whole basis on which the interface ranks them.
  do update set state = excluded.state, created_at = now();
end;
$$;

revoke execute on function submit_report_update(uuid, report_state) from public;
grant  execute on function submit_report_update(uuid, report_state) to authenticated, service_role;

-- Removing your own report.
--
-- Hidden, never deleted. The row is evidence that somebody reported something,
-- and rewriting that is not ours to do - the map simply stops showing it, which
-- is what "remove" means to the person asking. The public read policy already
-- filters on `status = 'active'`, so hiding is enough to take it off the map.
--
-- The UPDATE grant is COLUMN-SCOPED. A table-wide grant would let a reporter
-- rewrite their own depth or move their own pin after the fact; this permits
-- exactly one column to change, and the policy below permits exactly one value.
grant update (status) on depth_reports to authenticated;

create policy "users hide their own report"
  on depth_reports for update
  to authenticated
  using (reporter_id = auth.uid())
  with check (reporter_id = auth.uid() and status = 'hidden');

/*
 * And the policy that makes the one above possible at all.
 *
 * PostgreSQL applies SELECT policies to the NEW row of an UPDATE. With only
 * `status = 'active'` on the table, hiding a report is self-defeating: the
 * instant status becomes 'hidden' the row is no longer selectable, and the
 * update is rejected as "new row violates row-level security policy". The hide
 * above cannot work without this, which is not obvious from reading either
 * policy alone - hence the note.
 *
 * It is also correct on its own terms. A reporter being unable to see what they
 * filed is the gap /ako was built to close, and it currently reaches around this
 * table through a definer function to do it. Scoped to auth.uid(), so it widens
 * nothing for anybody else.
 */
create policy "users read their own reports"
  on depth_reports for select
  to authenticated
  using (reporter_id = auth.uid());
