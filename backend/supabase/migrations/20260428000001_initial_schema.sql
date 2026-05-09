-- =============================================================================
-- BILLING SYSTEM — SUPABASE SQL MIGRATION
-- =============================================================================
-- Run this in Supabase SQL Editor in order.
-- Sections:
--   1. Extensions
--   2. Core tables
--   3. Indexes
--   4. Row Level Security (RLS)
--   5. Audit trigger function + per-table triggers
--   6. Helper functions (invoice_no generator, gst_config activator)
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- ── Identity & Access ─────────────────────────────────────────────────────────

create table public.users (
  id                  uuid primary key default uuid_generate_v4(),
  email               text unique not null,
  full_name           text not null,
  is_active           boolean not null default true,
  is_super_admin      boolean not null default false,
  invited_by_user_id  uuid references public.users(id) on delete set null,
  last_login_at       timestamptz,
  created_at          timestamptz not null default now()
);

comment on table  public.users                    is 'App users — mirrors Supabase auth.users. Only admin-invited accounts exist here.';
comment on column public.users.is_active          is 'Set false to block login without deleting the account.';
comment on column public.users.is_super_admin     is 'Bypasses all RLS — has full access to every franchise.';
comment on column public.users.invited_by_user_id is 'Which admin created this user.';


create table public.user_franchise_roles (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users(id) on delete cascade,
  franchise_id uuid not null,                          -- fk added after franchises table
  role         text not null check (role in ('franchise_admin', 'billing_user')),
  granted_by   uuid references public.users(id) on delete set null,
  granted_at   timestamptz not null default now(),
  is_active    boolean not null default true,
  unique (user_id, franchise_id)
);

comment on table  public.user_franchise_roles          is 'Junction table — one row per user+franchise pair. A user can hold different roles across multiple franchises.';
comment on column public.user_franchise_roles.is_active is 'False = access revoked. Row kept for audit trail.';


-- ── Franchise Core ────────────────────────────────────────────────────────────

create table public.franchises (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  slug       text not null unique,
  gstin      text not null,
  address    text,
  phone      text,
  logo_url   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

comment on table  public.franchises          is 'Master franchise list. Every billing table scopes to franchise_id.';
comment on column public.franchises.slug     is 'URL key and Supabase Storage path prefix e.g. godrej.';
comment on column public.franchises.logo_url is 'Supabase Storage public URL. Swap to change the logo on future invoices.';

-- Now we can add the deferred FK on user_franchise_roles
alter table public.user_franchise_roles
  add constraint ufr_franchise_fk
  foreign key (franchise_id) references public.franchises(id) on delete cascade;


create table public.bank_details (
  id           uuid primary key default uuid_generate_v4(),
  franchise_id uuid not null references public.franchises(id) on delete cascade,
  bank_name    text not null,
  account_no   text not null,
  ifsc         text not null,
  branch       text,
  is_active    boolean not null default true,
  updated_at   timestamptz not null default now()
);

comment on table  public.bank_details          is 'Bank details per franchise. Old invoices store a bank_snapshot jsonb so PDFs never change retroactively.';
comment on column public.bank_details.is_active is 'Only one active record per franchise at a time. Deactivate old before activating new.';


create table public.gst_config (
  id             uuid primary key default uuid_generate_v4(),
  franchise_id   uuid not null references public.franchises(id) on delete cascade,
  cgst_percent   numeric(5,2) not null,
  sgst_percent   numeric(5,2) not null,
  igst_percent   numeric(5,2) not null,
  effective_from date not null,
  is_active      boolean not null default false,
  created_at     timestamptz not null default now()
);

comment on table  public.gst_config               is 'Append-only GST rate history. Never update rows — insert a new row when rates change.';
comment on column public.gst_config.is_active      is 'True = currently active rate for this franchise. Used for quick lookup and tallying.';
comment on column public.gst_config.effective_from is 'Rate applies from this date. Used to find the correct rate for any historical invoice date.';


-- ── Billing ───────────────────────────────────────────────────────────────────

create table public.customers (
  id              uuid primary key default uuid_generate_v4(),
  franchise_id    uuid not null references public.franchises(id) on delete cascade,
  name            text not null,
  gstin           text,
  address         text,
  phone           text,
  alternate_phone text,
  state           text,
  state_code      text,
  created_at      timestamptz not null default now()
);

comment on table  public.customers               is 'Reusable customer records per franchise. Pick from list when billing to avoid retyping.';
comment on column public.customers.alternate_phone is 'Site contact — common in AC/refrigeration where billing and site contacts differ.';


create table public.invoices (
  id                uuid primary key default uuid_generate_v4(),
  franchise_id      uuid not null references public.franchises(id) on delete restrict,
  customer_id       uuid not null references public.customers(id) on delete restrict,
  created_by        uuid not null references public.users(id) on delete restrict,
  invoice_no        text not null unique,
  invoice_date      date not null default current_date,
  transport_mode    text,
  vehicle_no        text,
  place_of_supply   text,
  subtotal          numeric(12,2) not null default 0,
  cgst_amount       numeric(12,2) not null default 0,
  sgst_amount       numeric(12,2) not null default 0,
  igst_amount       numeric(12,2) not null default 0,
  grand_total       numeric(12,2) not null default 0,
  grand_total_words text,
  bank_snapshot     jsonb,
  gst_snapshot      jsonb,
  status            text not null default 'draft'
                    check (status in ('draft', 'finalised', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

comment on table  public.invoices               is 'One row per tax invoice. invoice_no auto-generated per franchise by generate_invoice_no().';
comment on column public.invoices.bank_snapshot  is 'Bank details at time of finalisation — frozen so PDF is immutable even if bank changes.';
comment on column public.invoices.gst_snapshot   is 'GST rates at time of finalisation — frozen for same reason.';
comment on column public.invoices.invoice_no     is 'Format: {SLUG}-{YYYY}-{NNNN} e.g. GOD-2025-0001. Unique per franchise, sequential.';


create table public.invoice_items (
  id          uuid primary key default uuid_generate_v4(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  product_id  uuid,                                    -- nullable: fk added when inventory module added
  sl_no       integer not null,
  particulars text not null,
  hsn_code    text,
  quantity    numeric(10,3) not null default 1,
  rate        numeric(12,2) not null,
  amount      numeric(12,2) not null,                  -- stored: quantity * rate, never computed on read
  unique (invoice_id, sl_no)
);

comment on table  public.invoice_items            is 'Line items for an invoice. amount is stored (not computed) for immutability.';
comment on column public.invoice_items.product_id  is 'Null for free-text items. Populated when inventory module is added — backward compatible.';
comment on column public.invoice_items.amount      is 'quantity * rate stored at write time. Never recalculate from rate — rate may change.';


-- ── Inventory (Future — uncomment when ready) ─────────────────────────────────
/*
create table public.products (
  id             uuid primary key default uuid_generate_v4(),
  franchise_id   uuid not null references public.franchises(id) on delete cascade,
  name           text not null,
  sku            text,
  hsn_code       text,
  unit           text,
  selling_price  numeric(12,2),
  purchase_price numeric(12,2),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.inventory (
  id                   uuid primary key default uuid_generate_v4(),
  product_id           uuid not null unique references public.products(id) on delete cascade,
  franchise_id         uuid not null references public.franchises(id) on delete cascade,
  quantity_in_stock    numeric(12,3) not null default 0,
  low_stock_alert_qty  numeric(12,3) not null default 5,
  updated_at           timestamptz not null default now()
);

create table public.stock_movements (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references public.products(id) on delete restrict,
  franchise_id    uuid not null references public.franchises(id) on delete restrict,
  reference_id    uuid,
  reference_type  text check (reference_type in ('invoice', 'purchase', 'adjustment')),
  movement_type   text not null check (movement_type in ('in', 'out')),
  quantity        numeric(12,3) not null,
  quantity_before numeric(12,3) not null,
  quantity_after  numeric(12,3) not null,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Wire up product_id FK on invoice_items when inventory is enabled
alter table public.invoice_items
  add constraint ii_product_fk
  foreign key (product_id) references public.products(id) on delete set null;
*/


-- ── Audit & Security ──────────────────────────────────────────────────────────

create table public.login_logs (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references public.users(id) on delete set null,
  ip_address     text,
  user_agent     text,
  status         text not null check (status in ('success', 'failed', 'blocked')),
  failure_reason text,
  logged_at      timestamptz not null default now()
);

comment on table public.login_logs is 'Written by Supabase Edge Function on every auth event. Cannot be bypassed by app code.';


create table public.audit_logs (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references public.users(id) on delete set null,
  franchise_id uuid references public.franchises(id) on delete set null,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name   text not null,
  record_id    uuid,
  old_data     jsonb,
  new_data     jsonb,
  ip_address   text,
  created_at   timestamptz not null default now()
);

comment on table  public.audit_logs          is 'Written by DB triggers — not app code. Every INSERT/UPDATE/DELETE on all tables.';
comment on column public.audit_logs.old_data  is 'Full row snapshot before change. Null on INSERT.';
comment on column public.audit_logs.new_data  is 'Full row snapshot after change. Null on DELETE.';


-- =============================================================================
-- 3. INDEXES
-- =============================================================================

-- users
create index idx_users_email      on public.users(email);
create index idx_users_is_active  on public.users(is_active);

-- user_franchise_roles
create index idx_ufr_user_id      on public.user_franchise_roles(user_id);
create index idx_ufr_franchise_id on public.user_franchise_roles(franchise_id);
create index idx_ufr_active       on public.user_franchise_roles(user_id, franchise_id) where is_active = true;

-- franchises
create index idx_franchises_slug  on public.franchises(slug);

-- bank_details
create index idx_bank_franchise   on public.bank_details(franchise_id) where is_active = true;

-- gst_config
create index idx_gst_franchise    on public.gst_config(franchise_id);
create index idx_gst_active       on public.gst_config(franchise_id) where is_active = true;
create index idx_gst_effective    on public.gst_config(franchise_id, effective_from desc);

-- customers
create index idx_customers_franchise on public.customers(franchise_id);
create index idx_customers_name      on public.customers(franchise_id, name);

-- invoices
create index idx_invoices_franchise  on public.invoices(franchise_id);
create index idx_invoices_customer   on public.invoices(customer_id);
create index idx_invoices_created_by on public.invoices(created_by);
create index idx_invoices_date       on public.invoices(franchise_id, invoice_date desc);
create index idx_invoices_status     on public.invoices(franchise_id, status);

-- invoice_items
create index idx_items_invoice   on public.invoice_items(invoice_id);

-- audit_logs
create index idx_audit_user      on public.audit_logs(user_id);
create index idx_audit_franchise on public.audit_logs(franchise_id);
create index idx_audit_table     on public.audit_logs(table_name, record_id);
create index idx_audit_created   on public.audit_logs(created_at desc);

-- login_logs
create index idx_login_user      on public.login_logs(user_id);
create index idx_login_logged_at on public.login_logs(logged_at desc);


-- =============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- Every table is locked down. The pattern:
--   super_admin  → sees everything
--   others       → only rows belonging to their active franchise assignments
-- =============================================================================

alter table public.users               enable row level security;
alter table public.user_franchise_roles enable row level security;
alter table public.franchises           enable row level security;
alter table public.bank_details         enable row level security;
alter table public.gst_config           enable row level security;
alter table public.customers            enable row level security;
alter table public.invoices             enable row level security;
alter table public.invoice_items        enable row level security;
alter table public.login_logs           enable row level security;
alter table public.audit_logs           enable row level security;


-- Helper: is current user a super admin?
create or replace function public.is_super_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select is_super_admin from public.users where id = auth.uid()),
    false
  );
$$;

-- Helper: franchises accessible to current user
create or replace function public.my_franchise_ids()
returns setof uuid language sql security definer stable as $$
  select franchise_id
  from   public.user_franchise_roles
  where  user_id   = auth.uid()
  and    is_active = true;
$$;


-- ── users ─────────────────────────────────────────────────────────────────────
create policy "users_select" on public.users for select
  using ( public.is_super_admin() or id = auth.uid() );

create policy "users_insert" on public.users for insert
  with check ( public.is_super_admin() );

create policy "users_update" on public.users for update
  using ( public.is_super_admin() or id = auth.uid() );

create policy "users_delete" on public.users for delete
  using ( public.is_super_admin() );


-- ── user_franchise_roles ──────────────────────────────────────────────────────
create policy "ufr_select" on public.user_franchise_roles for select
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or exists (
      select 1 from public.user_franchise_roles r2
      where  r2.user_id      = auth.uid()
      and    r2.franchise_id = user_franchise_roles.franchise_id
      and    r2.role         = 'franchise_admin'
      and    r2.is_active    = true
    )
  );

create policy "ufr_insert" on public.user_franchise_roles for insert
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.user_franchise_roles r2
      where  r2.user_id      = auth.uid()
      and    r2.franchise_id = user_franchise_roles.franchise_id
      and    r2.role         = 'franchise_admin'
      and    r2.is_active    = true
    )
  );

create policy "ufr_update" on public.user_franchise_roles for update
  using ( public.is_super_admin() );

create policy "ufr_delete" on public.user_franchise_roles for delete
  using ( public.is_super_admin() );


-- ── franchises ────────────────────────────────────────────────────────────────
create policy "franchises_select" on public.franchises for select
  using ( public.is_super_admin() or id in (select public.my_franchise_ids()) );

create policy "franchises_insert" on public.franchises for insert
  with check ( public.is_super_admin() );

create policy "franchises_update" on public.franchises for update
  using ( public.is_super_admin() );

create policy "franchises_delete" on public.franchises for delete
  using ( public.is_super_admin() );


-- ── Reusable franchise-scoped policy macro (bank_details, gst_config, customers) ──
-- bank_details
create policy "bank_select" on public.bank_details for select
  using ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );
create policy "bank_insert" on public.bank_details for insert
  with check ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );
create policy "bank_update" on public.bank_details for update
  using ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );
create policy "bank_delete" on public.bank_details for delete
  using ( public.is_super_admin() );

-- gst_config
create policy "gst_select" on public.gst_config for select
  using ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );
create policy "gst_insert" on public.gst_config for insert
  with check ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );
create policy "gst_update" on public.gst_config for update
  using ( public.is_super_admin() );
create policy "gst_delete" on public.gst_config for delete
  using ( public.is_super_admin() );

-- customers
create policy "customers_select" on public.customers for select
  using ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );
create policy "customers_insert" on public.customers for insert
  with check ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );
create policy "customers_update" on public.customers for update
  using ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );
create policy "customers_delete" on public.customers for delete
  using ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );


-- ── invoices ──────────────────────────────────────────────────────────────────
create policy "invoices_select" on public.invoices for select
  using ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );

create policy "invoices_insert" on public.invoices for insert
  with check ( public.is_super_admin() or franchise_id in (select public.my_franchise_ids()) );

create policy "invoices_update" on public.invoices for update
  using (
    public.is_super_admin()
    or (
      franchise_id in (select public.my_franchise_ids())
      and status = 'draft'          -- billing_user can only edit drafts
    )
  );

create policy "invoices_delete" on public.invoices for delete
  using ( public.is_super_admin() );


-- ── invoice_items ─────────────────────────────────────────────────────────────
create policy "items_select" on public.invoice_items for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.invoices i
      where  i.id           = invoice_items.invoice_id
      and    i.franchise_id in (select public.my_franchise_ids())
    )
  );

create policy "items_insert" on public.invoice_items for insert
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.invoices i
      where  i.id           = invoice_items.invoice_id
      and    i.franchise_id in (select public.my_franchise_ids())
      and    i.status       = 'draft'
    )
  );

create policy "items_update" on public.invoice_items for update
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.invoices i
      where  i.id           = invoice_items.invoice_id
      and    i.franchise_id in (select public.my_franchise_ids())
      and    i.status       = 'draft'
    )
  );

create policy "items_delete" on public.invoice_items for delete
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.invoices i
      where  i.id           = invoice_items.invoice_id
      and    i.franchise_id in (select public.my_franchise_ids())
      and    i.status       = 'draft'
    )
  );


-- ── login_logs / audit_logs — super_admin read-only, triggers write ───────────
create policy "login_logs_select" on public.login_logs for select
  using ( public.is_super_admin() or user_id = auth.uid() );

create policy "audit_logs_select" on public.audit_logs for select
  using (
    public.is_super_admin()
    or franchise_id in (select public.my_franchise_ids())
  );


-- =============================================================================
-- 5. AUDIT TRIGGER
-- =============================================================================

create or replace function public.audit_trigger_fn()
returns trigger language plpgsql security definer as $$
declare
  v_record_id  uuid;
  v_old        jsonb;
  v_new        jsonb;
  v_fid        uuid;
begin
  if    tg_op = 'INSERT' then v_record_id := new.id; v_new := to_jsonb(new); v_old := null;
  elsif tg_op = 'UPDATE' then v_record_id := new.id; v_new := to_jsonb(new); v_old := to_jsonb(old);
  elsif tg_op = 'DELETE' then v_record_id := old.id; v_new := null;          v_old := to_jsonb(old);
  end if;

  -- pull franchise_id from the row if the column exists
  begin
    if    tg_op = 'DELETE' then v_fid := (v_old->>'franchise_id')::uuid;
    else                        v_fid := (v_new->>'franchise_id')::uuid;
    end if;
  exception when others then v_fid := null;
  end;

  insert into public.audit_logs
    (user_id, franchise_id, action, table_name, record_id, old_data, new_data)
  values
    (auth.uid(), v_fid, tg_op, tg_table_name, v_record_id, v_old, v_new);

  return coalesce(new, old);
end;
$$;


-- Attach trigger to every audited table
do $$
declare
  t text;
begin
  foreach t in array array[
    'users','user_franchise_roles','franchises',
    'bank_details','gst_config','customers',
    'invoices','invoice_items'
  ] loop
    execute format(
      'create trigger audit_%I
       after insert or update or delete on public.%I
       for each row execute function public.audit_trigger_fn()',
      t, t
    );
  end loop;
end;
$$;


-- updated_at auto-maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger set_updated_at_franchises
  before update on public.franchises
  for each row execute function public.set_updated_at();

create trigger set_updated_at_invoices
  before update on public.invoices
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 6. HELPER FUNCTIONS
-- =============================================================================

-- ── Invoice number generator ──────────────────────────────────────────────────
-- Usage: select generate_invoice_no('franchise-uuid-here');
-- Returns: GOD-2025-0001  (slug uppercased, current year, 4-digit sequence)
-- Sequence resets per franchise per year.

create or replace function public.generate_invoice_no(p_franchise_id uuid)
returns text language plpgsql security definer as $$
declare
  v_slug   text;
  v_year   text := to_char(current_date, 'YYYY');
  v_prefix text;
  v_next   int;
begin
  select upper(slug) into v_slug
  from   public.franchises
  where  id = p_franchise_id;

  if v_slug is null then
    raise exception 'Franchise not found: %', p_franchise_id;
  end if;

  v_prefix := v_slug || '-' || v_year || '-';

  select coalesce(
    max( (regexp_match(invoice_no, v_prefix || '(\d+)$'))[1]::int ), 0
  ) + 1
  into v_next
  from public.invoices
  where franchise_id = p_franchise_id
  and   invoice_no   like v_prefix || '%';

  return v_prefix || lpad(v_next::text, 4, '0');
end;
$$;

comment on function public.generate_invoice_no is
  'Returns next invoice number for a franchise. Format: {SLUG}-{YYYY}-{NNNN}. '
  'Call inside a transaction when creating an invoice to avoid gaps.';


-- ── GST config activator ──────────────────────────────────────────────────────
-- Usage: select activate_gst_config('gst-config-uuid-here');
-- Deactivates all other rows for that franchise, activates the given one.

create or replace function public.activate_gst_config(p_id uuid)
returns void language plpgsql security definer as $$
declare
  v_franchise_id uuid;
begin
  select franchise_id into v_franchise_id
  from   public.gst_config where id = p_id;

  if v_franchise_id is null then
    raise exception 'GST config not found: %', p_id;
  end if;

  update public.gst_config
  set    is_active = false
  where  franchise_id = v_franchise_id;

  update public.gst_config
  set    is_active = true
  where  id = p_id;
end;
$$;

comment on function public.activate_gst_config is
  'Atomically deactivates all GST config rows for a franchise and activates the given one. '
  'Call from admin portal when changing rates.';


-- ── Active bank detail helper ─────────────────────────────────────────────────
create or replace function public.get_active_bank(p_franchise_id uuid)
returns jsonb language sql security definer stable as $$
  select to_jsonb(b)
  from   public.bank_details b
  where  franchise_id = p_franchise_id
  and    is_active    = true
  limit  1;
$$;


-- ── Active GST config helper ──────────────────────────────────────────────────
create or replace function public.get_active_gst(p_franchise_id uuid)
returns jsonb language sql security definer stable as $$
  select to_jsonb(g)
  from   public.gst_config g
  where  franchise_id = p_franchise_id
  and    is_active    = true
  limit  1;
$$;


-- =============================================================================
-- DONE
-- =============================================================================
-- Next steps:
--   1. Enable Supabase Auth (email provider, invite-only — disable signups)
--   2. Create an Edge Function to sync auth.users → public.users on invite accept
--   3. Create an Edge Function to write login_logs on auth sign-in/sign-out events
--   4. Seed: insert your first super_admin user, then your 3 franchises
-- =============================================================================
