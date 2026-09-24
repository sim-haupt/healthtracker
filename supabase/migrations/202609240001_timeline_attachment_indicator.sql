begin;

create or replace function public.health_timeline(
  p_filters jsonb default '{}'::jsonb,
  p_entry_type text default 'all'
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with matching as materialized (
    select e.*
    from public.filtered_health_events(p_filters - 'date_from' - 'date_to') e
  ), entries as (
    select
      'event:' || e.id::text as id,
      'event'::text as entry_type,
      e.id as event_id,
      e.profile_id,
      e.event_type,
      public.health_event_summary(e::public.health_events)->>'title' as title,
      public.health_event_summary(e::public.health_events)->>'title' as event_title,
      e.event_date as occurred_at,
      left(coalesce(nullif(e.diagnosis, ''), nullif(e.symptoms, ''),
        nullif(e.description, ''), nullif(e.treatment, ''),
        nullif(e.prescription, ''), nullif(e.notes, ''), ''), 320) as summary,
      public.health_event_summary(e::public.health_events)->'tags' as tags,
      public.health_event_summary(e::public.health_events)->'category' as category,
      (
        select r.source_event_id
        from public.health_event_relations r
        where r.target_event_id = e.id and r.relation_type = 'visit_symptom'
        order by r.created_at desc, r.source_event_id
        limit 1
      ) as related_event_id,
      exists (
        select 1
        from public.attachments a
        where (
          a.health_event_id = e.id
          or exists (
            select 1 from public.health_event_documents linked
            where linked.event_id = e.id and linked.document_id = a.id
          )
        )
        and exists (
          select 1 from storage.objects o
          where o.bucket_id = 'health-attachments' and o.name = a.file_path
        )
      ) as has_attachments,
      null::text as mime_type,
      null::bigint as file_size
    from matching e
    where p_entry_type in ('all', 'event')

    union all

    select
      'episode:' || ep.id::text,
      'episode',
      ep.id,
      ep.profile_id,
      'Health Episode',
      ep.title,
      ep.title,
      ep.start_date::timestamp at time zone 'UTC',
      ep.status
        || case when ep.end_date is not null then ' · Ends ' || ep.end_date::text else '' end
        || case when ep.description <> '' then ' · ' || left(ep.description, 320) else '' end,
      '[]'::jsonb,
      null::jsonb,
      null::uuid,
      false,
      null::text,
      null::bigint
    from public.health_episodes ep
    where p_entry_type in ('all', 'episode')
      and (nullif(p_filters->>'profile_id', '') is null or ep.profile_id = (p_filters->>'profile_id')::uuid)
      and (nullif(btrim(p_filters->>'q'), '') is null or strpos(lower(ep.title || ' ' || ep.description), lower(btrim(p_filters->>'q'))) > 0)
      and (
        (
          nullif(p_filters->>'event_type', '') is null
          and nullif(p_filters->>'provider_id', '') is null
          and nullif(p_filters->>'category_id', '') is null
          and jsonb_array_length(coalesce(p_filters->'tag_ids', '[]')) = 0
        )
        or exists (
          select 1
          from public.health_episode_events linked
          join public.filtered_health_events(p_filters - 'date_from' - 'date_to' - 'q') h
            on h.id = linked.event_id
          where linked.episode_id = ep.id
        )
      )
  ), dated as (
    select * from entries
    where (nullif(p_filters->>'date_from', '') is null or occurred_at >= (p_filters->>'date_from')::timestamptz)
      and (nullif(p_filters->>'date_to', '') is null or occurred_at < (p_filters->>'date_to')::timestamptz)
  ), paged as (
    select * from dated
    order by occurred_at desc, id desc
    limit least(greatest(coalesce((p_filters->>'page_size')::integer, 30), 1), 100)
    offset (greatest(coalesce((p_filters->>'page')::integer, 1), 1) - 1)
      * least(greatest(coalesce((p_filters->>'page_size')::integer, 30), 1), 100)
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.occurred_at desc, p.id desc)
      from paged p
    ), '[]'::jsonb),
    'total', (select count(*) from dated)
  );
$$;

commit;
