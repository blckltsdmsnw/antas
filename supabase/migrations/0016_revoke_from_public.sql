-- `revoke ... from anon` does nothing. It has to say `from public`.
--
-- 0007, 0010 and 0015 each tried to lock a user-scoped function away from
-- anonymous callers with `revoke execute ... from anon`. None of them worked.
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and
-- `anon` is a member of PUBLIC - so revoking a privilege that was never granted
-- directly leaves the inherited one untouched. Checked, not assumed:
--
--   corroborating_reports | public=true anon=true
--   decide_sos            | public=true anon=true
--   moderator_queue       | public=true anon=true
--   my_reports            | public=true anon=true
--   sos_detail            | public=true anon=true
--
-- 0004 is the one that got it right, and the whole difference is the word
-- `public`.
--
-- NOTHING WAS EXPOSED BY THIS. Every one of these functions defends itself:
-- `decide_sos` raises 'not a moderator for barangay %' unless auth.uid()
-- matches a moderators row, and the queue and detail readers are scoped by
-- auth.uid() too, which is null for an anonymous caller. The grant layer was
-- meant to be the second barrier, and the second barrier was missing.
--
-- Which is exactly the posture the README claims - "denied at both layers
-- rather than relying on the absence of a policy alone". The claim was true of
-- the intent and false of the database. This makes it true of the database.

-- Moderator surface. Only a signed-in caller can be a moderator, so
-- `authenticated` is the widest role that ever needs these.
revoke execute on function moderator_queue() from public, anon;
grant  execute on function moderator_queue() to authenticated, service_role;

revoke execute on function sos_detail(uuid) from public, anon;
grant  execute on function sos_detail(uuid) to authenticated, service_role;

revoke execute on function decide_sos(uuid, text, dismiss_reason) from public, anon;
grant  execute on function decide_sos(uuid, text, dismiss_reason) to authenticated, service_role;

-- Scoring input. 0007 revoked this from anon for the same reason, with the same
-- ineffective spelling.
revoke execute on function corroborating_reports(double precision, double precision, double precision, integer)
  from public, anon;
grant  execute on function corroborating_reports(double precision, double precision, double precision, integer)
  to authenticated, service_role;

-- Your own reports. An anonymous caller has no uid and would get an empty set
-- anyway; this makes the refusal explicit rather than incidental.
revoke execute on function my_reports() from public, anon;
grant  execute on function my_reports() to authenticated, service_role;

-- Deliberately NOT locked down: `search_places` and `reports_near`. Place names
-- and public flood reports are readable by a visitor who has never signed in,
-- and that is the point of the product.
