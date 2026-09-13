begin;
create table public.event_types (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
 key text not null default gen_random_uuid()::text,
 name text not null check(length(btrim(name)) between 1 and 100),
 color text not null check(color ~ '^#[0-9A-Fa-f]{6}$'),
 archived boolean not null default false,
 unique(owner_id,key)
);
create unique index event_types_name_idx on public.event_types(owner_id,lower(btrim(name))) where not archived;
alter table public.event_types enable row level security;
revoke all on public.event_types from public,anon,authenticated;
grant select,insert on public.event_types to authenticated;
grant update(name,color,archived) on public.event_types to authenticated;
create policy event_type_owner on public.event_types for all to authenticated
using(owner_id=(select auth.uid()) and exists(select 1 from public.app_users where user_id=(select auth.uid()) and enabled))
with check(owner_id=(select auth.uid()) and exists(select 1 from public.app_users where user_id=(select auth.uid()) and enabled));
create function public.seed_event_types() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.event_types(owner_id,key,name,color)
 select new.user_id,t.key,t.key,t.color from (values
 ('Doctor Visit','#005461'),('Illness','#0C7779'),('Medication','#249E94'),('Vaccination','#3BC1A8'),
 ('Examination / Test','#357A86'),('Injury','#4E9191'),('Symptom','#70AAA3'),('Other','#91C5BA')) t(key,color);
 return new;
end;$$;
revoke all on function public.seed_event_types() from public,anon,authenticated;
create trigger app_user_event_types after insert on public.app_users for each row execute function public.seed_event_types();
insert into public.event_types(owner_id,key,name,color)
select u.user_id,t.key,t.key,t.color from public.app_users u cross join (values
 ('Doctor Visit','#005461'),('Illness','#0C7779'),('Medication','#249E94'),('Vaccination','#3BC1A8'),
 ('Examination / Test','#357A86'),('Injury','#4E9191'),('Symptom','#70AAA3'),('Other','#91C5BA')) t(key,color);
-- Preserve any historical custom labels too.
insert into public.event_types(owner_id,key,name,color)
select distinct owner_id,event_type,event_type,'#0C7779' from public.health_events on conflict do nothing;
create function public.check_event_type() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.event_type=old.event_type and new.owner_id=old.owner_id then return new; end if;
 end if;
 perform 1 from public.event_types where owner_id=new.owner_id and key=new.event_type and not archived for share;
 if not found then raise exception 'Choose an available event type' using errcode='23514'; end if;
 return new;
end;$$;
revoke all on function public.check_event_type() from public,anon,authenticated;
create trigger check_event_type before insert or update on public.health_events for each row execute function public.check_event_type();
commit;
