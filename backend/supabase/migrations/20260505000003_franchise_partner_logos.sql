-- =============================================================================
-- ADD partner_logos COLUMN TO franchises
-- =============================================================================
-- The paper invoice has co-brand logos in the top-right (Godrej, smart care
-- in the M.R. case). Persist them per franchise so the editor + PDF render
-- the right partners without hardcoding.
--
-- Format: jsonb array of { name: string, url: string }.
-- =============================================================================

alter table public.franchises
  add column if not exists partner_logos jsonb not null default '[]'::jsonb;

comment on column public.franchises.partner_logos is
  'Co-brand logos shown in the invoice header. jsonb array of {name,url}. Editable by franchise admin.';

-- Backfill the seeded M.R. franchise with the bundled SVGs and its own logo.
update public.franchises
   set logo_url = '/logos/mr.svg',
       partner_logos = '[{"name":"Godrej","url":"/logos/godrej.png"}]'::jsonb
 where slug = 'godrej';
