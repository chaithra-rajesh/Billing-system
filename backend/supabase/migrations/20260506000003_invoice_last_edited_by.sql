-- =============================================================================
-- TRACK LAST INVOICE EDITOR
-- =============================================================================
-- `invoices.created_by` already records who issued the invoice. This adds a
-- companion `last_edited_by` column that's maintained by a trigger on every
-- UPDATE — so the detail page can show "edited by X at Y" for traceability
-- in addition to the full audit_logs trail.
--
-- The column stays NULL until the first edit happens, so the UI can
-- distinguish "never edited" from "edited by someone".
--
-- Trigger resolves auth.uid() (auth.users.id) to public.users.id via
-- `auth_user_id`, the same lookup the helper functions use.
-- =============================================================================

alter table public.invoices
  add column if not exists last_edited_by uuid references public.users(id) on delete set null;

comment on column public.invoices.last_edited_by is
  'public.users.id of the most recent editor. NULL = no edits since creation. '
  'Maintained by set_invoice_last_edited_by_trg on UPDATE.';

create or replace function public.set_invoice_last_edited_by()
returns trigger language plpgsql security definer as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from public.users where auth_user_id = auth.uid();
  -- Only overwrite when we have a real caller. Service-role writes (no JWT)
  -- leave the previous value alone instead of nulling it out.
  if v_user_id is not null then
    new.last_edited_by := v_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_invoice_last_edited_by_trg on public.invoices;
create trigger set_invoice_last_edited_by_trg
  before update on public.invoices
  for each row execute function public.set_invoice_last_edited_by();
