begin;
-- Refresh only untouched defaults; preserve user-selected colors.
update public.event_types e set color=t.color from (values
 ('Doctor Visit','#005461','#91B5E4'),
 ('Illness','#0C7779','#DCA2B2'),
 ('Medication','#249E94','#B4A0D8'),
 ('Vaccination','#3BC1A8','#8EC7AD'),
 ('Examination / Test','#357A86','#8CC6D4'),
 ('Injury','#4E9191','#E3AD8F'),
 ('Symptom','#70AAA3','#D8BD79'),
 ('Other','#91C5BA','#B0ADC9')
) t(key,old_color,color) where e.key=t.key and lower(e.color)=lower(t.old_color);

create or replace function public.seed_event_types() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.event_types(owner_id,key,name,color)
 select new.user_id,t.key,t.key,t.color from (values
 ('Doctor Visit','#91B5E4'),
 ('Illness','#DCA2B2'),
 ('Medication','#B4A0D8'),
 ('Vaccination','#8EC7AD'),
 ('Examination / Test','#8CC6D4'),
 ('Injury','#E3AD8F'),
 ('Symptom','#D8BD79'),
 ('Other','#B0ADC9')
 ) t(key,color);
 return new;
end;$$;
revoke all on function public.seed_event_types() from public,anon,authenticated;
commit;
