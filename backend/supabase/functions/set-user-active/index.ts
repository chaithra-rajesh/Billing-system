/**
 * Toggles the global `users.is_active` flag. Super-admin only because
 * disabling this flag blocks the user's login across every franchise they
 * belong to — a power that lives with the platform owner, not a single
 * franchise admin (who should use the per-membership active toggle via
 * `update-user-membership` instead).
 *
 * Body: { user_id, is_active: boolean }
 * Response: { user: { id, email, full_name, is_active } }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { serviceClient } from '../_shared/supabase-client.ts';

serveJson(async ({ user, body }) => {
  if (!user.isSuperAdmin) {
    throw Err.forbidden('Only super admins can change global account status');
  }

  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;
  const user_id = v.field('user_id', input.user_id, check.uuid({ required: true }));
  if (typeof input.is_active !== 'boolean') {
    throw Err.unprocessable('validation_failed', 'Invalid input', {
      is_active: 'must be a boolean',
    });
  }
  const is_active = input.is_active;

  return v.done(async () => {
    if (user_id === user.id && !is_active) {
      // Don't let a super-admin lock themselves out by accident.
      throw Err.badRequest('cannot_disable_self', 'You cannot disable your own account');
    }

    const admin = serviceClient();
    const { data, error } = await admin
      .from('users')
      .update({ is_active })
      .eq('id', user_id!)
      .select('id, email, full_name, is_active')
      .maybeSingle();
    if (error) throw Err.internal(error.message);
    if (!data) throw Err.notFound('User not found');

    return { data: { user: data } };
  });
});
