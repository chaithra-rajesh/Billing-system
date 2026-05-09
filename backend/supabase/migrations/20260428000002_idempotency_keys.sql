-- =============================================================================
-- IDEMPOTENCY KEYS
-- =============================================================================
-- Edge functions that mutate money MUST accept an Idempotency-Key header.
-- This table stores the cached response for each (user, key, fingerprint)
-- so that retries within a window return the original response instead of
-- creating duplicate invoices / payments.
--
-- Lifetime: 24 hours. A daily cron in Supabase scheduled functions cleans up.
-- =============================================================================

create table public.idempotency_keys (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  key             text not null,                  -- the Idempotency-Key header value
  fingerprint     text not null,                  -- sha256 of (function_name || canonical_body)
  status_code     int  not null,
  response_body   jsonb not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  unique (user_id, key)
);

create index idx_idem_expires on public.idempotency_keys(expires_at);

alter table public.idempotency_keys enable row level security;

-- No client ever reads or writes this table directly. Edge functions use the
-- service role to bypass RLS for idempotency lookups. We still enable RLS
-- with no policies so any accidental anon-key access is denied by default.

comment on table  public.idempotency_keys             is 'Cached responses for retried mutations. Keyed by (user_id, key). 24-hour TTL.';
comment on column public.idempotency_keys.fingerprint is 'sha256 of function_name + canonical request body. Detects key reuse with different payloads.';

-- Cleanup helper — call from a scheduled function or manually.
create or replace function public.purge_expired_idempotency_keys()
returns int language plpgsql security definer as $$
declare
  v_count int;
begin
  delete from public.idempotency_keys where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.purge_expired_idempotency_keys is
  'Deletes expired idempotency keys. Call from Supabase scheduled function daily.';
