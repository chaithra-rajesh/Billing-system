-- =============================================================================
-- INVOICE PDF FIELDS — gaps from the client's manual reference invoice
-- =============================================================================
-- See docs/CLIENT_REFERENCE.md for the full mapping of paper-form fields →
-- system columns. This migration adds the columns that were missing from
-- the initial schema after we cross-checked with the M.R. Air Conditioning
-- manual tax-invoice template.
--
-- All changes are additive. No data backfill needed (no rows exist yet).
-- =============================================================================

-- ── franchises ────────────────────────────────────────────────────────────────
alter table public.franchises
  add column state           text,
  add column state_code      text,
  add column signature_url   text,
  add column invoice_terms   text[] not null default array[]::text[];

comment on column public.franchises.state          is 'Issuing state — drives CGST+SGST vs IGST decision (intra-state vs inter-state).';
comment on column public.franchises.state_code     is 'GST state code (e.g. 29 for Karnataka). Printed on the invoice.';
comment on column public.franchises.signature_url  is 'Supabase Storage URL for the authorised-signatory image. Frozen on the PDF at finalization time.';
comment on column public.franchises.invoice_terms  is 'Numbered notes printed at the bottom of every invoice. One string per line. Editable by franchise admin.';

-- ── invoices ──────────────────────────────────────────────────────────────────
alter table public.invoices
  add column date_of_supply       date,
  add column ship_to_name         text,
  add column ship_to_address      text,
  add column ship_to_gstin        text,
  add column ship_to_state        text,
  add column ship_to_state_code   text;

comment on column public.invoices.date_of_supply     is 'Distinct from invoice_date — when goods/services were actually supplied.';
comment on column public.invoices.ship_to_name       is 'Ship-to block. Defaults to customer billing details if user does not override at creation time.';

-- Ship-to defaults to bill-to: not enforced at the DB layer because the user
-- can legitimately ship to a different party. The frontend pre-fills these
-- fields from the selected customer; an empty value here means "same as bill-to"
-- and the PDF renders the customer's address in the Ship-to block.

-- ── invoice signature snapshot ────────────────────────────────────────────────
-- Add a signature snapshot on invoices so the signature image used at
-- finalization is frozen, the same way bank_snapshot/gst_snapshot are.
alter table public.invoices
  add column signature_snapshot text;

comment on column public.invoices.signature_snapshot is
  'URL of the franchise signature image at the moment the invoice was finalised. Future signature swaps do not affect already-issued invoices.';
