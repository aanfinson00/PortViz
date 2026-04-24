-- Documents bucket for lease PDFs, site plans, floor plans, photos, etc.
-- Files are laid out as: <org_id>/<entity_type>/<entity_id>/<filename>.
-- Access is controlled by matching the first path segment against the
-- caller's active org via public.current_org_id().

insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do nothing;

-- Read: caller's org owns the first path segment.
create policy "documents_read"
  on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- Write: same check, and only authenticated users.
create policy "documents_write"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "documents_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );
