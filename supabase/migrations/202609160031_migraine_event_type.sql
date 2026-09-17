begin;

insert into public.event_types(owner_id,key,name,color)
select u.user_id,'Migraine','Migraine','#8B5CF6'
from public.app_users u
where not exists (
  select 1
  from public.event_types e
  where e.owner_id = u.user_id
    and e.key = 'Migraine'
);

create or replace function public.seed_event_types() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.event_types(owner_id,key,name,color)
 select new.user_id,t.key,t.key,t.color from (values
 ('Doctor Visit','#2F80ED'),
 ('Illness','#A855F7'),
 ('Medication','#7C3AED'),
 ('Vaccination','#06B6D4'),
 ('Examination / Test','#0EA5E9'),
 ('Injury','#6366F1'),
 ('Symptom','#14B8A6'),
 ('Other','#D946EF'),
 ('Migraine','#8B5CF6')
 ) t(key,color);
 return new;
end;$$;

revoke all on function public.seed_event_types() from public,anon,authenticated;

commit;
