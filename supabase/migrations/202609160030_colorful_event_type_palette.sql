begin;

-- Refresh only default palettes. User-selected colors remain unchanged.
update public.event_types e
set color = t.color
from (values
 ('Doctor Visit','#6EA8E6','#2F80ED'),
 ('Illness','#B584DB','#A855F7'),
 ('Medication','#8E88DE','#7C3AED'),
 ('Vaccination','#4D8790','#06B6D4'),
 ('Examination / Test','#63B1C5','#0EA5E9'),
 ('Injury','#7894DB','#6366F1'),
 ('Symptom','#73A1A8','#14B8A6'),
 ('Other','#9C87D6','#D946EF')
) t(key,old_color,color)
where e.key = t.key
  and lower(e.color) = lower(t.old_color);

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
 ('Other','#D946EF')
 ) t(key,color);
 return new;
end;$$;

revoke all on function public.seed_event_types() from public,anon,authenticated;

commit;
