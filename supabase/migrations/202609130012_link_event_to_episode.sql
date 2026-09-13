begin;

create function public.link_event_to_episode(
  p_episode_id uuid,
  p_event_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  select profile_id into v_profile_id
  from public.health_episodes
  where id = p_episode_id;
  if not found then return false; end if;

  perform 1
  from public.health_events
  where id = p_event_id and profile_id = v_profile_id;
  if not found then return false; end if;

  insert into public.health_episode_events(
    owner_id,
    profile_id,
    episode_id,
    event_id
  ) values (
    auth.uid(),
    v_profile_id,
    p_episode_id,
    p_event_id
  ) on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.link_event_to_episode(uuid, uuid) from public, anon;
grant execute on function public.link_event_to_episode(uuid, uuid) to authenticated;

commit;
