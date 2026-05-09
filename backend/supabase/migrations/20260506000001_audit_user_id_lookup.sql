-- =============================================================================
-- FIX: audit_trigger_fn writes the public.users.id, not auth.uid()
-- =============================================================================
-- audit_logs.user_id is FK'd to public.users(id). The original trigger
-- inserted auth.uid() directly, which worked back when public.users.id
-- equalled auth.users.id. Migration 20260505000002 split those two id
-- spaces (added public.users.auth_user_id), and the trigger was never
-- updated — so any insert/update/delete by an authenticated caller now
-- fails with audit_logs_user_id_fkey.
--
-- Forward-only fix: look up the matching public.users row by auth_user_id
-- and use its id. Falls back to NULL when no app user is found (e.g. a
-- service-role write from an Edge Function executing on behalf of the
-- system); audit_logs.user_id allows null with on delete set null.
-- =============================================================================

create or replace function public.audit_trigger_fn()
returns trigger language plpgsql security definer as $$
declare
  v_record_id uuid;
  v_old       jsonb;
  v_new       jsonb;
  v_fid       uuid;
  v_user_id   uuid;
begin
  if    tg_op = 'INSERT' then v_record_id := new.id; v_new := to_jsonb(new); v_old := null;
  elsif tg_op = 'UPDATE' then v_record_id := new.id; v_new := to_jsonb(new); v_old := to_jsonb(old);
  elsif tg_op = 'DELETE' then v_record_id := old.id; v_new := null;          v_old := to_jsonb(old);
  end if;

  begin
    if    tg_op = 'DELETE' then v_fid := (v_old->>'franchise_id')::uuid;
    else                        v_fid := (v_new->>'franchise_id')::uuid;
    end if;
  exception when others then v_fid := null;
  end;

  -- Map JWT subject → public.users.id. NULL when the caller has no app row.
  select id into v_user_id from public.users where auth_user_id = auth.uid();

  insert into public.audit_logs
    (user_id, franchise_id, action, table_name, record_id, old_data, new_data)
  values
    (v_user_id, v_fid, tg_op, tg_table_name, v_record_id, v_old, v_new);

  return coalesce(new, old);
end;
$$;
