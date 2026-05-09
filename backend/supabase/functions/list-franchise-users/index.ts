/**
 * Lists every user assigned to a franchise (active or inactive). Each row
 * carries the user identity AND the membership-level metadata so the UI can
 * show role, granted_at, and per-franchise active state in one render.
 *
 * Authorized for super_admin or franchise_admin of the target franchise.
 *
 * Body: { franchise_id }
 * Response: { users: [{ ufr_id, role, ufr_active, granted_at,
 *                       id, email, full_name, user_active }] }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { serviceClient } from '../_shared/supabase-client.ts';

interface RowFromDb {
  id: string;
  role: string;
  is_active: boolean;
  granted_at: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
  } | null;
}

serveJson(async ({ user, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;
  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));

  return v.done(async () => {
    const admin = serviceClient();

    if (!user.isSuperAdmin) {
      const { data: r, error: rErr } = await admin
        .from('user_franchise_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('franchise_id', franchise_id!)
        .eq('is_active', true)
        .maybeSingle();
      if (rErr) throw Err.internal(rErr.message);
      if (!r || r.role !== 'franchise_admin') {
        throw Err.forbidden('Only super_admin or franchise_admin can list users');
      }
    }

    // PostgREST needs the FK constraint name to disambiguate:
    // user_franchise_roles has TWO fkeys back to public.users (`user_id`
    // and `granted_by`). The FK column hint (`!user_id`) works on newer
    // PostgREST versions; the auto-generated constraint name
    // `user_franchise_roles_user_id_fkey` works on every version.
    const { data, error } = await admin
      .from('user_franchise_roles')
      .select(
        'id, role, is_active, granted_at, user:users!user_franchise_roles_user_id_fkey(id, email, full_name, is_active)',
      )
      .eq('franchise_id', franchise_id!)
      .order('granted_at', { ascending: false });
    if (error) throw Err.internal(error.message);

    const users = ((data ?? []) as unknown as RowFromDb[])
      .filter((row) => row.user !== null)
      .map((row) => ({
        ufr_id: row.id,
        role: row.role,
        ufr_active: row.is_active,
        granted_at: row.granted_at,
        id: row.user!.id,
        email: row.user!.email,
        full_name: row.user!.full_name,
        user_active: row.user!.is_active,
      }));

    return { data: { users } };
  });
});
