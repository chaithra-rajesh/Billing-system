-- =============================================================================
-- ADD auth_user_id COLUMN TO public.users
-- =============================================================================
-- Originally we relied on public.users.id === auth.users.id (set by the
-- on_auth_user_created trigger in migration 0004). In practice these can
-- drift — e.g. a user is inserted in public.users before auth.users exists,
-- or two paths create rows independently. Edge Functions then can't tell
-- which public.users row corresponds to the JWT-authenticated caller.
--
-- This migration adds an explicit `auth_user_id` FK so the link is always
-- unambiguous. EFs look up the caller's row via `auth_user_id = jwt.sub`.
--
-- Backfill: for every existing public.users row, find the matching
-- auth.users by email and set auth_user_id. The trigger is also updated so
-- new auth users get auth_user_id populated on insert.
-- =============================================================================

alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

-- Backfill for existing rows. Email is the join key — both sides have a
-- unique index on email.
update public.users pu
   set auth_user_id = au.id
  from auth.users au
 where au.email = pu.email
   and pu.auth_user_id is null;

create unique index if not exists users_auth_user_id_key on public.users(auth_user_id);

-- Update the auth-sync trigger so future invites populate auth_user_id.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, auth_user_id, email, full_name, is_active, is_super_admin)
  values (
    new.id,
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    true,
    false
  )
  on conflict (id) do update
    set auth_user_id = excluded.auth_user_id
  where public.users.auth_user_id is null;

  -- Also handle the case where a public.users row already exists for this
  -- email (with a different id) — link it to the auth user.
  update public.users
     set auth_user_id = new.id
   where email = new.email
     and auth_user_id is null;

  return new;
end;
$$;

-- Update RLS helpers so they look up by auth_user_id instead of id. The
-- earlier definitions assumed public.users.id === auth.users.id, which
-- doesn't hold once auth_user_id is the canonical link.

create or replace function public.is_super_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select is_super_admin from public.users where auth_user_id = auth.uid()),
    false
  );
$$;

create or replace function public.my_franchise_ids()
returns setof uuid language sql security definer stable as $$
  select ufr.franchise_id
  from   public.user_franchise_roles ufr
  join   public.users u on u.id = ufr.user_id
  where  u.auth_user_id = auth.uid()
  and    ufr.is_active  = true;
$$;

-- The users_select policy currently uses `id = auth.uid()` to let users
-- read their own row. After this migration the equivalent check is
-- `auth_user_id = auth.uid()`.

drop policy if exists "users_select" on public.users;
drop policy if exists "users_update" on public.users;

create policy "users_select" on public.users for select
  using ( public.is_super_admin() or auth_user_id = auth.uid() );

create policy "users_update" on public.users for update
  using ( public.is_super_admin() or auth_user_id = auth.uid() );
