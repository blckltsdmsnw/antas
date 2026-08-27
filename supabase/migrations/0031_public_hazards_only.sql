-- supabase/migrations/0031_public_hazards_only.sql
--
-- The privacy promise, enforced where it actually has to be.
--
-- 0028 built public_hazard(hazard_type) and used it inside reports_near's
-- WHERE clause - correct, but incomplete. reports_near is one way to read
-- depth_reports; a direct PostgREST table read is another, and 0002 grants
-- anon SELECT on the table with only `status = 'active'` guarding it. The
-- RPC's filter was a courtesy sitting beside the real door, not a lock on it.
-- Anyone holding the anon key - which ships in every client bundle - could
-- issue `GET /rest/v1/depth_reports?select=*` and receive medical and
-- accident reports with exact coordinates, photo_path and timestamps. This
-- branch's binding constraint is "Security is a Postgres predicate, never
-- application code," and this table's own select policy was the one place
-- that constraint was not honoured.
--
-- Fixed at the predicate the RPC was always supposed to share: the public
-- read policy itself now carries public_hazard(), so a direct table read is
-- bound by the identical rule as the RPC, rather than a second copy of it.

drop policy "active depth reports are publicly readable" on depth_reports;

-- Depth reports are public data: anyone may read active ones - but only the
-- ones describing a place. Flood, fire and earthquake are the water, the
-- smoke, the shaking ground; pinning one to a map warns a neighbourhood.
-- Accident and medical describe a person, not a place, and putting one on a
-- public map exposes somebody at their worst moment to whoever opens the
-- app. Those two still reach the moderator console in full, through the
-- policy below.
create policy "active depth reports are publicly readable"
  on depth_reports for select
  using (status = 'active' and public_hazard(hazard_type));

-- The ripple: the console subscribes to realtime on this table
-- (src/app/console/page.tsx), and realtime is delivered under RLS. Narrowing
-- the policy above to public_hazard() would silently stop moderators
-- receiving live events for exactly the medical and accident reports they
-- most need to see the moment they arrive. A moderator is not the public;
-- they see every status in their own barangay (or every barangay, if they
-- are an admin - moderates() already encodes that), independent of whether
-- the hazard would ever reach the public map.
create policy "moderators read all depth reports"
  on depth_reports for select
  to authenticated
  using (moderates(barangay));

-- moderates(text) has been reachable only through security definer functions
-- since 0020, and 0030 revoked its direct EXECUTE from anon and authenticated
-- to match - "nobody calls this directly." The policy above is now a direct
-- caller: an RLS predicate runs as the querying role, not as the function
-- owner, so evaluating `moderates(barangay)` for an authenticated moderator's
-- own query requires authenticated to hold EXECUTE on it. Granted back to
-- authenticated only - anon has no business with this function, and the
-- public policy above never calls it.
grant execute on function moderates(text) to authenticated;

-- "users read their own reports" (0018) already lets /ako show a reporter
-- their own medical and accident reports regardless of this policy - it is
-- unconditioned on hazard, scoped only to reporter_id = auth.uid(), and nothing
-- here changes it.
