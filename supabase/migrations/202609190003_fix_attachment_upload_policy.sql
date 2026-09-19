begin;

-- The Storage API does not guarantee that generated object metadata is present
-- while evaluating the initial INSERT. File size and MIME type are already
-- enforced by the private bucket and by the reserved attachment row, so the
-- insert policy only needs to bind the object path to that authenticated row.
drop policy if exists health_attachment_insert on storage.objects;
create policy health_attachment_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'health-attachments'
  and exists (
    select 1
    from public.attachments a
    where a.owner_id = (select auth.uid())
      and a.file_path = storage.objects.name
  )
);

commit;
