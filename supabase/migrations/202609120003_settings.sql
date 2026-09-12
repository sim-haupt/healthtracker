begin;
-- Removing a category clears that label, never the health event or its owner.
alter table public.health_events drop constraint health_events_category_fk;
alter table public.health_events add constraint health_events_category_fk
 foreign key(owner_id,category_id) references public.categories(owner_id,id) on delete set null (category_id);

alter table public.profiles add constraint profile_avatar_path check (
 avatar is null or avatar ~ ('^' || owner_id::text || '/' || id::text || '/[0-9a-f-]{36}$')
) not valid;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy avatar_read on storage.objects for select to authenticated using (
 bucket_id='profile-avatars' and exists(select 1 from public.profiles p where storage.objects.name ~ ('^' || p.owner_id::text || '/' || p.id::text || '/[0-9a-f-]{36}$'))
);
create policy avatar_insert on storage.objects for insert to authenticated with check (
 bucket_id='profile-avatars' and (metadata->>'size')::bigint between 1 and 2097152 and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
 and exists(select 1 from public.profiles p where storage.objects.name ~ ('^' || p.owner_id::text || '/' || p.id::text || '/[0-9a-f-]{36}$'))
);
create policy avatar_delete on storage.objects for delete to authenticated using (
 bucket_id='profile-avatars' and exists(select 1 from public.profiles p where storage.objects.name ~ ('^' || p.owner_id::text || '/' || p.id::text || '/[0-9a-f-]{36}$'))
);
commit;
