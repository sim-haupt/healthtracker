begin;
-- Vaccine name uses the existing event title; administered date uses event_date.
alter table public.health_events add column disease text check(length(disease)<=300);
alter table public.health_events add column next_dose_date date;
create index vaccination_doses_idx on public.health_events(owner_id,profile_id,next_dose_date) where event_type='Vaccination' and next_dose_date is not null;
create or replace function public.save_health_event(p_id uuid, p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v public.health_events; saved_id uuid; tag_count integer;
begin
  v := jsonb_populate_record(null::public.health_events, p_input);
  if p_id is null then
    insert into public.health_events(owner_id,profile_id,event_type,title,description,event_date,end_date,symptoms,diagnosis,treatment,prescription,doctor,location,notes,category_id,provider_id,disease,next_dose_date)
    values (auth.uid(),v.profile_id,v.event_type,v.title,coalesce(v.description,''),v.event_date,v.end_date,v.symptoms,v.diagnosis,v.treatment,v.prescription,v.doctor,v.location,v.notes,v.category_id,v.provider_id,v.disease,v.next_dose_date)
    returning id into saved_id;
  else
    -- The update holds a row lock while tag associations are replaced.
    update public.health_events set profile_id=v.profile_id,event_type=v.event_type,title=v.title,description=coalesce(v.description,''),
      event_date=v.event_date,end_date=v.end_date,symptoms=v.symptoms,diagnosis=v.diagnosis,treatment=v.treatment,
      prescription=v.prescription,doctor=v.doctor,location=v.location,notes=v.notes,category_id=v.category_id,provider_id=v.provider_id,disease=v.disease,next_dose_date=v.next_dose_date
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


create or replace function public.health_event_summary(p_event public.health_events) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',p_event.id,'profile_id',p_event.profile_id,'event_type',p_event.event_type,'title',p_event.title,
    'event_date',p_event.event_date,'end_date',p_event.end_date,'category_id',p_event.category_id,'disease',p_event.disease,'next_dose_date',p_event.next_dose_date,
    'category',(select jsonb_build_object('id',c.id,'name',c.name) from public.categories c where c.id=p_event.category_id),
    'tags',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name,t.id)
      from public.health_event_tags et join public.tags t on t.id=et.tag_id where et.event_id=p_event.id),'[]'::jsonb));
$$;
create or replace function public.health_dashboard(p_filters jsonb default '{}'::jsonb) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (select * from public.filtered_health_events(p_filters))
  select jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object(
    'profile_id',p.id,'total',(select count(*) from filtered e where e.profile_id=p.id),
    'vaccination_doses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'date',e.next_dose_date,'disease',e.disease) order by e.next_dose_date,e.id)
      from (select e.* from public.filtered_health_events(p_filters - 'date_from' - 'date_to') e
        where e.profile_id=p.id and e.event_type='Vaccination' and e.next_dose_date >= current_date
      and (nullif(p_filters->>'date_from','') is null or e.next_dose_date >= (p_filters->>'date_from')::timestamptz::date)
      and (nullif(p_filters->>'date_to','') is null or e.next_dose_date < (p_filters->>'date_to')::timestamptz::date)
        order by e.next_dose_date,e.id limit 3) e), '[]'::jsonb),
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


commit;
