begin;

create function public.set_health_episode_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := case when new.end_date is null then 'active' else 'resolved' end;
  return new;
end;
$$;

revoke all on function public.set_health_episode_status() from public, anon, authenticated;

create trigger health_episode_automatic_status
before insert or update on public.health_episodes
for each row execute function public.set_health_episode_status();

update public.health_episodes
set status = case when end_date is null then 'active' else 'resolved' end;

commit;
