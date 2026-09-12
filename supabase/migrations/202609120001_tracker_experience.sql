begin;

alter table public.categories add constraint categories_owner_id_unique unique (owner_id, id);
alter table public.health_events add column category_id uuid;
alter table public.health_events add constraint health_events_category_fk
  foreign key (owner_id, category_id) references public.categories(owner_id, id);
create index health_events_category_date_idx on public.health_events(owner_id, category_id, event_date desc);

-- Optional starter labels, scoped to each account. Existing names are preserved.
insert into public.tags(owner_id, name)
select u.user_id, labels.name from public.app_users u cross join
(values ('flu'),('fever'),('blood test'),('dentist'),('antibiotics'),('allergy')) labels(name)
on conflict do nothing;
insert into public.categories(owner_id, name)
select u.user_id, labels.name from public.app_users u cross join
(values ('General care'),('Tests & results'),('Medication'),('Recovery')) labels(name)
on conflict do nothing;
create or replace function public.create_default_health_profiles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(owner_id, name) values (new.user_id, 'Profile 1'), (new.user_id, 'Profile 2');
  insert into public.tags(owner_id, name)
  select new.user_id, name from (values ('flu'),('fever'),('blood test'),('dentist'),('antibiotics'),('allergy')) labels(name);
  insert into public.categories(owner_id, name)
  select new.user_id, name from (values ('General care'),('Tests & results'),('Medication'),('Recovery')) labels(name);
  return new;
end;
$$;

-- All functions below run as the caller. RLS applies even to direct RPC calls.
create function public.health_event_document(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select (to_jsonb(e) - 'owner_id') || jsonb_build_object(
    'category', (select jsonb_build_object('id',c.id,'name',c.name) from public.categories c where c.id=e.category_id),
    'tag_ids', coalesce((select jsonb_agg(t.tag_id order by t.tag_id) from public.health_event_tags t where t.event_id=e.id), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name,t.id)
      from public.health_event_tags et join public.tags t on t.id=et.tag_id where et.event_id=e.id), '[]'::jsonb)
  ) from public.health_events e where e.id=p_id;
$$;

-- Event and tag changes are one transaction; a bad/foreign tag rolls everything back.
create function public.save_health_event(p_id uuid, p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v public.health_events; saved_id uuid; tag_count integer;
begin
  v := jsonb_populate_record(null::public.health_events, p_input);
  if p_id is null then
    insert into public.health_events(owner_id,profile_id,event_type,title,description,event_date,end_date,symptoms,diagnosis,treatment,prescription,doctor,location,notes,category_id)
    values (auth.uid(),v.profile_id,v.event_type,v.title,coalesce(v.description,''),v.event_date,v.end_date,v.symptoms,v.diagnosis,v.treatment,v.prescription,v.doctor,v.location,v.notes,v.category_id)
    returning id into saved_id;
  else
    -- The update holds a row lock while tag associations are replaced.
    update public.health_events set profile_id=v.profile_id,event_type=v.event_type,title=v.title,description=coalesce(v.description,''),
      event_date=v.event_date,end_date=v.end_date,symptoms=v.symptoms,diagnosis=v.diagnosis,treatment=v.treatment,
      prescription=v.prescription,doctor=v.doctor,location=v.location,notes=v.notes,category_id=v.category_id
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

create function public.filtered_health_events(p_filters jsonb) returns setof public.health_events
language sql stable security invoker set search_path = '' as $$
  select e.* from public.health_events e
  where (nullif(p_filters->>'profile_id','') is null or e.profile_id=(p_filters->>'profile_id')::uuid)
    and (nullif(p_filters->>'event_type','') is null or e.event_type=p_filters->>'event_type')
    and (nullif(p_filters->>'category_id','') is null or e.category_id=(p_filters->>'category_id')::uuid)
    and (nullif(p_filters->>'date_from','') is null or coalesce(e.end_date,e.event_date)>=(p_filters->>'date_from')::timestamptz)
    and (nullif(p_filters->>'date_to','') is null or e.event_date<(p_filters->>'date_to')::timestamptz)
    -- Match ALL selected tags, not just one. Empty selection matches every event.
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p_filters->'tag_ids','[]'::jsonb)) wanted
      where not exists (select 1 from public.health_event_tags et where et.event_id=e.id and et.tag_id=wanted.value::uuid))
    -- Literal case-insensitive substring search: punctuation never becomes SQL or wildcard syntax.
    and (nullif(btrim(p_filters->>'q'),'') is null or strpos(lower(concat_ws(' ',e.title,e.description,e.symptoms,e.diagnosis,e.notes)),lower(btrim(p_filters->>'q')))>0);
$$;
create function public.health_event_summary(p_event public.health_events) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',p_event.id,'profile_id',p_event.profile_id,'event_type',p_event.event_type,'title',p_event.title,
    'event_date',p_event.event_date,'end_date',p_event.end_date,'category_id',p_event.category_id,
    'category',(select jsonb_build_object('id',c.id,'name',c.name) from public.categories c where c.id=p_event.category_id),
    'tags',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name,t.id)
      from public.health_event_tags et join public.tags t on t.id=et.tag_id where et.event_id=p_event.id),'[]'::jsonb));
$$;
create function public.search_health_events(p_filters jsonb default '{}'::jsonb) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (select * from public.filtered_health_events(p_filters)),
  paged as (select * from filtered order by event_date desc,id desc
    limit least(greatest(coalesce((p_filters->>'page_size')::integer,20),1),100)
    offset (greatest(coalesce((p_filters->>'page')::integer,1),1)-1)::bigint * least(greatest(coalesce((p_filters->>'page_size')::integer,20),1),100))
  select jsonb_build_object('total',(select count(*) from filtered),
    'events',coalesce((select jsonb_agg(public.health_event_summary(paged::public.health_events) order by event_date desc,id desc) from paged),'[]'::jsonb));
$$;
create function public.health_dashboard(p_filters jsonb default '{}'::jsonb) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (select * from public.filtered_health_events(p_filters))
  select jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object(
    'profile_id',p.id,'total',(select count(*) from filtered e where e.profile_id=p.id),
    'upcoming',coalesce((select jsonb_agg(public.health_event_summary(s::public.health_events) order by event_date,id) from
      (select * from filtered e where e.profile_id=p.id and e.event_date>=now() order by event_date,id limit 3) s),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(public.health_event_summary(s::public.health_events) order by event_date desc,id desc) from
      (select * from filtered e where e.profile_id=p.id and e.event_date<now() order by event_date desc,id desc limit 3) s),'[]'::jsonb),
    'illnesses',coalesce((select jsonb_agg(public.health_event_summary(s::public.health_events) order by event_date desc,id desc) from
      (select * from filtered e where e.profile_id=p.id and e.event_type='Illness' and e.event_date<=now() order by event_date desc,id desc limit 3) s),'[]'::jsonb),
    'visits',coalesce((select jsonb_agg(public.health_event_summary(s::public.health_events) order by event_date desc,id desc) from
      (select * from filtered e where e.profile_id=p.id and e.event_type='Doctor Visit' and e.event_date<=now() order by event_date desc,id desc limit 3) s),'[]'::jsonb)
    ) order by p.created_at,p.name,p.id) from public.profiles p
      where nullif(p_filters->>'profile_id','') is null or p.id=(p_filters->>'profile_id')::uuid),'[]'::jsonb));
$$;

revoke all on function public.health_event_document(uuid), public.save_health_event(uuid,jsonb), public.filtered_health_events(jsonb), public.health_event_summary(public.health_events), public.search_health_events(jsonb), public.health_dashboard(jsonb) from public, anon;
grant execute on function public.health_event_document(uuid), public.save_health_event(uuid,jsonb), public.filtered_health_events(jsonb), public.health_event_summary(public.health_events), public.search_health_events(jsonb), public.health_dashboard(jsonb) to authenticated;
commit;
