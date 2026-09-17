begin;

-- Storage enforces the bucket's 2 MB limit and allowed image MIME types before
-- persisting an object. The initial storage.objects INSERT is not guaranteed to
-- contain generated file metadata, so keep RLS focused on ownership and path.
drop policy if exists avatar_insert on storage.objects;
create policy avatar_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and exists (
    select 1
    from public.profiles p
    where p.owner_id = (select auth.uid())
      and storage.objects.name ~ (
        '^' || p.owner_id::text || '/' || p.id::text || '/[0-9a-f-]{36}$'
      )
  )
);

commit;
