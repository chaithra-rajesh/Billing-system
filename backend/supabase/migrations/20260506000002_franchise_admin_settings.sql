-- =============================================================================
-- FRANCHISE-ADMIN SETTINGS — RLS, helpers, storage bucket, bank upsert RPC
-- =============================================================================
-- Lets franchise_admins (in addition to super_admins) edit their own
-- franchise: GSTIN, name, address, contact, state, invoice terms, and the
-- logo / signature / partner-logo URLs. Adds a public-read Supabase Storage
-- bucket `franchise-assets` so logos / signatures uploaded from the admin UI
-- can be served back to the invoice printable. Adds an atomic
-- `upsert_bank_details(...)` RPC so swapping the active bank record never
-- leaves a franchise without one.
-- =============================================================================


-- ── helper: is_franchise_admin(p_franchise_id) ────────────────────────────────
-- Returns true if the current auth user has the franchise_admin role for the
-- given franchise. Joins through public.users.auth_user_id (since
-- user_franchise_roles.user_id references public.users.id, NOT auth.users.id
-- — see migration 20260505000002).
create or replace function public.is_franchise_admin(p_franchise_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from   public.user_franchise_roles ufr
    join   public.users u on u.id = ufr.user_id
    where  u.auth_user_id  = auth.uid()
    and    ufr.franchise_id = p_franchise_id
    and    ufr.role         = 'franchise_admin'
    and    ufr.is_active    = true
  );
$$;


-- ── franchises_update: allow franchise_admins ─────────────────────────────────
drop policy if exists "franchises_update" on public.franchises;
create policy "franchises_update" on public.franchises for update
  using (
    public.is_super_admin()
    or public.is_franchise_admin(franchises.id)
  );


-- ── upsert_bank_details: atomic deactivate + insert ───────────────────────────
-- Schema rule: only one is_active=true row per franchise. This RPC enforces
-- that in a single statement so the franchise is never left with zero (or
-- two) active rows. Old rows are kept inactive for the audit trail.
create or replace function public.upsert_bank_details(
  p_franchise_id uuid,
  p_bank_name    text,
  p_account_no   text,
  p_ifsc         text,
  p_branch       text
) returns jsonb language plpgsql security definer as $$
declare
  v_new_id uuid;
  v_result jsonb;
begin
  if not (public.is_super_admin() or public.is_franchise_admin(p_franchise_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.bank_details
     set is_active  = false,
         updated_at = now()
   where franchise_id = p_franchise_id
     and is_active    = true;

  insert into public.bank_details
    (franchise_id, bank_name, account_no, ifsc, branch, is_active)
  values
    (p_franchise_id, p_bank_name, p_account_no, p_ifsc, p_branch, true)
  returning id into v_new_id;

  select to_jsonb(b) into v_result
    from public.bank_details b
   where b.id = v_new_id;

  return v_result;
end;
$$;

comment on function public.upsert_bank_details is
  'Atomically deactivates the current active bank_details row for a franchise '
  'and inserts a new active one. Authorized for super_admin or franchise_admin.';


-- ── storage bucket + policies for franchise-assets ────────────────────────────
-- Public-read because invoice printables need to render the logo / signature
-- without auth (e.g. when a customer prints a saved PDF). Writes are gated to
-- super_admin or franchise_admin and the object MUST live under {franchise_id}/...
-- so a franchise admin can never overwrite another franchise's assets.
insert into storage.buckets (id, name, public)
values ('franchise-assets', 'franchise-assets', true)
on conflict (id) do nothing;

drop policy if exists "franchise_assets_read"   on storage.objects;
drop policy if exists "franchise_assets_insert" on storage.objects;
drop policy if exists "franchise_assets_update" on storage.objects;
drop policy if exists "franchise_assets_delete" on storage.objects;

create policy "franchise_assets_read" on storage.objects for select
  using ( bucket_id = 'franchise-assets' );

create policy "franchise_assets_insert" on storage.objects for insert
  with check (
    bucket_id = 'franchise-assets'
    and (
      public.is_super_admin()
      or public.is_franchise_admin( ((storage.foldername(name))[1])::uuid )
    )
  );

create policy "franchise_assets_update" on storage.objects for update
  using (
    bucket_id = 'franchise-assets'
    and (
      public.is_super_admin()
      or public.is_franchise_admin( ((storage.foldername(name))[1])::uuid )
    )
  );

create policy "franchise_assets_delete" on storage.objects for delete
  using (
    bucket_id = 'franchise-assets'
    and (
      public.is_super_admin()
      or public.is_franchise_admin( ((storage.foldername(name))[1])::uuid )
    )
  );
