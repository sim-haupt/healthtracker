begin;

alter table public.health_events
  add constraint health_events_owner_profile_id_unique unique (owner_id,profile_id,id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
  profile_id uuid not null,
  source_event_id uuid,
  reminder_kind text not null default 'custom' check (reminder_kind in ('custom','next_dose','renewal')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  due_date date not null,
  recurrence text not null default 'none' check (recurrence in ('none','monthly','yearly')),
  status text not null default 'scheduled' check (status in ('scheduled','completed','dismissed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id,id),
  constraint reminders_profile_fk foreign key (owner_id,profile_id)
    references public.profiles(owner_id,id) on delete cascade,
  constraint reminders_source_event_fk foreign key (owner_id,profile_id,source_event_id)
    references public.health_events(owner_id,profile_id,id) on delete cascade,
  check ((status='completed')=(completed_at is not null))
);

create index reminders_owner_profile_due_idx on public.reminders(owner_id,profile_id,due_date,id);
create index reminders_owner_status_due_idx on public.reminders(owner_id,status,due_date,id);
create index reminders_source_event_idx on public.reminders(owner_id,source_event_id);
create unique index reminders_event_derived_kind_idx
  on public.reminders(owner_id,source_event_id,reminder_kind)
  where source_event_id is not null and reminder_kind in ('next_dose','renewal');

create function public.set_reminder_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.set_reminder_updated_at() from public,anon,authenticated;
create trigger reminders_updated_at before update on public.reminders
for each row execute function public.set_reminder_updated_at();

alter table public.reminders enable row level security;
revoke all on public.reminders from public,anon,authenticated;
grant select,insert,update,delete on public.reminders to authenticated;
create policy workspace_owner_access on public.reminders for all to authenticated
using (owner_id=(select auth.uid()) and exists (
  select 1 from public.app_users where user_id=(select auth.uid()) and enabled
))
with check (owner_id=(select auth.uid()) and exists (
  select 1 from public.app_users where user_id=(select auth.uid()) and enabled
));

create function public.sync_vaccination_reminders()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  display_title text := coalesce(nullif(btrim(new.disease),''),nullif(btrim(new.title),''),'Vaccination');
begin
  if new.event_type='Vaccination' and new.next_dose_date is not null then
    insert into public.reminders(owner_id,profile_id,source_event_id,reminder_kind,title,due_date)
    values (new.owner_id,new.profile_id,new.id,'next_dose','Next dose · '||display_title,new.next_dose_date)
    on conflict (owner_id,source_event_id,reminder_kind) where source_event_id is not null and reminder_kind in ('next_dose','renewal')
    do update set profile_id=excluded.profile_id,title=excluded.title,due_date=excluded.due_date,
      status=case when public.reminders.due_date is distinct from excluded.due_date then 'scheduled' else public.reminders.status end,
      completed_at=case when public.reminders.due_date is distinct from excluded.due_date then null else public.reminders.completed_at end;
  else
    delete from public.reminders where owner_id=new.owner_id and source_event_id=new.id and reminder_kind='next_dose';
  end if;

  if new.event_type='Vaccination' and new.needs_renewal and new.renewal_date is not null then
    insert into public.reminders(owner_id,profile_id,source_event_id,reminder_kind,title,due_date)
    values (new.owner_id,new.profile_id,new.id,'renewal','Renew · '||display_title,new.renewal_date)
    on conflict (owner_id,source_event_id,reminder_kind) where source_event_id is not null and reminder_kind in ('next_dose','renewal')
    do update set profile_id=excluded.profile_id,title=excluded.title,due_date=excluded.due_date,
      status=case when public.reminders.due_date is distinct from excluded.due_date then 'scheduled' else public.reminders.status end,
      completed_at=case when public.reminders.due_date is distinct from excluded.due_date then null else public.reminders.completed_at end;
  else
    delete from public.reminders where owner_id=new.owner_id and source_event_id=new.id and reminder_kind='renewal';
  end if;
  return new;
end;
$$;
revoke all on function public.sync_vaccination_reminders() from public,anon,authenticated;
create trigger health_events_sync_vaccination_reminders
after insert or update of profile_id,event_type,title,disease,next_dose_date,needs_renewal,renewal_date
on public.health_events for each row execute function public.sync_vaccination_reminders();

-- Backfill reminders for vaccination dates that already exist.
insert into public.reminders(owner_id,profile_id,source_event_id,reminder_kind,title,due_date)
select owner_id,profile_id,id,'next_dose','Next dose · '||coalesce(nullif(btrim(disease),''),nullif(btrim(title),''),'Vaccination'),next_dose_date
from public.health_events where event_type='Vaccination' and next_dose_date is not null
on conflict do nothing;
insert into public.reminders(owner_id,profile_id,source_event_id,reminder_kind,title,due_date)
select owner_id,profile_id,id,'renewal','Renew · '||coalesce(nullif(btrim(disease),''),nullif(btrim(title),''),'Vaccination'),renewal_date
from public.health_events where event_type='Vaccination' and needs_renewal and renewal_date is not null
on conflict do nothing;

create or replace function public.health_dashboard(p_filters jsonb default '{}'::jsonb) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with filtered as materialized (select * from public.filtered_health_events(p_filters))
  select jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object(
    'profile_id',p.id,'total',(select count(*) from filtered e where e.profile_id=p.id),
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
