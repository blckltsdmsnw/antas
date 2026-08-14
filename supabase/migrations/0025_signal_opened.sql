-- Move a signal to `under_review` when a moderator actually opens it.
--
-- `sos_status` has had 'under_review' since 0005, and `canTransition` in
-- src/lib/sos/status.ts models pending -> under_review. NOTHING HAS EVER
-- PERFORMED THAT TRANSITION. Every signal sat at 'pending' until somebody
-- confirmed or dismissed it, so the state existed only in the type.
--
-- It is worth performing because it is the one thing the sender can honestly be
-- told. Today they see "Naipadala na" and then nothing, ever - the same silence
-- that "kumusta na" was built to end on depth reports. A moderator opening the
-- signal is a real event, already audited in `signal_events`, and the sender
-- cannot read that table (correctly - who looked is not their business).
-- Promoting the status is how that fact reaches them without exposing the
-- audit trail.
--
-- WHAT IT MUST NOT BECOME: a promise. "Binuksan na ito ng barangay" says a
-- person looked. It does not say anybody is coming, and the screen showing it
-- goes on saying that nobody is. Any wording that drifts from "somebody read
-- this" toward "help is on the way" undoes the boundary the whole product is
-- built around.

create or replace function sos_detail(signal_id uuid)
returns table (
  id                      uuid,
  barangay                text,
  depth                   depth_level,
  status                  sos_status,
  trust_score             integer,
  confidence              text,
  reasons                 jsonb,
  note                    text,
  photo_path              text,
  gps_accuracy_m          double precision,
  created_at              timestamptz,
  lat                     double precision,
  lon                     double precision,
  rainfall_24h_mm         double precision,
  elevation_m             double precision,
  surrounding_elevation_m double precision,
  corroborating_reports   integer,
  provider_ok             boolean,
  reporter_phone          text
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
begin
  -- Record the view before returning anything. If the caller may not see this
  -- signal the insert matches nothing and the select returns nothing, so an
  -- unauthorised probe leaves no misleading trail. It matters more than it did:
  -- this function hands out a phone number, so "who looked at this" is also the
  -- record of who could have called.
  insert into signal_events (sos_id, actor_id, event_type, payload)
  select s.id, auth.uid(), 'viewed', '{}'::jsonb
    from sos_signals s
   where s.id = sos_detail.signal_id
     and moderates(s.barangay);

  -- Only from 'pending', so opening a signal a second time cannot walk back a
  -- decision somebody already made. `moderates` is re-checked rather than
  -- assumed from the insert above: an unauthorised probe must not be able to
  -- change the state of a signal it is not allowed to see.
  update sos_signals s
     set status = 'under_review'
   where s.id = sos_detail.signal_id
     and s.status = 'pending'
     and moderates(s.barangay);

  return query
  select s.id, s.barangay, s.depth, s.status, s.trust_score, s.confidence,
         s.reasons, s.note, s.photo_path, s.gps_accuracy_m, s.created_at,
         st_y(s.location::geometry), st_x(s.location::geometry),
         e.rainfall_24h_mm, e.elevation_m, e.surrounding_elevation_m,
         e.corroborating_reports, e.provider_ok,
         p.phone
    from sos_signals s
    left join env_snapshots e on e.sos_id = s.id
    left join profiles p      on p.id     = s.reporter_id
   where s.id = sos_detail.signal_id
     and moderates(s.barangay);
end;
$fn$;

revoke execute on function sos_detail(uuid) from public, anon;
grant  execute on function sos_detail(uuid) to authenticated;
