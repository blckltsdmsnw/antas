-- supabase/migrations/0033_board.sql
--
-- The master admin's board, and the graph above it.
--
-- Two definer functions, both master-admin-only, both raising rather than
-- returning empty so the page can say "not for you" instead of drawing four
-- empty columns. The tables stay separate underneath: an SOS carries
-- anonymity, a trust score, an environmental snapshot and the one-active-
-- signal rule, none of which belong on an observation. Only the SHAPE is
-- unified, here, for one screen.

-- 1. board_rows ---------------------------------------------------------------
--
-- The four columns, derived:
--
--   SOS   pending/under_review -> needs_checking; confirmed -> needs_attention;
--         dismissed -> not_true (last 48h); resolved -> not on the board.
--   Report triage_state, except that a report the reporter hid themselves
--         (status hidden, triage still needs_checking) is not on the board -
--         that was their choice about their own pin, not a judgement.
--   Either kind with an OPEN ASSIGNMENT -> assigned, whatever the state
--         above, unless it is not_true (dismissing closes assignments, so
--         that combination cannot persist).
--
--   The 48h window on not_true is on the incident OR the decision, whichever
--   is recent - a report filed three days ago and hidden a minute ago must
--   still land in "Hindi totoo" instead of vanishing, so the window also
--   checks report_events/signal_events for a 'decision' row in the last 48h,
--   not only reported_at/created_at.
--
-- Within a column: SOS above reports (a person asking for help outranks an
-- observation), then severity worst first, then newest first. SOS rows have
-- no severity, and `nulls first` is what puts them on top.
--
-- 200 rows per column. reports_near and the queues carry no LIMIT and
-- PostgREST truncates at 1000 silently; this one says its cap out loud.
create function board_rows()
returns table (
  kind           text,
  id             uuid,
  board_column   text,
  hazard_type    hazard_type,
  severity       smallint,
  depth          depth_level,
  barangay       text,
  status         text,
  trust_score    integer,
  confidence     text,
  created_at     timestamptz,
  assignment_id  uuid,
  responder_name text,
  responder_unit responder_unit
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not is_master_admin() then
    raise exception 'the board is for the master admin only' using errcode = '42501';
  end if;

  return query
  with open_assignment as (
    -- The newest open assignment per record, if several people are on it.
    -- The card shows one name; the others are still in the table.
    select distinct on (coalesce(a.incident_id, a.sos_id))
           coalesce(a.incident_id, a.sos_id) as target_id,
           a.id                              as oa_id,
           p.display_name                    as oa_name,
           p.responder_unit                  as oa_unit
      from assignments a
      join profiles p on p.id = a.responder_id
     where a.closed_at is null
     order by coalesce(a.incident_id, a.sos_id), a.assigned_at desc
  ),
  placed as (
    select 'sos'::text as k,
           s.id        as rid,
           case
             when oa.oa_id is not null and s.status in ('pending', 'under_review', 'confirmed')
                                                     then 'assigned'
             when s.status in ('pending', 'under_review') then 'needs_checking'
             when s.status = 'confirmed'                 then 'needs_attention'
             when s.status = 'dismissed'                 then 'not_true'
           end                          as col,
           s.hazard_type                as hz,
           null::smallint               as sev,
           s.depth                      as dp,
           s.barangay                   as bgy,
           s.status::text               as st,
           s.trust_score                as ts,
           s.confidence                 as cf,
           s.created_at                 as happened_at,
           oa.oa_id, oa.oa_name, oa.oa_unit
      from sos_signals s
      left join open_assignment oa on oa.target_id = s.id
     where s.status <> 'resolved'
       and (s.status <> 'dismissed'
            or s.created_at > now() - interval '48 hours'
            or exists (
                 select 1 from signal_events e
                  where e.sos_id = s.id
                    and e.event_type = 'decision'
                    and e.created_at > now() - interval '48 hours'
               ))
    union all
    select 'report',
           r.id,
           case
             when oa.oa_id is not null and r.status <> 'hidden' then 'assigned'
             when r.triage_state = 'not_true'                    then 'not_true'
             when r.status = 'hidden'                            then null
             when r.triage_state = 'needs_attention'             then 'needs_attention'
             else                                                     'needs_checking'
           end,
           r.hazard_type,
           r.severity,
           r.depth,
           r.barangay,
           r.status,
           null::integer,
           null::text,
           r.reported_at,
           oa.oa_id, oa.oa_name, oa.oa_unit
      from depth_reports r
      left join open_assignment oa on oa.target_id = r.id
     where (r.status <> 'hidden' or r.triage_state = 'not_true')
       and (r.triage_state <> 'not_true'
            or r.reported_at > now() - interval '48 hours'
            or exists (
                 select 1 from report_events e
                  where e.report_id = r.id
                    and e.event_type = 'decision'
                    and e.created_at > now() - interval '48 hours'
               ))
  ),
  ranked as (
    select p.*,
           row_number() over (
             partition by p.col
             order by (p.k = 'sos') desc, p.sev desc nulls first, p.happened_at desc
           ) as rn
      from placed p
     where p.col is not null
  )
  select rk.k, rk.rid, rk.col, rk.hz, rk.sev, rk.dp, rk.bgy, rk.st, rk.ts, rk.cf,
         rk.happened_at, rk.oa_id, rk.oa_name, rk.oa_unit
    from ranked rk
   where rk.rn <= 200
   order by rk.col, rk.rn;
end;
$fn$;

revoke execute on function board_rows() from public, anon;
grant  execute on function board_rows() to authenticated;

-- 2. board_graph --------------------------------------------------------------
--
-- Pre-bucketed counts, so no raw incident row travels to the browser to be
-- counted there. Reports and SOS together, because the question the graph
-- answers is about pressure on the city, not about source. Every status is
-- counted - a dismissed signal was still a signal somebody sent.
--
-- Hours are truncated in the server's zone (UTC on Supabase); the browser
-- labels them in Manila time. Barangays: the ten worst, ranked.
create function board_graph()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v jsonb;
begin
  if not is_master_admin() then
    raise exception 'the board is for the master admin only' using errcode = '42501';
  end if;

  with recent as (
    select r.reported_at as happened_at, r.hazard_type as hz, r.barangay as bgy
      from depth_reports r
     where r.reported_at > now() - interval '48 hours'
    union all
    select s.created_at, s.hazard_type, s.barangay
      from sos_signals s
     where s.created_at > now() - interval '48 hours'
  ),
  hours as (
    select date_trunc('hour', happened_at) as hour, hz, count(*) as n
      from recent
     group by 1, 2
  ),
  bgys as (
    select bgy, count(*) as n
      from recent
     where bgy is not null
     group by 1
     order by 2 desc, 1
     limit 10
  )
  select jsonb_build_object(
    'hours', coalesce(
      (select jsonb_agg(jsonb_build_object('hour', h.hour, 'hazard', h.hz, 'count', h.n)
                        order by h.hour)
         from hours h),
      '[]'::jsonb),
    'barangays', coalesce(
      (select jsonb_agg(jsonb_build_object('barangay', b.bgy, 'count', b.n)
                        order by b.n desc, b.bgy)
         from bgys b),
      '[]'::jsonb)
  ) into v;

  return v;
end;
$fn$;

revoke execute on function board_graph() from public, anon;
grant  execute on function board_graph() to authenticated;
