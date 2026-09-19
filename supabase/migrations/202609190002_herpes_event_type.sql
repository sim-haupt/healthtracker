begin;

insert into public.event_types(owner_id, key, name, color)
select u.user_id, 'Herpes', 'Herpes', '#F49DBE'
from public.app_users u
where not exists (
  select 1 from public.event_types e
  where e.owner_id = u.user_id and e.key = 'Herpes'
);

create or replace function public.seed_event_types() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.event_types(owner_id,key,name,color)
 select new.user_id,t.key,t.key,t.color from (values
 ('Doctor Visit','#7A8FF5'), ('Illness','#F49DBE'), ('Medication','#C09AF2'),
 ('Vaccination','#71DDE8'), ('Examination / Test','#71DDE8'), ('Injury','#FFAB72'),
 ('Symptom','#94A7BC'), ('Other','#B99B8A'), ('Migraine','#C09AF2'),
 ('Herpes','#F49DBE')
 ) t(key,color);
 return new;
end;$$;

commit;
