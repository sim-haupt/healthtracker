begin;

-- Keep custom choices intact while bringing the default green event color
-- into the application theme's #005461 tint scale.
update public.event_types
set color = '#80AAB0'
where key = 'Vaccination'
  and lower(color) = lower('#8EC7AD');

create or replace function public.seed_event_types() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.event_types(owner_id,key,name,color)
 select new.user_id,t.key,t.key,t.color from (values
 ('Doctor Visit','#91B5E4'),
 ('Illness','#C2A0E0'),
 ('Medication','#A5A2E2'),
 ('Vaccination','#80AAB0'),
 ('Examination / Test','#8CC6D4'),
 ('Injury','#92A7DE'),
 ('Symptom','#9CCDE5'),
 ('Other','#B8A9DF')
 ) t(key,color);
 return new;
end;$$;

revoke all on function public.seed_event_types() from public,anon,authenticated;

commit;
