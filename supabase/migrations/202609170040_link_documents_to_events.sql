begin;

alter table public.attachments
  add constraint attachments_owner_id_unique unique(owner_id, id);

create table public.health_event_documents (
  owner_id uuid not null default auth.uid(),
  profile_id uuid not null,
  event_id uuid not null,
  source_event_id uuid not null,
  document_id uuid not null,
  primary key(event_id, document_id),
  foreign key(owner_id, profile_id, event_id)
    references public.health_events(owner_id, profile_id, id) on delete cascade,
  foreign key(owner_id, profile_id, source_event_id)
    references public.health_events(owner_id, profile_id, id) on delete cascade,
  foreign key(owner_id, document_id)
    references public.attachments(owner_id, id) on delete cascade
);

create index health_event_documents_document_idx
  on public.health_event_documents(owner_id, document_id);

alter table public.health_event_documents enable row level security;
revoke all on public.health_event_documents from public, anon, authenticated;
grant select, insert, delete on public.health_event_documents to authenticated;

create policy health_event_document_owner on public.health_event_documents for all to authenticated
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

create function public.event_documents(p_event_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(a) - 'owner_id' order by a.created_at, a.id), '[]'::jsonb)
  from public.attachments a
  where a.health_event_id = p_event_id
     or exists (
       select 1
       from public.health_event_documents l
       where l.event_id = p_event_id and l.document_id = a.id
     );
$$;

create function public.link_event_document(p_event_id uuid, p_document_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  linked public.attachments;
begin
  insert into public.health_event_documents(
    owner_id, profile_id, event_id, source_event_id, document_id
  )
  select target.owner_id, target.profile_id, target.id, source.id, attachment.id
  from public.health_events target
  join public.attachments attachment on attachment.id = p_document_id
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
  join public.attachments attachment on attachment.id = p_document_id
  join public.health_events source
    on source.id = attachment.health_event_id
   and source.owner_id = target.owner_id
   and source.profile_id = target.profile_id
  join public.health_event_tags source_tags on source_tags.event_id = source.id
  where target.id = p_event_id
    and target.owner_id = (select auth.uid())
  on conflict(event_id, tag_id) do nothing;

  select a.* into linked
  from public.attachments a
  where a.id = p_document_id
    and (
      a.health_event_id = p_event_id
      or exists (
        select 1 from public.health_event_documents l
        where l.event_id = p_event_id and l.document_id = a.id
      )
    );
  if linked.id is null then
    return null;
  end if;
  return to_jsonb(linked) - 'owner_id';
end;
$$;

revoke all on function public.event_documents(uuid), public.link_event_document(uuid, uuid)
  from public, anon;
grant execute on function public.event_documents(uuid), public.link_event_document(uuid, uuid)
  to authenticated;

commit;
