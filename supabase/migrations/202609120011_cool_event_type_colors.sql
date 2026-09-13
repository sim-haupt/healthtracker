begin;
-- Preserve custom colors while updating the default palette.
update public.event_types e set color=t.color from (values
 ('Doctor Visit','#91B5E4','#91B5E4'),
 ('Illness','#DCA2B2','#C2A0E0'),
 ('Medication','#B4A0D8','#A5A2E2'),
 ('Vaccination','#8EC7AD','#8EC7AD'),
 ('Examination / Test','#8CC6D4','#8CC6D4'),
 ('Injury','#E3AD8F','#92A7DE'),
 ('Symptom','#D8BD79','#9CCDE5'),
 ('Other','#B0ADC9','#B8A9DF')
) t(key,old_color,color) where e.key=t.key and lower(e.color)=lower(t.old_color);

create or replace function public.seed_event_types() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.event_types(owner_id,key,name,color)
 select new.user_id,t.key,t.key,t.color from (values
 ('Doctor Visit','#91B5E4'),
 ('Illness','#C2A0E0'),
 ('Medication','#A5A2E2'),
 ('Vaccination','#8EC7AD'),
 ('Examination / Test','#8CC6D4'),
 ('Injury','#92A7DE'),
 ('Symptom','#9CCDE5'),
 ('Other','#B8A9DF')
 ) t(key,color);
 return new;
end;$$;
revoke all on function public.seed_event_types() from public,anon,authenticated;
commit;
