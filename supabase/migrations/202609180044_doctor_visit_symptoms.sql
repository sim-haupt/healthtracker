begin;

create table public.health_event_relations (
  owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
  profile_id uuid not null,
  source_event_id uuid not null,
  target_event_id uuid not null,
  relation_type text not null check (relation_type = 'visit_symptom'),
  created_at timestamptz not null default now(),
  primary key (source_event_id, target_event_id, relation_type),
  foreign key (owner_id, profile_id, source_event_id)
    references public.health_events(owner_id, profile_id, id) on delete cascade,
  foreign key (owner_id, profile_id, target_event_id)
    references public.health_events(owner_id, profile_id, id) on delete cascade,
  check (source_event_id <> target_event_id)
);

create unique index health_event_visit_symptom_source_idx
  on public.health_event_relations(owner_id, source_event_id)
  where relation_type = 'visit_symptom';
create index health_event_visit_symptom_target_idx
  on public.health_event_relations(owner_id, target_event_id, source_event_id)
  where relation_type = 'visit_symptom';

alter table public.health_event_relations enable row level security;
revoke all on public.health_event_relations from public, anon, authenticated;
grant select, insert, update, delete on public.health_event_relations to authenticated;
create policy health_event_relation_owner on public.health_event_relations
for all to authenticated
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

create or replace function public.health_event_document(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select (to_jsonb(e) - 'owner_id') || jsonb_build_object(
    'provider', (select jsonb_build_object('id',p.id,'name',p.name,'specialty',p.specialty) from public.providers p where p.id=e.provider_id),
    'category', (select jsonb_build_object('id',c.id,'name',c.name) from public.categories c where c.id=e.category_id),
    'tag_ids', coalesce((select jsonb_agg(t.tag_id order by t.tag_id) from public.health_event_tags t where t.event_id=e.id), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name,t.id)
      from public.health_event_tags et join public.tags t on t.id=et.tag_id where et.event_id=e.id), '[]'::jsonb),
    'related_symptom_id', (select r.target_event_id from public.health_event_relations r
      where r.source_event_id=e.id and r.relation_type='visit_symptom'),
    'related_symptom', (select jsonb_build_object('id',s.id,'title',s.title,'event_type',s.event_type,'event_date',s.event_date)
      from public.health_event_relations r join public.health_events s on s.id=r.target_event_id
      where r.source_event_id=e.id and r.relation_type='visit_symptom'),
    'related_visits', coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'title',v.title,'event_type',v.event_type,'event_date',v.event_date
    ) order by v.event_date desc,v.id)
      from public.health_event_relations r join public.health_events v on v.id=r.source_event_id
      where r.target_event_id=e.id and r.relation_type='visit_symptom'), '[]'::jsonb)
  ) from public.health_events e where e.id=p_id;
$$;

create or replace function public.save_health_event(p_id uuid, p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v public.health_events;
  saved_id uuid;
  tag_count integer;
  symptom_id uuid;
begin
  v := jsonb_populate_record(null::public.health_events, p_input);
  symptom_id := nullif(p_input->>'related_symptom_id','')::uuid;

  if symptom_id is not null then
    if v.event_type <> 'Doctor Visit' then
      raise exception 'Only doctor visits can be linked to symptoms' using errcode='23514';
    end if;
    if not exists (
      select 1 from public.health_events s
      where s.id=symptom_id and s.owner_id=auth.uid()
        and s.profile_id=v.profile_id and s.event_type='Symptom'
    ) then
      raise exception 'Choose an available symptom event' using errcode='23503';
    end if;
  end if;

  if p_id is null then
    insert into public.health_events(owner_id,profile_id,event_type,title,description,event_date,end_date,symptoms,diagnosis,treatment,prescription,doctor,location,notes,category_id,provider_id,test_type,severity,trigger,relief,injury_type,body_area,frequency,recovery,action,disease,dose_number,dose_total,next_dose_date,needs_renewal,renewal_date)
    values (auth.uid(),v.profile_id,v.event_type,v.title,coalesce(v.description,''),v.event_date,v.end_date,v.symptoms,v.diagnosis,v.treatment,v.prescription,v.doctor,v.location,v.notes,v.category_id,v.provider_id,v.test_type,v.severity,v.trigger,v.relief,v.injury_type,v.body_area,v.frequency,v.recovery,v.action,v.disease,v.dose_number,v.dose_total,v.next_dose_date,coalesce(v.needs_renewal,false),v.renewal_date)
    returning id into saved_id;
  else
    update public.health_events set profile_id=v.profile_id,event_type=v.event_type,title=v.title,description=coalesce(v.description,''),
      event_date=v.event_date,end_date=v.end_date,symptoms=v.symptoms,diagnosis=v.diagnosis,treatment=v.treatment,
      prescription=v.prescription,doctor=v.doctor,location=v.location,notes=v.notes,category_id=v.category_id,provider_id=v.provider_id,
      test_type=v.test_type,severity=v.severity,trigger=v.trigger,relief=v.relief,injury_type=v.injury_type,body_area=v.body_area,frequency=v.frequency,recovery=v.recovery,action=v.action,disease=v.disease,dose_number=v.dose_number,dose_total=v.dose_total,next_dose_date=v.next_dose_date,
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

  delete from public.health_event_relations
  where source_event_id=saved_id and relation_type='visit_symptom';
  if symptom_id is not null then
    insert into public.health_event_relations(owner_id,profile_id,source_event_id,target_event_id,relation_type)
    values(auth.uid(),v.profile_id,saved_id,symptom_id,'visit_symptom');
  end if;

  return public.health_event_document(saved_id);
end;
$$;

revoke all on function public.health_event_document(uuid), public.save_health_event(uuid,jsonb) from public, anon;
grant execute on function public.health_event_document(uuid), public.save_health_event(uuid,jsonb) to authenticated;

commit;
