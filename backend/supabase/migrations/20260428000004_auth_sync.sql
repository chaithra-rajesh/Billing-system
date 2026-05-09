-- =============================================================================
-- AUTH SYNC — mirror auth.users into public.users
-- =============================================================================
-- Supabase Auth manages credentials (email + password, MFA, sessions) in the
-- `auth.users` table, which we cannot extend directly. Our domain wants
-- richer user metadata (full_name, is_active, is_super_admin, invited_by_user_id),
-- which lives in `public.users`.
--
-- We need them to stay in lockstep:
--   - When auth.users gets a row (because someone accepted an invite),
--     public.users must get a matching row.
--   - When auth.users is deleted, public.users should follow.
--
-- The auth-invite-user Edge Function creates BOTH rows in a transaction at
-- invite time. This trigger is a defensive net for any auth.users row that
-- somehow appears without going through that edge function (manual SQL,
-- direct dashboard insert, etc.) — we still get a public.users row, just
-- with sensible defaults that the franchise admin can fix afterwards.
-- =============================================================================

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  -- If the edge function already created the public.users row (with the same
  -- id as auth.users), do nothing. Otherwise insert a stub so the foreign-key
  -- relationships across the app remain consistent.
  insert into public.users (id, email, full_name, is_active, is_super_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    true,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


create or replace function public.handle_deleted_auth_user()
returns trigger language plpgsql security definer as $$
begin
  delete from public.users where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_auth_user();


-- ── last_login_at maintenance ────────────────────────────────────────────────
-- Called by the auth-log-event edge function whenever a successful sign-in
-- happens. Centralises the "stamp last_login_at" rule in the database so
-- it cannot drift across callers.
create or replace function public.record_user_login(p_user_id uuid)
returns void language sql security definer as $$
  update public.users set last_login_at = now() where id = p_user_id;
$$;

comment on function public.record_user_login is
  'Stamps users.last_login_at = now(). Called by auth-log-event edge function on successful sign-in.';
