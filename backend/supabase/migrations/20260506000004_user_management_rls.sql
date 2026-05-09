-- =============================================================================
-- USER MANAGEMENT RLS — let franchise_admins manage their members
-- =============================================================================
-- Until now, only super_admins could insert/update/delete user_franchise_roles
-- rows (the original "ufr_select also lets franchise admins see peers" branch
-- had a recursion issue and was dropped in 20260505000001). With the
-- `is_franchise_admin(uuid)` security-definer helper from 20260506000002 we
-- can re-add that branch without recursion, and let franchise_admins manage
-- the ufr rows scoped to their own franchise(s).
--
-- Also fixes a latent bug in `ufr_select`: the original `user_id = auth.uid()`
-- comparison stopped working when public.users.id was decoupled from
-- auth.users.id (migration 20260505000002). Replaced with the proper
-- auth_user_id join.
--
-- The global `users.is_active` flag remains super-admin-only — disabling it
-- blocks login across all franchises, which is a privilege a single
-- franchise admin shouldn't hold. Per-franchise revocation is via
-- `user_franchise_roles.is_active = false`.
-- =============================================================================

drop policy if exists "ufr_select" on public.user_franchise_roles;
create policy "ufr_select" on public.user_franchise_roles for select
  using (
    public.is_super_admin()
    or user_id = (select id from public.users where auth_user_id = auth.uid())
    or public.is_franchise_admin(franchise_id)
  );

drop policy if exists "ufr_insert" on public.user_franchise_roles;
create policy "ufr_insert" on public.user_franchise_roles for insert
  with check (
    public.is_super_admin()
    or public.is_franchise_admin(franchise_id)
  );

drop policy if exists "ufr_update" on public.user_franchise_roles;
create policy "ufr_update" on public.user_franchise_roles for update
  using (
    public.is_super_admin()
    or public.is_franchise_admin(franchise_id)
  );

drop policy if exists "ufr_delete" on public.user_franchise_roles;
create policy "ufr_delete" on public.user_franchise_roles for delete
  using (
    public.is_super_admin()
    or public.is_franchise_admin(franchise_id)
  );
