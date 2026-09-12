begin;

-- One Auth account owns one private application workspace, with two people
-- represented by profiles. Approval is administrator-managed, never self-service.
create table public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  avatar text, -- Reserved private Storage object path; no public URL or uploads yet.
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);

create table public.health_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
  profile_id uuid not null,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 100),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  description text not null default '',
  event_date timestamptz not null,
  end_date timestamptz,
  symptoms text,
  diagnosis text,
  treatment text,
  prescription text,
  doctor text,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, profile_id) references public.profiles(owner_id, id) on delete cascade,
  check (end_date is null or end_date >= event_date)
);

-- Labels are workspace-owned, rather than global names that could leak data.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100)
);
create unique index categories_owner_name_idx on public.categories (owner_id, lower(btrim(name)));

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  unique (owner_id, id)
);
create unique index tags_owner_name_idx on public.tags (owner_id, lower(btrim(name)));

create table public.health_event_tags (
  event_id uuid not null,
  tag_id uuid not null,
  owner_id uuid not null default auth.uid() references public.app_users(user_id) on delete cascade,
  primary key (event_id, tag_id),
  foreign key (owner_id, event_id) references public.health_events(owner_id, id) on delete cascade,
  foreign key (owner_id, tag_id) references public.tags(owner_id, id) on delete cascade
);

create index health_events_profile_date_idx on public.health_events(owner_id, profile_id, event_date desc);
create index health_events_owner_date_idx on public.health_events(owner_id, event_date desc);
create index health_events_owner_type_idx on public.health_events(owner_id, event_type);
create index health_event_tags_owner_event_idx on public.health_event_tags(owner_id, event_id);
create index health_event_tags_owner_tag_idx on public.health_event_tags(owner_id, tag_id);
-- profiles/tags composite unique indexes also cover owner filtering and cascades.

create function public.set_health_event_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_health_event_updated_at() from public, anon, authenticated;
create trigger health_events_updated_at before update on public.health_events
for each row execute function public.set_health_event_updated_at();

create function public.create_default_health_profiles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(owner_id, name)
  values (new.user_id, 'Profile 1'), (new.user_id, 'Profile 2');
  return new;
end;
$$;
revoke all on function public.create_default_health_profiles() from public, anon, authenticated;
create trigger app_user_default_profiles after insert on public.app_users
for each row execute function public.create_default_health_profiles();

alter table public.app_users enable row level security;
create policy app_users_read_own on public.app_users for select to authenticated
using (user_id = (select auth.uid()) and enabled);
revoke all on public.app_users from public, anon, authenticated;
grant select on public.app_users to authenticated;

-- WITH CHECK protects inserts and resulting updates (including owner changes).
-- Membership is checked in the database as well as in Express; direct calls to
-- the Supabase Data API cannot bypass disabled/unapproved account restrictions.
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'health_events', 'categories', 'tags', 'health_event_tags'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy workspace_owner_access on public.%I for all to authenticated
       using (owner_id = (select auth.uid()) and exists (select 1 from public.app_users where user_id = (select auth.uid()) and enabled))
       with check (owner_id = (select auth.uid()) and exists (select 1 from public.app_users where user_id = (select auth.uid()) and enabled))',
      table_name
    );
  end loop;
end;
$$;

commit;
