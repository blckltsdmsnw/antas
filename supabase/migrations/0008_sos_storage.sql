-- Private bucket. A distressed person's photograph must never be served from
-- a public URL; the console fetches it through a signed URL in Phase 2B.
insert into storage.buckets (id, name, public)
values ('sos-photos', 'sos-photos', false)
on conflict (id) do nothing;

-- A signed-in user may upload only into their own folder, keyed by user id.
create policy "users upload their own sos photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sos-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users read their own sos photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sos-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
