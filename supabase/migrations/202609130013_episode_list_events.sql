begin;

create function public.list_health_episodes(p_profile_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(public.episode_document(e.id) order by e.start_date desc, e.id),
    '[]'::jsonb
  )
  from public.health_episodes e
  where p_profile_id is null or e.profile_id = p_profile_id;
$$;

revoke all on function public.list_health_episodes(uuid) from public, anon;
grant execute on function public.list_health_episodes(uuid) to authenticated;

commit;
