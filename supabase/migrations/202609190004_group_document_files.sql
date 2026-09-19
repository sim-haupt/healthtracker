begin;

alter table public.attachments add column document_group_id uuid;
update public.attachments set document_group_id = id;

-- Earlier multi-file submissions created one row per file. Reconstruct those
-- batches only when their shared, non-empty description and other document
-- metadata match and the files were reserved within five minutes.
with ordered as (
  select
    id,
    owner_id,
    health_event_id,
    document_category,
    description,
    created_at,
    lag(created_at) over (
      partition by owner_id, health_event_id, document_category, description
      order by created_at, id
    ) as previous_created_at
  from public.attachments
  where attachment_kind = 'document' and nullif(btrim(description), '') is not null
), islands as (
  select
    *,
    sum(
      case
        when previous_created_at is null
          or created_at - previous_created_at > interval '5 minutes'
        then 1 else 0
      end
    ) over (
      partition by owner_id, health_event_id, document_category, description
      order by created_at, id
    ) as batch_number
  from ordered
), batches as (
  select
    id,
    first_value(id) over (
      partition by owner_id, health_event_id, document_category, description, batch_number
      order by created_at, id
    ) as group_id
  from islands
)
update public.attachments a
set document_group_id = batches.group_id
from batches
where a.id = batches.id;

alter table public.attachments
  alter column document_group_id set not null,
  alter column document_group_id set default gen_random_uuid();

create index attachments_document_group_idx
  on public.attachments(owner_id, document_group_id, created_at, id);

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
    group by a.document_group_id, a.health_event_id, a.document_category, a.description
  ), filtered as materialized (
    select
      g.id, g.document_group_id, g.health_event_id, g.file_name, g.file_path,
      g.mime_type, g.file_size, g.document_category, g.attachment_kind,
      g.description, g.created_at, g.files,
      e.profile_id, e.title as event_title, e.event_type, e.event_date,
      public.health_event_summary(e::public.health_events)->'category' as event_category,
      public.health_event_summary(e::public.health_events)->'tags' as tags
    from grouped g
    join public.health_events e on e.id = g.health_event_id
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
          lower(concat_ws(' ',g.file_names,g.description)),
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

create or replace function public.link_event_document(p_event_id uuid, p_document_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  linked public.attachments;
begin
  select * into linked
  from public.attachments
  where id = p_document_id and attachment_kind = 'document';
  if linked.id is null then return null; end if;

  insert into public.health_event_documents(
    owner_id, profile_id, event_id, source_event_id, document_id
  )
  select target.owner_id, target.profile_id, target.id, source.id, attachment.id
  from public.health_events target
  join public.attachments attachment
    on attachment.document_group_id = linked.document_group_id
   and attachment.attachment_kind = 'document'
  join public.health_events source
    on source.id = attachment.health_event_id
   and source.owner_id = target.owner_id
   and source.profile_id = target.profile_id
  where target.id = p_event_id
    and target.owner_id = (select auth.uid())
  on conflict(event_id, document_id) do nothing;

  insert into public.health_event_tags(owner_id, event_id, tag_id)
  select target.owner_id, target.id, source_tags.tag_id
  from public.health_events target
  join public.health_events source
    on source.id = linked.health_event_id
   and source.owner_id = target.owner_id
   and source.profile_id = target.profile_id
  join public.health_event_tags source_tags on source_tags.event_id = source.id
  where target.id = p_event_id
    and target.owner_id = (select auth.uid())
  on conflict(event_id, tag_id) do nothing;

  if not exists (
    select 1 from public.health_event_documents l
    where l.event_id = p_event_id and l.document_id = linked.id
  ) and linked.health_event_id <> p_event_id then
    return null;
  end if;
  return to_jsonb(linked) - 'owner_id';
end;
$$;

commit;
