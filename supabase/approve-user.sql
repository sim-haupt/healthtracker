-- Run as the database administrator in Supabase SQL Editor AFTER the migration.
-- Replace the UUID with an existing Supabase Auth user's ID.
-- Approval creates exactly two defaults once; reruns preserve names and data.
-- Accounts are isolated. Each approved login owns its own pair of profiles.
insert into public.app_users(user_id)
values ('REPLACE_WITH_AUTH_USER_UUID'::uuid)
on conflict (user_id) do update set enabled = true;

-- To revoke access without deleting health information, run separately:
-- update public.app_users set enabled = false where user_id = 'USER_UUID'::uuid;
