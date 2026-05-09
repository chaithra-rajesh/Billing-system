-- =============================================================================
-- ADD `system_user` ROLE
-- =============================================================================
-- Adds a third role to user_franchise_roles. Functionally equivalent to
-- `billing_user` under current RLS (both can create/edit invoices in their
-- franchises but cannot edit franchise settings or manage users), but
-- exposed as a separate label so platform owners can distinguish operational
-- staff from franchise-side billing users in reporting and audits.
--
-- Drops whatever CHECK constraint Postgres auto-generated for the role column
-- (the original schema declared `check (role in ('franchise_admin',
-- 'billing_user'))` inline, so the constraint name is implementation-defined),
-- then re-adds with the expanded enum.
-- =============================================================================

do $$
declare
  v_name text;
begin
  -- Find the existing CHECK constraint on user_franchise_roles.role.
  select conname into v_name
  from   pg_constraint
  where  conrelid = 'public.user_franchise_roles'::regclass
  and    contype  = 'c'
  and    pg_get_constraintdef(oid) ilike '%role%';
  if v_name is not null then
    execute format(
      'alter table public.user_franchise_roles drop constraint %I',
      v_name
    );
  end if;
end$$;

alter table public.user_franchise_roles
  add constraint user_franchise_roles_role_check
  check (role in ('franchise_admin', 'billing_user', 'system_user'));

comment on column public.user_franchise_roles.role is
  'franchise_admin = manages franchise + users + invoices. '
  'billing_user    = creates/edits invoices for the franchise. '
  'system_user     = same invoice perms as billing_user; separate label for ops staff.';
