-- supabase/migrations/0030_revoke_from_anon.sql
--
-- The anon default-grant gap, reopened.
--
-- 0016 established the rule: `revoke ... from anon` does nothing on its own,
-- because anon inherits EXECUTE from PostgreSQL's own default grant to
-- PUBLIC - the revoke has to name `public` to touch that inherited grant at
-- all. 0022 (sos_detail) restates the full rule correctly: `revoke ... from
-- public, anon`, naming both, because Supabase's project setup ALSO grants
-- EXECUTE directly to anon (and to authenticated, and service_role) on every
-- newly created function, via its own default-privilege configuration,
-- separate from Postgres's PUBLIC grant. Revoking only `from public` removes
-- the inherited grant but leaves that direct one standing - a function can
-- look locked down, with no grant to PUBLIC, while anon can still call it
-- because anon never lost its OWN grant.
--
-- 0027_report_moderation.sql and 0028_hazards.sql both wrote only
-- `revoke ... from public` for the four functions below, so each still
-- carried the direct anon grant Supabase made when it was created. Checked,
-- not assumed - every one of the following returned true before this
-- migration ran:
--
--   has_function_privilege('anon', 'report_queue()', 'execute')
--   has_function_privilege('anon', 'report_detail(uuid)', 'execute')
--   has_function_privilege('anon', 'decide_report(uuid,text,report_decision_reason)', 'execute')
--   has_function_privilege('anon', 'report_priority(smallint,timestamptz)', 'execute')
--
-- NOTHING WAS EXPOSED. Every one of these is security definer and filters on
-- moderates(auth.uid()) - null for anon, so the result is always empty. This
-- is a defence-in-depth regression, the same posture 0016 found and fixed on
-- its own functions, not a leak - do not overstate it.

revoke execute on function report_queue()                                    from anon;
revoke execute on function report_detail(uuid)                               from anon;
revoke execute on function decide_report(uuid, text, report_decision_reason) from anon;
revoke execute on function report_priority(smallint, timestamptz)            from anon;

-- moderates(text) goes one step further than the rest: nobody, at any
-- privilege level, is meant to call it directly. 0020 said so in its own
-- comment ("Nobody calls this directly. The three functions below are
-- security definer and owned by the same role, so they reach it regardless")
-- but revoked it `from public` only - which, per the rule above, left
-- Supabase's direct grants to BOTH anon and authenticated standing.
-- `has_function_privilege('authenticated', 'moderates(text)', 'execute')`
-- was true before this migration too. Revoked from both here so the grant
-- finally matches the comment that has described it since 0020.
revoke execute on function moderates(text) from anon, authenticated;

-- public_hazard(hazard_type) is DELIBERATELY NOT touched here. reports_near
-- calls it and is security invoker (0028's own comment on public_hazard
-- explains why: an invoker-mode caller runs its inner calls as itself), so
-- anon genuinely needs its own execute grant on public_hazard or the public
-- map goes dark. That exact mistake already cost a fix round on this branch;
-- it is not repeated here.
