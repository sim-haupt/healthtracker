begin;
create index attachments_timeline_date_idx on public.attachments(owner_id,created_at desc,id);
-- Read-only, security invoker: event, label, attachment, and Storage RLS all apply.
create function public.health_timeline(p_filters jsonb default '{}'::jsonb,p_entry_type text default 'all')
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
revoke all on function public.health_timeline(jsonb,text) from public,anon;
grant execute on function public.health_timeline(jsonb,text) to authenticated;
commit;
