begin;

update public.event_types e
set color = palette.color
from (values
  ('Doctor Visit', '#7A8FF5'),
  ('Illness', '#F49DBE'),
  ('Examination / Test', '#71DDE8'),
  ('Injury', '#FFAB72'),
  ('Symptom', '#94A7BC'),
  ('Other', '#B99B8A'),
  ('Migraine', '#C09AF2'),
  -- Reserved storage types used by existing records and the Vaccinations page.
  ('Medication', '#C09AF2'),
  ('Vaccination', '#71DDE8')
) palette(key, color)
where e.key = palette.key;

create or replace function public.seed_event_types() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.event_types(owner_id,key,name,color)
 select new.user_id,t.key,t.key,t.color from (values
 ('Doctor Visit','#7A8FF5'),
 ('Illness','#F49DBE'),
 ('Medication','#C09AF2'),
 ('Vaccination','#71DDE8'),
 ('Examination / Test','#71DDE8'),
 ('Injury','#FFAB72'),
 ('Symptom','#94A7BC'),
 ('Other','#B99B8A'),
 ('Migraine','#C09AF2')
 ) t(key,color);
 return new;
end;$$;

revoke all on function public.seed_event_types() from public,anon,authenticated;

commit;
