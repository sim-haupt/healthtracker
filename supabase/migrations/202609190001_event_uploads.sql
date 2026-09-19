begin;

alter table public.attachments
  add column attachment_kind text not null default 'document';

alter table public.attachments
  add constraint attachments_kind_check
  check (attachment_kind in ('document', 'event_upload'));

create index attachments_event_kind_idx
  on public.attachments(owner_id, health_event_id, attachment_kind, created_at desc);

create or replace function public.event_documents(p_event_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(a) - 'owner_id' order by a.created_at, a.id), '[]'::jsonb)
  from public.attachments a
  where a.attachment_kind = 'document'
    and (a.health_event_id = p_event_id or exists (
      select 1 from public.health_event_documents l
      where l.event_id = p_event_id and l.document_id = a.id
    ));
$$;

create or replace function public.event_uploads(p_event_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(a) - 'owner_id' order by a.created_at, a.id), '[]'::jsonb)
  from public.attachments a
  where a.health_event_id = p_event_id and a.attachment_kind = 'event_upload';
$$;

create or replace function public.search_health_documents(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (
    select a.id, a.health_event_id, a.file_name, a.file_path, a.mime_type, a.file_size,
      a.document_category, a.attachment_kind, a.description, a.created_at,
      e.profile_id, e.title as event_title, e.event_type, e.event_date,
      public.health_event_summary(e::public.health_events)->'category' as event_category,
      public.health_event_summary(e::public.health_events)->'tags' as tags
    from public.attachments a join public.health_events e on e.id = a.health_event_id
    where a.attachment_kind = 'document'
      and exists (select 1 from storage.objects o where o.bucket_id='health-attachments' and o.name=a.file_path)
      and (nullif(p_filters->>'profile_id','') is null or e.profile_id=(p_filters->>'profile_id')::uuid)
      and (nullif(p_filters->>'event_id','') is null or e.id=(p_filters->>'event_id')::uuid)
      and (nullif(p_filters->>'document_category','') is null or a.document_category=p_filters->>'document_category')
      and (nullif(p_filters->>'date_from','') is null or a.created_at >= (p_filters->>'date_from')::timestamptz)
      and (nullif(p_filters->>'date_to','') is null or a.created_at < (p_filters->>'date_to')::timestamptz)
      and not exists (select 1 from jsonb_array_elements_text(coalesce(p_filters->'tag_ids','[]'::jsonb)) wanted where not exists (select 1 from public.health_event_tags et where et.event_id=e.id and et.tag_id=wanted.value::uuid))
      and (nullif(btrim(p_filters->>'q'),'') is null or strpos(lower(concat_ws(' ',a.file_name,a.description)),lower(btrim(p_filters->>'q')))>0)
      and (nullif(p_filters->>'file_type','') is null or case p_filters->>'file_type'
        when 'image' then a.mime_type like 'image/%' when 'pdf' then a.mime_type='application/pdf'
        when 'word' then a.mime_type in ('application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text','application/rtf')
        when 'spreadsheet' then a.mime_type in ('application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        when 'presentation' then a.mime_type in ('application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation')
        when 'text' then a.mime_type in ('text/plain','text/csv') else false end)
  ), paged as (
    select * from filtered order by created_at desc,id desc
    limit least(greatest(coalesce((p_filters->>'page_size')::integer,24),1),100)
    offset (greatest(coalesce((p_filters->>'page')::integer,1),1)-1)::bigint * least(greatest(coalesce((p_filters->>'page_size')::integer,24),1),100)
  )
  select jsonb_build_object('documents',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from paged p),'[]'::jsonb),'total',(select count(*) from filtered));
$$;

grant execute on function public.event_uploads(uuid) to authenticated;
commit;
