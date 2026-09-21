begin;

create or replace function public.update_health_document(
  p_document_group_id uuid,
  p_input jsonb
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  current_event_id uuid;
  requested_event_id uuid;
  requested_provider_id uuid;
  requested_tag_count integer;
begin
  select (array_agg(a.health_event_id order by a.created_at, a.id))[1],
      count(distinct a.health_event_id)
    into current_event_id, requested_tag_count
  from public.attachments a
  where a.document_group_id = p_document_group_id
    and a.attachment_kind = 'document';

  if current_event_id is null then return false; end if;
  if requested_tag_count <> 1 then
    raise exception 'A document group must belong to one event' using errcode = '23514';
  end if;

  requested_event_id := (p_input->>'event_id')::uuid;
  if requested_event_id is distinct from current_event_id then
    raise exception 'Replace the files to move a document to another event' using errcode = '23514';
  end if;
  if jsonb_array_length(coalesce(p_input->'tag_ids', '[]'::jsonb)) > 20 then
    raise exception 'Too many tags' using errcode = '23514';
  end if;

  requested_provider_id := nullif(p_input->>'provider_id', '')::uuid;
  requested_tag_count := jsonb_array_length(coalesce(p_input->'tag_ids', '[]'::jsonb));
  if (
    select count(distinct t.id)
    from public.tags t
    join jsonb_array_elements_text(coalesce(p_input->'tag_ids', '[]'::jsonb)) wanted
      on wanted.value::uuid = t.id
  ) <> requested_tag_count then
    raise exception 'Choose available tags' using errcode = '23503';
  end if;

  update public.attachments
  set document_category = p_input->>'document_category',
      description = nullif(btrim(p_input->>'description'), ''),
      provider_id = requested_provider_id
  where document_group_id = p_document_group_id
    and attachment_kind = 'document';

  delete from public.health_event_tags where event_id = current_event_id;
  insert into public.health_event_tags(owner_id, event_id, tag_id)
  select auth.uid(), current_event_id, wanted.value::uuid
  from jsonb_array_elements_text(coalesce(p_input->'tag_ids', '[]'::jsonb)) wanted
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.update_health_document(uuid, jsonb)
  from public, anon;
grant execute on function public.update_health_document(uuid, jsonb)
  to authenticated;

commit;
