begin;

alter table public.attachments add column provider_id uuid;
alter table public.attachments
  add constraint attachments_provider_fk
  foreign key(owner_id, provider_id)
  references public.providers(owner_id, id)
  on delete set null(provider_id);
create index attachments_provider_idx
  on public.attachments(owner_id, provider_id)
  where provider_id is not null;

grant update(provider_id) on public.attachments to authenticated;

create or replace function public.search_health_documents(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with available as materialized (
    select a.*
    from public.attachments a
    where a.attachment_kind = 'document'
      and exists (
        select 1 from storage.objects o
        where o.bucket_id = 'health-attachments' and o.name = a.file_path
      )
  ), grouped as materialized (
    select
      (array_agg(a.id order by a.created_at, a.id))[1] as id,
      a.document_group_id,
      a.health_event_id,
      a.provider_id,
      (array_agg(a.file_name order by a.created_at, a.id))[1] as file_name,
      (array_agg(a.file_path order by a.created_at, a.id))[1] as file_path,
      (array_agg(a.mime_type order by a.created_at, a.id))[1] as mime_type,
      sum(a.file_size)::bigint as file_size,
      a.document_category,
      'document'::text as attachment_kind,
      a.description,
      min(a.created_at) as created_at,
      string_agg(a.file_name, ' ' order by a.created_at, a.id) as file_names,
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'document_group_id', a.document_group_id,
          'health_event_id', a.health_event_id,
          'provider_id', a.provider_id,
          'file_name', a.file_name,
          'file_path', a.file_path,
          'mime_type', a.mime_type,
          'file_size', a.file_size,
          'document_category', a.document_category,
          'attachment_kind', a.attachment_kind,
          'description', a.description,
          'created_at', a.created_at
        ) order by a.created_at, a.id
      ) as files
    from available a
    group by a.document_group_id, a.health_event_id, a.provider_id,
      a.document_category, a.description
  ), filtered as materialized (
    select
      g.id, g.document_group_id, g.health_event_id, g.provider_id,
      g.file_name, g.file_path, g.mime_type, g.file_size,
      g.document_category, g.attachment_kind, g.description, g.created_at,
      g.files, e.profile_id, e.title as event_title, e.event_type, e.event_date,
      case when p.id is null then null else jsonb_build_object(
        'id', p.id, 'name', p.name, 'specialty', p.specialty
      ) end as provider,
      public.health_event_summary(e::public.health_events)->'category' as event_category,
      public.health_event_summary(e::public.health_events)->'tags' as tags
    from grouped g
    join public.health_events e on e.id = g.health_event_id
    left join public.providers p on p.id = g.provider_id
    where (nullif(p_filters->>'profile_id','') is null or e.profile_id=(p_filters->>'profile_id')::uuid)
      and (nullif(p_filters->>'event_id','') is null or e.id=(p_filters->>'event_id')::uuid)
      and (nullif(p_filters->>'document_category','') is null or g.document_category=p_filters->>'document_category')
      and (nullif(p_filters->>'date_from','') is null or g.created_at >= (p_filters->>'date_from')::timestamptz)
      and (nullif(p_filters->>'date_to','') is null or g.created_at < (p_filters->>'date_to')::timestamptz)
      and not exists (
        select 1
        from jsonb_array_elements_text(coalesce(p_filters->'tag_ids','[]'::jsonb)) wanted
        where not exists (
          select 1 from public.health_event_tags et
          where et.event_id=e.id and et.tag_id=wanted.value::uuid
        )
      )
      and (
        nullif(btrim(p_filters->>'q'),'') is null
        or strpos(
          lower(concat_ws(' ',g.file_names,g.description,p.name)),
          lower(btrim(p_filters->>'q'))
        ) > 0
      )
      and (
        nullif(p_filters->>'file_type','') is null
        or exists (
          select 1 from jsonb_array_elements(g.files) file
          where case p_filters->>'file_type'
            when 'image' then file->>'mime_type' like 'image/%'
            when 'pdf' then file->>'mime_type'='application/pdf'
            when 'word' then file->>'mime_type' in ('application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text','application/rtf')
            when 'spreadsheet' then file->>'mime_type' in ('application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            when 'presentation' then file->>'mime_type' in ('application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation')
            when 'text' then file->>'mime_type' in ('text/plain','text/csv')
            else false end
        )
      )
  ), paged as (
    select * from filtered order by created_at desc,id desc
    limit least(greatest(coalesce((p_filters->>'page_size')::integer,24),1),100)
    offset (greatest(coalesce((p_filters->>'page')::integer,1),1)-1)::bigint
      * least(greatest(coalesce((p_filters->>'page_size')::integer,24),1),100)
  )
  select jsonb_build_object(
    'documents',coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from paged p
    ),'[]'::jsonb),
    'total',(select count(*) from filtered)
  );
$$;

commit;
