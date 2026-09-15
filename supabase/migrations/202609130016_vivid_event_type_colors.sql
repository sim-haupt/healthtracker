begin;

-- Refresh only the default palette. User-selected colors remain unchanged.
update public.event_types e set color=t.color from (values
 ('Doctor Visit','#91B5E4','#6EA8E6'),
 ('Illness','#C2A0E0','#B584DB'),
 ('Medication','#A5A2E2','#8E88DE'),
 ('Vaccination','#80AAB0','#4D8790'),
 ('Examination / Test','#8CC6D4','#63B1C5'),
 ('Injury','#92A7DE','#7894DB'),
 ('Symptom','#9CCDE5','#73A1A8'),
 ('Other','#B8A9DF','#9C87D6')
) t(key,old_color,color) where e.key=t.key and lower(e.color)=lower(t.old_color);

create or replace function public.seed_event_types() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.event_types(owner_id,key,name,color)
 select new.user_id,t.key,t.key,t.color from (values
 ('Doctor Visit','#6EA8E6'),
 ('Illness','#B584DB'),
 ('Medication','#8E88DE'),
 ('Vaccination','#4D8790'),
 ('Examination / Test','#63B1C5'),
 ('Injury','#7894DB'),
 ('Symptom','#73A1A8'),
 ('Other','#9C87D6')
 ) t(key,color);
 return new;
end;$$;

revoke all on function public.seed_event_types() from public,anon,authenticated;

commit;
