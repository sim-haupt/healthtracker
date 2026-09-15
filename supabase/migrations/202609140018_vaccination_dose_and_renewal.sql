begin;

alter table public.health_events
  add column dose_number smallint check (dose_number between 1 and 3),
  add column dose_total smallint check (dose_total between 1 and 3),
  add column needs_renewal boolean not null default false,
  add column renewal_date date,
  add constraint vaccination_dose_order check (
    dose_number is null or dose_total is null or dose_number <= dose_total
  );

create or replace function public.save_health_event(p_id uuid, p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v public.health_events; saved_id uuid; tag_count integer;
begin
  v := jsonb_populate_record(null::public.health_events, p_input);
  if p_id is null then
    insert into public.health_events(owner_id,profile_id,event_type,title,description,event_date,end_date,symptoms,diagnosis,treatment,prescription,doctor,location,notes,category_id,provider_id,disease,dose_number,dose_total,next_dose_date,needs_renewal,renewal_date)
    values (auth.uid(),v.profile_id,v.event_type,v.title,coalesce(v.description,''),v.event_date,v.end_date,v.symptoms,v.diagnosis,v.treatment,v.prescription,v.doctor,v.location,v.notes,v.category_id,v.provider_id,v.disease,v.dose_number,v.dose_total,v.next_dose_date,coalesce(v.needs_renewal,false),v.renewal_date)
    returning id into saved_id;
  else
    update public.health_events set profile_id=v.profile_id,event_type=v.event_type,title=v.title,description=coalesce(v.description,''),
      event_date=v.event_date,end_date=v.end_date,symptoms=v.symptoms,diagnosis=v.diagnosis,treatment=v.treatment,
      prescription=v.prescription,doctor=v.doctor,location=v.location,notes=v.notes,category_id=v.category_id,provider_id=v.provider_id,
      disease=v.disease,dose_number=v.dose_number,dose_total=v.dose_total,next_dose_date=v.next_dose_date,
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
    'event_date',p_event.event_date,'end_date',p_event.end_date,'category_id',p_event.category_id,'disease',p_event.disease,
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
    and (nullif(btrim(p_filters->>'q'),'') is null or strpos(lower(concat_ws(' ',e.title,e.disease,e.description,e.symptoms,e.diagnosis,e.notes)),lower(btrim(p_filters->>'q')))>0);
$$;

create or replace function public.health_timeline(p_filters jsonb default '{}'::jsonb,p_entry_type text default 'all')
returns jsonb language sql stable security invoker set search_path='' as $$
 with matching as materialized (
   select e.* from public.filtered_health_events(p_filters - 'date_from' - 'date_to') e
 ), entries as (
   select 'event:'||e.id::text as id,'event'::text as entry_type,e.id as event_id,e.profile_id,e.event_type,
     public.health_event_summary(e::public.health_events)->>'title' as title,
     public.health_event_summary(e::public.health_events)->>'title' as event_title,e.event_date as occurred_at,
     left(coalesce(nullif(e.diagnosis,''),nullif(e.symptoms,''),nullif(e.description,''),nullif(e.treatment,''),nullif(e.prescription,''),nullif(e.notes,''),''),320) as summary,
     public.health_event_summary(e::public.health_events)->'tags' as tags,public.health_event_summary(e::public.health_events)->'category' as category,
     null::text as mime_type,null::bigint as file_size
   from matching e where p_entry_type in ('all','event')
   union all
   select 'attachment:'||a.id::text,'document',e.id,e.profile_id,e.event_type,a.file_name,
     public.health_event_summary(e::public.health_events)->>'title',a.created_at,
     'Attached to '||(public.health_event_summary(e::public.health_events)->>'title'),
     public.health_event_summary(e::public.health_events)->'tags',public.health_event_summary(e::public.health_events)->'category',a.mime_type,a.file_size
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

create or replace function public.search_health_documents(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (
    select a.id,a.health_event_id,a.file_name,a.file_path,a.mime_type,a.file_size,a.document_category,a.description,a.created_at,
      e.profile_id,public.health_event_summary(e::public.health_events)->>'title' as event_title,e.event_type,e.event_date,
      public.health_event_summary(e::public.health_events)->'category' as event_category,
      public.health_event_summary(e::public.health_events)->'tags' as tags
    from public.attachments a join public.health_events e on e.id = a.health_event_id
    where exists (select 1 from storage.objects o where o.bucket_id = 'health-attachments' and o.name = a.file_path)
      and (nullif(p_filters->>'profile_id', '') is null or e.profile_id = (p_filters->>'profile_id')::uuid)
      and (nullif(p_filters->>'event_id', '') is null or e.id = (p_filters->>'event_id')::uuid)
      and (nullif(p_filters->>'document_category', '') is null or a.document_category = p_filters->>'document_category')
      and (nullif(p_filters->>'date_from', '') is null or a.created_at >= (p_filters->>'date_from')::timestamptz)
      and (nullif(p_filters->>'date_to', '') is null or a.created_at < (p_filters->>'date_to')::timestamptz)
      and not exists (select 1 from jsonb_array_elements_text(coalesce(p_filters->'tag_ids', '[]'::jsonb)) wanted
        where not exists (select 1 from public.health_event_tags et where et.event_id = e.id and et.tag_id = wanted.value::uuid))
      and (nullif(btrim(p_filters->>'q'), '') is null or strpos(lower(concat_ws(' ', a.file_name, a.description)),lower(btrim(p_filters->>'q'))) > 0)
      and (nullif(p_filters->>'file_type', '') is null or case p_filters->>'file_type'
        when 'image' then a.mime_type like 'image/%'
        when 'pdf' then a.mime_type = 'application/pdf'
        when 'word' then a.mime_type in ('application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text','application/rtf')
        when 'spreadsheet' then a.mime_type in ('application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        when 'presentation' then a.mime_type in ('application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation')
        when 'text' then a.mime_type in ('text/plain','text/csv') else false end)
  ), paged as (
    select * from filtered order by created_at desc,id desc
    limit least(greatest(coalesce((p_filters->>'page_size')::integer,24),1),100)
    offset (greatest(coalesce((p_filters->>'page')::integer,1),1)-1)::bigint * least(greatest(coalesce((p_filters->>'page_size')::integer,24),1),100)
  ) select jsonb_build_object('documents',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from paged p),'[]'::jsonb),'total',(select count(*) from filtered));
$$;

commit;
