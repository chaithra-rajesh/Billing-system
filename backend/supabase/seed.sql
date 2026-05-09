-- =============================================================================
-- LOCAL DEV SEED
-- =============================================================================
-- Inserts a sample franchise, bank details, GST config, and a customer so the
-- billing flow can be exercised end-to-end without an admin UI.
--
-- This runs automatically on `supabase db reset`. Production never sees it.
--
-- Bootstrapping the first user:
--   1. In Supabase Studio (Authentication → Users → Add user) create a user
--      with email + password. Note the resulting auth.users.id.
--   2. The on_auth_user_created trigger (migration 0004) auto-inserts a
--      matching public.users row.
--   3. To grant access to the seeded franchise below, run:
--
--        update public.users set is_super_admin = true where email = '<your email>';
--
--      OR (more realistic) leave is_super_admin = false and insert a role:
--
--        insert into public.user_franchise_roles (user_id, franchise_id, role)
--        select u.id, f.id, 'franchise_admin'
--        from   public.users u, public.franchises f
--        where  u.email = '<your email>'
--        and    f.slug  = 'mr-air-con';
-- =============================================================================

-- Sample franchise modelled on the M.R. Air Conditioning paper invoice.
insert into public.franchises (id, name, slug, gstin, address, phone, state, state_code, invoice_terms, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'M.R. Air Conditioning & Refrigeration Engineering',
  'godrej',
  '29AOBPK1486M1Z1',
  'Ashwini Building, Mannagudda Main Road, Ballalbagh, Mangaluru – 575 003',
  '0824-4277295',
  'Karnataka',
  '29',
  array[
    'Payment by Crossed Cheques / Demand Draft only',
    'If not paid on due date Interest @24% will be charged',
    'Goods once sold will not be taken back.',
    'Subject to Mangaluru Jurisdiction'
  ],
  true
)
on conflict (id) do nothing;
-- Active bank details for the franchise above.
insert into public.bank_details (franchise_id, bank_name, account_no, ifsc, branch, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'State Bank of India',
  '00000000000000',
  'SBIN0000000',
  'Mangaluru Main Branch',
  true
)
on conflict do nothing;

-- Active GST config — 9% CGST + 9% SGST = 18% intra-state, 18% IGST inter-state.
insert into public.gst_config (franchise_id, cgst_percent, sgst_percent, igst_percent, effective_from, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  9.00,
  9.00,
  18.00,
  '2025-04-01',
  true
)
on conflict do nothing;

-- One sample customer (intra-state — Karnataka 29).
insert into public.customers (franchise_id, name, gstin, address, phone, state, state_code)
values (
  '11111111-1111-1111-1111-111111111111',
  'Sample Customer Pvt Ltd',
  '29AAAAA0000A1Z5',
  'Test Address, Mangaluru',
  '9000000000',
  'Karnataka',
  '29'
)
on conflict do nothing;

-- One sample customer (inter-state — Maharashtra 27) to exercise IGST routing.
insert into public.customers (franchise_id, name, gstin, address, phone, state, state_code)
values (
  '11111111-1111-1111-1111-111111111111',
  'Out Of State Buyer',
  '27BBBBB1111B2Z6',
  'Test Address, Pune',
  '9000000001',
  'Maharashtra',
  '27'
)
on conflict do nothing;
