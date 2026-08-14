-- Reporter standing, without reporter identity.
--
-- The request was to show who filed a report. This answers what that request
-- was actually for - "can I trust this depth?" - without publishing anybody.
--
-- A name cannot answer that question. A stranger's name is not evidence, and
-- attaching one to a location and a timestamp turns every report into a public
-- record that a named person was standing at a particular place during a
-- disaster, when their house may be empty. Whether their past readings held up
-- IS evidence, and it names nobody.
--
-- Only possible because 0018 exists: `report_updates` is the first thing in
-- this schema that can say whether a depth report was true.

/*
 * Returns 'reliable' or 'none'. Deliberately not a number.
 *
 * ONE VALUE, NOT COUNTS, and that is a privacy decision rather than a UI one.
 * Exact tallies ("7 of 8 held up") would be close to a fingerprint per author:
 * anyone could walk every report, group them by identical tallies, and recover
 * which reports came from the same person - and from there, that somebody
 * reports from the same street every morning, which is where they live. A
 * two-valued answer makes that clustering worthless while still telling the
 * reader the one thing they wanted to know.
 *
 * There is deliberately NO negative value. A public "this person is often
 * wrong" mark, computed from a handful of taps on an application nobody
 * moderates and with no way to appeal, is a punishment mechanism. Standing is
 * earned and shown; its absence means "not established", which covers everybody
 * new and is not a judgement.
 */
create or replace function reporter_standing(p_report_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with author as (
    select r.reporter_id
    from depth_reports r
    where r.id = p_report_id
  ),
  -- One verdict per report, not per answer, so a single busy report cannot
  -- carry somebody's whole standing on its own.
  verdicts as (
    select
      r.id,
      count(*) filter (where u.state in ('same', 'deeper')) >
      count(*) filter (where u.state = 'gone') as held
    from depth_reports r
    join author a on a.reporter_id = r.reporter_id
    join report_updates u
      on u.report_id = r.id
      -- WITHIN THE HOUR THAT FOLLOWS, or the measure is nonsense. Floodwater
      -- recedes on its own; "wala na" four hours later describes the weather,
      -- not a bad report. Only an answer given while the reading could still
      -- plausibly hold says anything about whether it did.
      and u.created_at <= r.reported_at + interval '60 minutes'
    -- Seeded demo rows are not somebody's track record.
    where r.source = 'user'
    group by r.id
  )
  select case
    -- Three checked reports at 70%. Below that this is noise dressed as a
    -- judgement: two lucky reports would badge somebody permanently.
    when count(*) >= 3 and count(*) filter (where held) * 10 >= count(*) * 7
      then 'reliable'
    else 'none'
  end
  from verdicts;
$$;

-- From PUBLIC, not from anon: EXECUTE is granted to PUBLIC on every new
-- function and anon inherits it, so revoking from anon is a no-op that reads
-- like a lock. Same correction as 0016.
revoke execute on function reporter_standing(uuid) from public;
grant  execute on function reporter_standing(uuid) to anon, authenticated, service_role;
