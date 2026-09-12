begin;
create table public.providers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100),
 specialty text check(length(specialty)<=200),
 phone text check(length(phone)<=100),
 email text check(length(email)<=254),
 address text check(length(address)<=1000),
 website text check(length(website)<=2000 and website ~* '^https?://'),
 notes text check(length(notes)<=5000),
 created_at timestamptz not null default now(),
 unique(owner_id,id)
);
create index providers_owner_name_idx on public.providers(owner_id,name);
alter table public.providers enable row level security;
revoke all on public.providers from public,anon,authenticated;
grant select,insert,update,delete on public.providers to authenticated;
create policy provider_owner on public.providers for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.app_users where user_id=(select auth.uid()) and enabled))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.app_users where user_id=(select auth.uid()) and enabled));
alter table public.health_events add column provider_id uuid;
alter table public.health_events add constraint health_events_provider_fk foreign key(owner_id,provider_id) references public.providers(owner_id,id) on delete set null(provider_id);
create index events_provider_date_idx on public.health_events(owner_id,provider_id,event_date desc,id);
create or replace function public.health_event_document(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select (to_jsonb(e) - 'owner_id') || jsonb_build_object(
    'provider', (select jsonb_build_object('id',p.id,'name',p.name,'specialty',p.specialty) from public.providers p where p.id=e.provider_id),
    'category', (select jsonb_build_object('id',c.id,'name',c.name) from public.categories c where c.id=e.category_id),
    'tag_ids', coalesce((select jsonb_agg(t.tag_id order by t.tag_id) from public.health_event_tags t where t.event_id=e.id), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name,t.id)
      from public.health_event_tags et join public.tags t on t.id=et.tag_id where et.event_id=e.id), '[]'::jsonb)
  ) from public.health_events e where e.id=p_id;
$$;


create or replace function public.save_health_event(p_id uuid, p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v public.health_events; saved_id uuid; tag_count integer;
begin
  v := jsonb_populate_record(null::public.health_events, p_input);
  if p_id is null then
    insert into public.health_events(owner_id,profile_id,event_type,title,description,event_date,end_date,symptoms,diagnosis,treatment,prescription,doctor,location,notes,category_id,provider_id)
    values (auth.uid(),v.profile_id,v.event_type,v.title,coalesce(v.description,''),v.event_date,v.end_date,v.symptoms,v.diagnosis,v.treatment,v.prescription,v.doctor,v.location,v.notes,v.category_id,v.provider_id)
    returning id into saved_id;
  else
    -- The update holds a row lock while tag associations are replaced.
    update public.health_events set profile_id=v.profile_id,event_type=v.event_type,title=v.title,description=coalesce(v.description,''),
      event_date=v.event_date,end_date=v.end_date,symptoms=v.symptoms,diagnosis=v.diagnosis,treatment=v.treatment,
      prescription=v.prescription,doctor=v.doctor,location=v.location,notes=v.notes,category_id=v.category_id,provider_id=v.provider_id
    where id=p_id returning id into saved_id;
    if saved_id is null then return null; end if;
  end if;
  tag_count := jsonb_array_length(coalesce(p_input->'tag_ids','[]'::jsonb));
  if tag_count > 20 then raise exception 'Too many tags' using errcode='23514'; end if;
  delete from public.health_event_tags where event_id=saved_id;
  insert into public.health_event_tags(owner_id,event_id,tag_id)
    select auth.uid(),saved_id,value::uuid from jsonb_array_elements_text(coalesce(p_input->'tag_ids','[]'::jsonb))
    on conflict do nothing;
  return public.health_event_document(saved_id);
end;
$$;


create or replace function public.filtered_health_events(p_filters jsonb) returns setof public.health_events
language sql stable security invoker set search_path = '' as $$
  select e.* from public.health_events e
  where (nullif(p_filters->>'profile_id','') is null or e.profile_id=(p_filters->>'profile_id')::uuid)
    and (nullif(p_filters->>'event_type','') is null or e.event_type=p_filters->>'event_type')
    and (nullif(p_filters->>'provider_id','') is null or e.provider_id=(p_filters->>'provider_id')::uuid)
    and (nullif(p_filters->>'category_id','') is null or e.category_id=(p_filters->>'category_id')::uuid)
    and (nullif(p_filters->>'date_from','') is null or coalesce(e.end_date,e.event_date)>=(p_filters->>'date_from')::timestamptz)
    and (nullif(p_filters->>'date_to','') is null or e.event_date<(p_filters->>'date_to')::timestamptz)
    -- Match ALL selected tags, not just one. Empty selection matches every event.
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p_filters->'tag_ids','[]'::jsonb)) wanted
      where not exists (select 1 from public.health_event_tags et where et.event_id=e.id and et.tag_id=wanted.value::uuid))
    -- Literal case-insensitive substring search: punctuation never becomes SQL or wildcard syntax.
    and (nullif(btrim(p_filters->>'q'),'') is null or strpos(lower(concat_ws(' ',e.title,e.description,e.symptoms,e.diagnosis,e.notes)),lower(btrim(p_filters->>'q')))>0);
$$;

commit;
