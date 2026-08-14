-- Let a moderator actually open the photograph.
--
-- 0008 created the private `sos-photos` bucket with two policies, both scoped
-- to the uploader's own folder, and its comment said "the console fetches it
-- through a signed URL in Phase 2B". The console was built and does exactly
-- that - but the policy letting anybody other than the sender read the object
-- was never written. NO MODERATOR HAS EVER SEEN AN SOS PHOTO.
--
-- It failed silently, in the worst possible shape: storage reports a policy
-- denial as "Object not found", and the console renders the image only when a
-- URL comes back, so the card simply appeared without one. Indistinguishable
-- from a signal that had no photo - except an SOS cannot have no photo, because
-- the live capture is mandatory.
--
-- This matters more than a missing thumbnail. The photo is the one part of a
-- signal that cannot be faked by dragging a slider; `hasLivePhoto` feeds the
-- trust score, and the console was asking a moderator to judge a stranger's
-- emergency while withholding the only piece of evidence in it.

/*
 * Whether the caller may see the photo at this path.
 *
 * A separate function because the policy cannot ask directly. Written inline,
 * the `exists (select 1 from sos_signals ...)` would run as the moderator, and
 * row-level security on sos_signals confines them to their own signals - so the
 * subquery would find nothing and the policy would deny every photo, including
 * the ones they are entitled to. Definer rights lift that, and the answer is
 * still narrowed by moderates() to the barangays they actually cover.
 *
 * Granted to authenticated, unlike the other definer helpers, because a storage
 * policy is evaluated as the calling user rather than from inside another
 * definer function. It discloses nothing: it answers only "may I open this",
 * which the caller could establish by trying.
 */
create or replace function can_view_sos_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from sos_signals s
     where s.photo_path = p_path
       and moderates(s.barangay)
  );
$fn$;

revoke execute on function can_view_sos_photo(text) from public;
grant  execute on function can_view_sos_photo(text) to authenticated, service_role;

-- Additive: the sender keeps their own read policy from 0008, and permissive
-- policies are OR-ed. Nobody loses access to their own photograph.
create policy "moderators read sos photos for signals they may see"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sos-photos'
    and can_view_sos_photo(name)
  );
