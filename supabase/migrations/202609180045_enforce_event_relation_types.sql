begin;

drop policy health_event_relation_owner on public.health_event_relations;
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
  and exists (
    select 1 from public.health_events source
    where source.id = health_event_relations.source_event_id
      and source.owner_id = health_event_relations.owner_id
      and source.profile_id = health_event_relations.profile_id
      and source.event_type = 'Doctor Visit'
  )
  and exists (
    select 1 from public.health_events target
    where target.id = health_event_relations.target_event_id
      and target.owner_id = health_event_relations.owner_id
      and target.profile_id = health_event_relations.profile_id
      and target.event_type = 'Symptom'
  )
);

commit;
