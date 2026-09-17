begin;

create or replace function public.sync_event_reminders(
  p_event_id uuid,
  p_reminders jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_reminders jsonb := coalesce(p_reminders, '[]'::jsonb);
begin
  if jsonb_typeof(v_reminders) <> 'array' or jsonb_array_length(v_reminders) > 20 then
    raise exception 'Invalid reminders' using errcode = '23514';
  end if;

  select profile_id into v_profile_id
  from public.health_events
  where id = p_event_id;
  if not found then return null; end if;

  delete from public.reminders r
  where r.source_event_id = p_event_id
    and r.reminder_kind = 'custom'
    and r.status = 'scheduled'
    and not exists (
      select 1
      from jsonb_to_recordset(v_reminders) as x(id uuid)
      where x.id = r.id
    );

  update public.reminders r
  set title = x.title,
      due_date = x.due_date,
      recurrence = x.recurrence,
      profile_id = v_profile_id,
      status = 'scheduled',
      completed_at = null
  from jsonb_to_recordset(v_reminders) as x(
    id uuid,
    title text,
    due_date date,
    recurrence text
  )
  where x.id = r.id
    and r.source_event_id = p_event_id
    and r.reminder_kind = 'custom'
    and r.status = 'scheduled';

  insert into public.reminders(
    profile_id,
    source_event_id,
    reminder_kind,
    title,
    due_date,
    recurrence,
    status,
    completed_at
  )
  select
    v_profile_id,
    p_event_id,
    'custom',
    x.title,
    x.due_date,
    x.recurrence,
    'scheduled',
    null
  from jsonb_to_recordset(v_reminders) as x(
    id uuid,
    title text,
    due_date date,
    recurrence text
  )
  where x.id is null
     or not exists (
       select 1
       from public.reminders r
       where r.id = x.id
         and r.source_event_id = p_event_id
         and r.reminder_kind = 'custom'
         and r.status = 'scheduled'
     );

  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.due_date, r.id), '[]'::jsonb)
    from (
      select
        id,
        profile_id,
        source_event_id,
        reminder_kind,
        title,
        due_date,
        recurrence,
        status,
        completed_at,
        created_at,
        updated_at
      from public.reminders
      where source_event_id = p_event_id
        and reminder_kind = 'custom'
        and status = 'scheduled'
    ) r
  );
end;
$$;

revoke all on function public.sync_event_reminders(uuid,jsonb) from public, anon;
grant execute on function public.sync_event_reminders(uuid,jsonb) to authenticated;

commit;
