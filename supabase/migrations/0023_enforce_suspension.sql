-- Suspension that actually suspends something.
--
-- `decide_sos` has written `profiles.suspended_at` since 0010, after a reporter
-- accumulates three false reports. NOTHING HAS EVER READ IT. A moderator
-- dismissing three fabricated signals believed they had stopped somebody; they
-- had set a timestamp and changed nothing at all.
--
-- Worse, 0002 granted UPDATE on the whole of `profiles` to `authenticated`, and
-- the policy lets a user update their own row - so the suspended person could
-- clear their own suspension with a single request. Verified against a real
-- database before this was written, not inferred from reading the grant.
--
-- Two fixes, and one deliberate non-fix.

/*
 * 1. The grant is column-scoped now.
 *
 * The same lesson 0018 learned for depth_reports.status: "may edit their own
 * row" is not "may edit every column of their own row". A user owns their
 * display name, their barangay and their phone number. They do not own the
 * record of having been suspended - it was simply left reachable.
 */
revoke update on profiles from authenticated;
grant update (display_name, barangay, phone) on profiles to authenticated;

/*
 * 2. Suspension is read where it means something.
 *
 * Granted to authenticated rather than kept internal: a refusal the person
 * cannot explain is the silent failure this codebase keeps having to fix, and
 * the report screen needs to be able to say why instead of appearing broken. It
 * answers only for auth.uid(), so it tells nobody anything about anybody else.
 */
create or replace function is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from profiles p
     where p.id = auth.uid()
       and p.suspended_at is not null
  );
$fn$;

revoke execute on function is_suspended() from public;
grant  execute on function is_suspended() to authenticated, service_role;

-- Depth reports are where suspension bites: filing one is a contribution to a
-- shared map, and somebody who has fabricated three emergencies has forfeited
-- that. Nothing about it is urgent, so refusing costs them only the wait.
alter policy "users insert their own depth reports"
  on depth_reports
  with check (reporter_id = auth.uid() and not is_suspended());

/*
 * 3. NOT the SOS path, and that is deliberate.
 *
 * The governing rule of this system is that it never refuses a call for help.
 * Somebody who fabricated three floods last year can still be in one today, and
 * a suspension check on that insert would be the product deciding - on the
 * basis of its own moderation history - that a person's emergency does not
 * count.
 *
 * The honest handling is the one already built for every other doubt about a
 * signal: score it. `reputation.false_report_count` feeds the trust score, so a
 * suspended sender's SOS is ranked lower for a moderator and still arrives.
 * Ranking is what you do when you know less. Refusing is what you do when you
 * have decided, and this system is not entitled to decide that.
 */
