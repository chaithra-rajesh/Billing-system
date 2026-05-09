-- =============================================================================
-- FIX RLS RECURSION ON user_franchise_roles
-- =============================================================================
-- The original policies for user_franchise_roles included an `exists (select
-- 1 from user_franchise_roles r2 where ... role = 'franchise_admin')`
-- subquery so a franchise admin could see other users' rows in their
-- franchise. Postgres applied the policy recursively when evaluating the
-- subquery and threw "infinite recursion detected in policy for relation".
--
-- The franchise-admin-sees-others branch is only relevant once we have an
-- admin UI for managing roles. Until then, drop the recursive branch and
-- restrict to "self or super_admin". When we build admin pages we will
-- re-add the branch using a `security definer` helper that bypasses RLS for
-- its own lookup, which avoids the recursion.
-- =============================================================================

drop policy if exists "ufr_select" on public.user_franchise_roles;
drop policy if exists "ufr_insert" on public.user_franchise_roles;

create policy "ufr_select" on public.user_franchise_roles for select
  using (
    public.is_super_admin()
    or user_id = auth.uid()
  );

create policy "ufr_insert" on public.user_franchise_roles for insert
  with check (
    public.is_super_admin()
  );
