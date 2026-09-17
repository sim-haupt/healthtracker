begin;

create or replace function public.health_dashboard(p_filters jsonb default '{}'::jsonb) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (select * from public.filtered_health_events(p_filters))
  select jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object(
    'profile_id',p.id,'total',(select count(*) from filtered e where e.profile_id=p.id),
    'active_episodes',coalesce((select jsonb_agg(to_jsonb(ep) order by ep.start_date desc,ep.id) from
      (select id,profile_id,title,start_date,end_date,status
       from public.health_episodes where profile_id=p.id and end_date is null
       order by start_date desc,id limit 3) ep),'[]'::jsonb),
    'reminders',coalesce((select jsonb_agg(to_jsonb(r) order by r.due_date,r.id) from
      (select id,profile_id,source_event_id,reminder_kind,title,due_date,recurrence,status
       from public.reminders where profile_id=p.id and status='scheduled'
       order by due_date,id limit 3) r),'[]'::jsonb),
    'vaccination_doses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'date',e.next_dose_date,'disease',e.disease) order by e.next_dose_date,e.id)
      from (select e.* from public.filtered_health_events(p_filters - 'date_from' - 'date_to') e
        where e.profile_id=p.id and e.event_type='Vaccination' and e.next_dose_date >= current_date
      and (nullif(p_filters->>'date_from','') is null or e.next_dose_date >= (p_filters->>'date_from')::timestamptz::date)
      and (nullif(p_filters->>'date_to','') is null or e.next_dose_date < (p_filters->>'date_to')::timestamptz::date)
        order by e.next_dose_date,e.id limit 3) e), '[]'::jsonb),
    'upcoming',coalesce((select jsonb_agg(public.health_event_summary(s::public.health_events) order by event_date,id) from
      (select * from filtered e where e.profile_id=p.id and e.event_date>=now() order by event_date,id limit 3) s),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(public.health_event_summary(s::public.health_events) order by event_date desc,id desc) from
      (select * from filtered e where e.profile_id=p.id and e.event_date<now() order by event_date desc,id desc limit 3) s),'[]'::jsonb),
    'illnesses',coalesce((select jsonb_agg(public.health_event_summary(s::public.health_events) order by event_date desc,id desc) from
      (select * from filtered e where e.profile_id=p.id and e.event_type='Illness' and e.event_date<=now() order by event_date desc,id desc limit 3) s),'[]'::jsonb),
    'visits',coalesce((select jsonb_agg(public.health_event_summary(s::public.health_events) order by event_date desc,id desc) from
      (select * from filtered e where e.profile_id=p.id and e.event_type='Doctor Visit' and e.event_date<=now() order by event_date desc,id desc limit 3) s),'[]'::jsonb)
    ) order by p.created_at,p.name,p.id) from public.profiles p
      where nullif(p_filters->>'profile_id','') is null or p.id=(p_filters->>'profile_id')::uuid),'[]'::jsonb));
$$;

commit;
