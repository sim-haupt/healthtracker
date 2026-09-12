begin;
create table public.health_episodes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
 profile_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 300),
 start_date date not null,
 end_date date,
 status text not null default 'active' check(status in ('active','resolved')),
 description text not null default '' check(length(description)<=5000),
 created_at timestamptz not null default now(),
 unique(owner_id,profile_id,id),
 foreign key(owner_id,profile_id) references public.profiles(owner_id,id) on delete cascade,
 check(end_date is null or end_date>=start_date)
);
alter table public.health_events add constraint events_owner_profile_id_unique unique(owner_id,profile_id,id);
create table public.health_episode_events (
 owner_id uuid not null default auth.uid(),
 profile_id uuid not null,
 episode_id uuid not null,
 event_id uuid not null,
 primary key(episode_id,event_id),
 foreign key(owner_id,profile_id,episode_id) references public.health_episodes(owner_id,profile_id,id) on delete cascade,
 foreign key(owner_id,profile_id,event_id) references public.health_events(owner_id,profile_id,id) on delete cascade
);
create index episodes_profile_date_idx on public.health_episodes(owner_id,profile_id,start_date desc,id);
create index episode_events_event_idx on public.health_episode_events(owner_id,event_id);
alter table public.health_episodes enable row level security;
alter table public.health_episode_events enable row level security;
revoke all on public.health_episodes,public.health_episode_events from public,anon,authenticated;
grant select,insert,update,delete on public.health_episodes,public.health_episode_events to authenticated;
create policy episode_owner on public.health_episodes for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.app_users where user_id=(select auth.uid()) and enabled))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.app_users where user_id=(select auth.uid()) and enabled));
create policy episode_event_owner on public.health_episode_events for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.app_users where user_id=(select auth.uid()) and enabled))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.app_users where user_id=(select auth.uid()) and enabled));
create function public.episode_document(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select (to_jsonb(e)-'owner_id') || jsonb_build_object('events',coalesce((
 select jsonb_agg(public.health_event_summary(h) order by h.event_date,h.id)
 from public.health_episode_events l join public.health_events h on h.id=l.event_id where l.episode_id=e.id),'[]'::jsonb))
 from public.health_episodes e where e.id=p_id;
$$;
create function public.save_health_episode(p_id uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.health_episodes; saved uuid;
begin
 v:=jsonb_populate_record(null::public.health_episodes,p_input);
 if jsonb_array_length(coalesce(p_input->'event_ids','[]'))>500 then raise exception 'Too many events' using errcode='23514'; end if;
 if p_id is null then
  insert into public.health_episodes(profile_id,title,start_date,end_date,status,description)
  values(v.profile_id,v.title,v.start_date,v.end_date,v.status,coalesce(v.description,'')) returning id into saved;
 else
  perform 1 from public.health_episodes where id=p_id for update;
  if not found then return null; end if;
  delete from public.health_episode_events where episode_id=p_id;
  update public.health_episodes set profile_id=v.profile_id,title=v.title,start_date=v.start_date,end_date=v.end_date,status=v.status,description=coalesce(v.description,'') where id=p_id returning id into saved;
 end if;
 insert into public.health_episode_events(owner_id,profile_id,episode_id,event_id)
 select auth.uid(),v.profile_id,saved,value::uuid from jsonb_array_elements_text(coalesce(p_input->'event_ids','[]')) on conflict do nothing;
 return public.episode_document(saved);
end;
$$;
revoke all on function public.episode_document(uuid),public.save_health_episode(uuid,jsonb) from public,anon;
grant execute on function public.episode_document(uuid),public.save_health_episode(uuid,jsonb) to authenticated;
create or replace function public.health_timeline(p_filters jsonb default '{}'::jsonb,p_entry_type text default 'all')
returns jsonb language sql stable security invoker set search_path='' as $$
 with matching as materialized (
   select e.* from public.filtered_health_events(p_filters - 'date_from' - 'date_to') e
 ), entries as (
   select 'event:'||e.id::text as id,'event'::text as entry_type,e.id as event_id,e.profile_id,e.event_type,e.title,e.title as event_title,e.event_date as occurred_at,
     left(coalesce(nullif(e.diagnosis,''),nullif(e.symptoms,''),nullif(e.description,''),nullif(e.treatment,''),nullif(e.prescription,''),nullif(e.notes,''),''),320) as summary,
     public.health_event_summary(e::public.health_events)->'tags' as tags,public.health_event_summary(e::public.health_events)->'category' as category,
     null::text as mime_type,null::bigint as file_size
   from matching e where p_entry_type in ('all','event')
   union all
   select 'attachment:'||a.id::text,'document',e.id,e.profile_id,e.event_type,a.file_name,e.title,a.created_at,
     'Attached to '||e.title,public.health_event_summary(e::public.health_events)->'tags',public.health_event_summary(e::public.health_events)->'category',a.mime_type,a.file_size
   from public.attachments a join matching e on e.id=a.health_event_id
   where p_entry_type in ('all','document') and exists(select 1 from storage.objects o where o.bucket_id='health-attachments' and o.name=a.file_path)
   union all
   select 'episode:'||ep.id::text,'episode',ep.id,ep.profile_id,'Health Episode',ep.title,ep.title,
     ep.start_date::timestamp at time zone 'UTC',
     ep.status||case when ep.end_date is not null then ' · Ends '||ep.end_date::text else '' end||case when ep.description<>'' then ' · '||left(ep.description,320) else '' end,
     '[]'::jsonb,null::jsonb,null::text,null::bigint
   from public.health_episodes ep
   where p_entry_type in ('all','episode')
     and (nullif(p_filters->>'profile_id','') is null or ep.profile_id=(p_filters->>'profile_id')::uuid)
     and (nullif(btrim(p_filters->>'q'),'') is null or strpos(lower(ep.title||' '||ep.description),lower(btrim(p_filters->>'q')))>0)
     and (
       (nullif(p_filters->>'event_type','') is null and nullif(p_filters->>'provider_id','') is null and nullif(p_filters->>'category_id','') is null and jsonb_array_length(coalesce(p_filters->'tag_ids','[]'))=0)
       or exists(select 1 from public.health_episode_events l join public.filtered_health_events(p_filters-'date_from'-'date_to'-'q') h on h.id=l.event_id where l.episode_id=ep.id)
     )
 ), dated as (
   select * from entries where
     (nullif(p_filters->>'date_from','') is null or occurred_at >= (p_filters->>'date_from')::timestamptz)
     and (nullif(p_filters->>'date_to','') is null or occurred_at < (p_filters->>'date_to')::timestamptz)
 ), paged as (
   select * from dated order by occurred_at desc,id desc
   limit least(greatest(coalesce((p_filters->>'page_size')::integer,30),1),100)
   offset (greatest(coalesce((p_filters->>'page')::integer,1),1)-1)*least(greatest(coalesce((p_filters->>'page_size')::integer,30),1),100)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.occurred_at desc,p.id desc) from paged p),'[]'::jsonb),'total',(select count(*) from dated));
$$;

commit;
