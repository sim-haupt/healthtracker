begin;
create table public.attachments (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
 health_event_id uuid not null,
 file_name text not null check (length(btrim(file_name)) between 1 and 200 and file_name !~ '[\/\\[:cntrl:]]'),
 file_path text not null unique,
 mime_type text not null,
 file_size bigint not null check (file_size between 1 and 10485760),
 created_at timestamptz not null default now(),
 foreign key (owner_id, health_event_id) references public.health_events(owner_id,id) on delete restrict,
 check (file_path = owner_id::text || '/' || health_event_id::text || '/' || id::text),
 check (case lower(substring(file_name from '[^.]+$'))
 when 'pdf' then mime_type = 'application/pdf'
 when 'jpg' then mime_type = 'image/jpeg'
 when 'jpeg' then mime_type = 'image/jpeg'
 when 'png' then mime_type = 'image/png'
 when 'webp' then mime_type = 'image/webp'
 when 'gif' then mime_type = 'image/gif'
 when 'doc' then mime_type = 'application/msword'
 when 'docx' then mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 when 'xls' then mime_type = 'application/vnd.ms-excel'
 when 'xlsx' then mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 when 'ppt' then mime_type = 'application/vnd.ms-powerpoint'
 when 'pptx' then mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
 when 'txt' then mime_type = 'text/plain'
 when 'csv' then mime_type = 'text/csv'
 when 'rtf' then mime_type = 'application/rtf'
 when 'odt' then mime_type = 'application/vnd.oasis.opendocument.text'
 else false end)
);
create index attachments_event_idx on public.attachments(owner_id,health_event_id,created_at);
alter table public.attachments enable row level security;
revoke all on public.attachments from public, anon, authenticated;
grant select, insert, delete on public.attachments to authenticated;
create policy attachment_owner on public.attachments for all to authenticated
 using (owner_id = (select auth.uid()) and exists (select 1 from public.app_users where user_id = (select auth.uid()) and enabled))
 with check (owner_id = (select auth.uid()) and exists (select 1 from public.app_users where user_id = (select auth.uid()) and enabled));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('health-attachments','health-attachments',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','image/gif','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv','application/rtf','application/vnd.oasis.opendocument.text'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

-- No UPDATE policy: objects are immutable, and uploads must use upsert:false.
create policy health_attachment_read on storage.objects for select to authenticated
using (bucket_id='health-attachments' and exists (select 1 from public.attachments a where a.file_path=name));
create policy health_attachment_insert on storage.objects for insert to authenticated
with check (bucket_id='health-attachments' and exists (
 select 1 from public.attachments a where a.file_path=name
 and (metadata->>'size')::bigint = a.file_size and metadata->>'mimetype'=a.mime_type
));
create policy health_attachment_delete on storage.objects for delete to authenticated
using (bucket_id='health-attachments' and exists (select 1 from public.attachments a where a.file_path=name));
commit;
