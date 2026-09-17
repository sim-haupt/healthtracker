begin;

alter table public.health_events
  add column test_type text check (length(test_type) <= 300);

create or replace function public.save_health_event(p_id uuid, p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v public.health_events; saved_id uuid; tag_count integer;
begin
  v := jsonb_populate_record(null::public.health_events, p_input);
  if p_id is null then
    insert into public.health_events(owner_id,profile_id,event_type,title,description,event_date,end_date,symptoms,diagnosis,treatment,prescription,doctor,location,notes,category_id,provider_id,test_type,disease,dose_number,dose_total,next_dose_date,needs_renewal,renewal_date)
    values (auth.uid(),v.profile_id,v.event_type,v.title,coalesce(v.description,''),v.event_date,v.end_date,v.symptoms,v.diagnosis,v.treatment,v.prescription,v.doctor,v.location,v.notes,v.category_id,v.provider_id,v.test_type,v.disease,v.dose_number,v.dose_total,v.next_dose_date,coalesce(v.needs_renewal,false),v.renewal_date)
    returning id into saved_id;
  else
    update public.health_events set profile_id=v.profile_id,event_type=v.event_type,title=v.title,description=coalesce(v.description,''),
      event_date=v.event_date,end_date=v.end_date,symptoms=v.symptoms,diagnosis=v.diagnosis,treatment=v.treatment,
      prescription=v.prescription,doctor=v.doctor,location=v.location,notes=v.notes,category_id=v.category_id,provider_id=v.provider_id,
      test_type=v.test_type,disease=v.disease,dose_number=v.dose_number,dose_total=v.dose_total,next_dose_date=v.next_dose_date,
      needs_renewal=coalesce(v.needs_renewal,false),renewal_date=v.renewal_date
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
  select jsonb_build_object('id',p_event.id,'profile_id',p_event.profile_id,'event_type',p_event.event_type,
    'title',case when p_event.event_type='Vaccination' then coalesce(nullif(btrim(p_event.disease),''),p_event.title) else p_event.title end,
    'event_date',p_event.event_date,'end_date',p_event.end_date,'category_id',p_event.category_id,'test_type',p_event.test_type,'disease',p_event.disease,
    'dose_number',p_event.dose_number,'dose_total',p_event.dose_total,'next_dose_date',p_event.next_dose_date,
    'needs_renewal',p_event.needs_renewal,'renewal_date',p_event.renewal_date,
    'category',(select jsonb_build_object('id',c.id,'name',c.name) from public.categories c where c.id=p_event.category_id),
    'tags',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name,t.id)
      from public.health_event_tags et join public.tags t on t.id=et.tag_id where et.event_id=p_event.id),'[]'::jsonb));
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
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p_filters->'tag_ids','[]'::jsonb)) wanted
      where not exists (select 1 from public.health_event_tags et where et.event_id=e.id and et.tag_id=wanted.value::uuid))
    and (nullif(btrim(p_filters->>'q'),'') is null or strpos(lower(concat_ws(' ',e.title,e.test_type,e.disease,e.description,e.symptoms,e.diagnosis,e.notes)),lower(btrim(p_filters->>'q')))>0);
$$;

revoke all on function public.save_health_event(uuid,jsonb), public.health_event_summary(public.health_events), public.filtered_health_events(jsonb) from public, anon;
grant execute on function public.save_health_event(uuid,jsonb), public.health_event_summary(public.health_events), public.filtered_health_events(jsonb) to authenticated;

commit;
