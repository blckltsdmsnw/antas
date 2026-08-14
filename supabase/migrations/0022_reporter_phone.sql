-- A number a moderator can actually ring.
--
-- 0002 said `profiles` "will hold verified phone numbers from Phase 2 onward"
-- and locked the table at the grant layer on that basis. This is that column.
-- That lock is why it can exist at all: `profiles` is already unreadable to
-- anon and scoped to `id = auth.uid()` for everyone else, so adding a phone
-- number widens nothing by itself.
--
-- NOT VERIFIED, and the column does not pretend otherwise. Real verification
-- means sending an SMS code, which needs a paid provider this project does not
-- have. A moderator sees the number somebody typed - useful, and labelled in
-- the console as unconfirmed rather than presented as checked.

alter table profiles add column phone text;

-- E.164 only, enforced here as well as in the application. The application
-- normalises 0917 / +63917 / 63917 into one form; this makes sure nothing else
-- can write a shape that will not dial. A number stored wrong is discovered by
-- somebody failing to reach a person in a flood.
alter table profiles add constraint profiles_phone_e164
  check (phone is null or phone ~ '^\+639\d{9}$');

/*
 * Exposed through sos_detail and nowhere else.
 *
 * That is the whole privacy design in one sentence. `profiles` stays scoped to
 * `id = auth.uid()`, so no user can read another's number; the only path to it
 * is this definer function, which already refuses anyone who may not see the
 * signal. A phone number reaches whoever may act on that SOS and nobody else -
 * it never touches the public map, the depth reports, or report_updates.
 *
 * The return type gains a column, so this has to be dropped and recreated
 * rather than replaced. Dropping a function drops its grants with it, which is
 * why they are restated at the end - omitting them would leave the console
 * calling a function nobody is permitted to execute.
 */
drop function if exists sos_detail(uuid);

create function sos_detail(signal_id uuid)
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
  -- unauthorised probe leaves no misleading trail. It matters more now than it
  -- did: this function hands out a phone number, so "who looked at this" is
  -- also the record of who could have called.
  insert into signal_events (sos_id, actor_id, event_type, payload)
  select s.id, auth.uid(), 'viewed', '{}'::jsonb
    from sos_signals s
   where s.id = sos_detail.signal_id
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
