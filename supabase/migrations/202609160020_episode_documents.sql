begin;

alter table public.attachments
  add constraint attachments_owner_event_id_unique unique(owner_id, health_event_id, id);

create table public.health_episode_documents (
  owner_id uuid not null default auth.uid(),
  profile_id uuid not null,
  episode_id uuid not null,
  health_event_id uuid not null,
  document_id uuid not null,
  primary key(episode_id, document_id),
  foreign key(owner_id, profile_id, episode_id)
    references public.health_episodes(owner_id, profile_id, id) on delete cascade,
  foreign key(owner_id, profile_id, health_event_id)
    references public.health_events(owner_id, profile_id, id) on delete cascade,
  foreign key(owner_id, health_event_id, document_id)
    references public.attachments(owner_id, health_event_id, id) on delete cascade
);

create index episode_documents_document_idx
  on public.health_episode_documents(owner_id, document_id);

alter table public.health_episode_documents enable row level security;

revoke all on public.health_episode_documents from public, anon, authenticated;
grant select, insert, update, delete on public.health_episode_documents to authenticated;

create policy episode_document_owner on public.health_episode_documents for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.app_users
      where user_id = (select auth.uid()) and enabled
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.app_users
      where user_id = (select auth.uid()) and enabled
    )
  );

create or replace function public.episode_document(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select (to_jsonb(e)-'owner_id') || jsonb_build_object(
   'events', coalesce((
     select jsonb_agg(public.health_event_summary(h) order by h.event_date,h.id)
     from public.health_episode_events l
     join public.health_events h on h.id=l.event_id
     where l.episode_id=e.id
   ), '[]'::jsonb),
   'documents', coalesce((
     select jsonb_agg(to_jsonb(d) order by d.created_at desc, d.id desc)
     from (
       select
         a.id,
         a.health_event_id,
         a.file_name,
         a.file_path,
         a.mime_type,
         a.file_size,
         a.document_category,
         a.description,
         a.created_at,
         h.profile_id,
         h.title as event_title,
         h.event_type,
         h.event_date,
         public.health_event_summary(h)->'category' as event_category,
         public.health_event_summary(h)->'tags' as tags
       from public.health_episode_documents l
       join public.attachments a on a.id=l.document_id
       join public.health_events h on h.id=a.health_event_id
       where l.episode_id=e.id
         and exists (
           select 1 from storage.objects o
           where o.bucket_id='health-attachments' and o.name=a.file_path
         )
     ) d
   ), '[]'::jsonb)
 )
 from public.health_episodes e where e.id=p_id;
$$;

create or replace function public.save_health_episode(p_id uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.health_episodes; saved uuid;
begin
 v:=jsonb_populate_record(null::public.health_episodes,p_input);
 if jsonb_array_length(coalesce(p_input->'event_ids','[]'))>500 then raise exception 'Too many events' using errcode='23514'; end if;
 if jsonb_array_length(coalesce(p_input->'document_ids','[]'))>500 then raise exception 'Too many documents' using errcode='23514'; end if;
 if p_id is null then
  insert into public.health_episodes(profile_id,title,start_date,end_date,status,description)
  values(v.profile_id,v.title,v.start_date,v.end_date,v.status,coalesce(v.description,'')) returning id into saved;
 else
  perform 1 from public.health_episodes where id=p_id for update;
  if not found then return null; end if;
  delete from public.health_episode_events where episode_id=p_id;
  delete from public.health_episode_documents where episode_id=p_id;
  update public.health_episodes set profile_id=v.profile_id,title=v.title,start_date=v.start_date,end_date=v.end_date,status=v.status,description=coalesce(v.description,'') where id=p_id returning id into saved;
 end if;
 insert into public.health_episode_events(owner_id,profile_id,episode_id,event_id)
 select auth.uid(),v.profile_id,saved,value::uuid
 from jsonb_array_elements_text(coalesce(p_input->'event_ids','[]'))
 on conflict do nothing;
 insert into public.health_episode_documents(owner_id,profile_id,episode_id,health_event_id,document_id)
 select auth.uid(),v.profile_id,saved,a.health_event_id,a.id
 from jsonb_array_elements_text(coalesce(p_input->'document_ids','[]')) ids(value)
 join public.attachments a on a.id=ids.value::uuid
 join public.health_events h on h.id=a.health_event_id
 where h.profile_id=v.profile_id
 on conflict do nothing;
 return public.episode_document(saved);
end;
$$;

revoke all on function public.episode_document(uuid),public.save_health_episode(uuid,jsonb) from public,anon;
grant execute on function public.episode_document(uuid),public.save_health_episode(uuid,jsonb) to authenticated;

commit;
