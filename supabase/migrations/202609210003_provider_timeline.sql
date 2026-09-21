begin;

create or replace function public.provider_health_timeline(
  p_provider_id uuid,
  p_profile_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 30
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with event_records as (
    select
      'event:' || e.id::text as id,
      'event'::text as record_type,
      e.id as event_id,
      null::uuid as document_group_id,
      e.profile_id,
      e.event_type,
      case
        when e.event_type = 'Vaccination' and nullif(btrim(e.disease), '') is not null
          then e.disease
        else e.title
      end as title,
      e.event_date as occurred_at,
      null::text as description,
      null::text as file_name,
      null::text as document_category
    from public.health_events e
    where e.provider_id = p_provider_id
      and (p_profile_id is null or e.profile_id = p_profile_id)
  ), document_records as (
    select
      'document:' || a.document_group_id::text as id,
      'document'::text as record_type,
      a.health_event_id as event_id,
      a.document_group_id,
      e.profile_id,
      e.event_type,
      null::text as title,
      min(a.created_at) as occurred_at,
      a.description,
      (array_agg(a.file_name order by a.created_at, a.id))[1] as file_name,
      a.document_category
    from public.attachments a
    join public.health_events e on e.id = a.health_event_id
    where a.attachment_kind = 'document'
      and (
        a.provider_id = p_provider_id
        or (a.provider_id is null and e.provider_id = p_provider_id)
      )
      and (p_profile_id is null or e.profile_id = p_profile_id)
      and exists (
        select 1 from storage.objects o
        where o.bucket_id = 'health-attachments' and o.name = a.file_path
      )
    group by a.document_group_id, a.health_event_id, e.profile_id,
      e.event_type, a.description, a.document_category
  ), records as materialized (
    select * from event_records
    union all
    select * from document_records
  ), paged as (
    select * from records
    order by occurred_at desc, id desc
    limit least(greatest(p_page_size, 1), 100)
    offset (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.occurred_at desc, p.id desc)
      from paged p
    ), '[]'::jsonb),
    'total', (select count(*) from records)
  );
$$;

revoke all on function public.provider_health_timeline(uuid,uuid,integer,integer)
  from public, anon;
grant execute on function public.provider_health_timeline(uuid,uuid,integer,integer)
  to authenticated;

commit;
