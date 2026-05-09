-- =============================================================================
-- INVOICE SNAPSHOTS — freeze franchise + customer at finalisation
-- =============================================================================
-- Per CLAUDE.md rule 3, finalised invoices must be reproducible regardless of
-- later changes to the franchise / customer / tax / bank rows. We already
-- snapshot bank, GST, and signature; this migration adds:
--
--   - franchise_snapshot — name, address, phone, GSTIN, state, state_code,
--                          logo_url, signature_url, invoice_terms, partner_logos
--   - customer_snapshot  — name, address, GSTIN, phone, state, state_code
--   - tax_mode           — 'intra' | 'inter' (so the editor's choice is recorded)
--
-- The existing gst_snapshot already stores the cgst/sgst/igst percentages
-- used for THIS invoice — including any user override done in the editor —
-- because we update create-invoice to write the editor-provided percentages
-- into gst_snapshot rather than re-reading the active gst_config.
-- =============================================================================

alter table public.invoices
  add column if not exists franchise_snapshot jsonb,
  add column if not exists customer_snapshot  jsonb,
  add column if not exists tax_mode           text check (tax_mode in ('intra', 'inter'));

comment on column public.invoices.franchise_snapshot is
  'Full franchise context at finalisation. PDF rendering uses this, not the live franchises row, so admin edits do not retroactively change old invoices.';

comment on column public.invoices.customer_snapshot is
  'Bill-to party at finalisation. Same reasoning as franchise_snapshot — customer profile edits never alter old invoices.';

comment on column public.invoices.tax_mode is
  'Whether this invoice was filed intra-state (CGST+SGST) or inter-state (IGST). Recorded so a finalised row knows which tax rows it carried.';
