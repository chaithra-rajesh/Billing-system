/**
 * Updates one `user_franchise_roles` row — change role and/or
 * activate/deactivate the membership. Per-franchise activation is the way
 * franchise admins remove a user from their franchise without affecting the
 * user's other memberships or their global account.
 *
 * Goes through the user-scoped client so the migration's RLS policies
 * enforce: super_admin OR franchise_admin of the row's franchise.
 *
 * Body: { ufr_id, role?, is_active? }   (must include at least one)
 * Response: { membership: { id, role, is_active } }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';

const ROLES = ['franchise_admin', 'billing_user', 'system_user'] as const;

serveJson(async ({ sb, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const ufr_id = v.field('ufr_id', input.ufr_id, check.uuid({ required: true }));
  const role = 'role' in input
    ? v.field('role', input.role, check.enum(ROLES))
    : undefined;
  const is_active = typeof input.is_active === 'boolean' ? input.is_active : undefined;

  return v.done(async () => {
    if (role === undefined && is_active === undefined) {
      throw Err.badRequest('no_changes', 'Send role and/or is_active');
    }

    const updates: Record<string, unknown> = {};
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await sb
      .from('user_franchise_roles')
      .update(updates)
      .eq('id', ufr_id!)
      .select('id, role, is_active')
      .maybeSingle();

    if (error) {
      if (error.code === '42501' || /row-level security/i.test(error.message)) {
        throw Err.forbidden('Not allowed to edit this membership');
      }
      throw Err.internal(error.message);
    }
    if (!data) throw Err.notFound('Membership not found');

    return { data: { membership: data } };
  });
});
