/**
 * Lists every user on the platform with the franchise memberships they hold.
 * Super-admin only — surfaces global account state (is_active,
 * is_super_admin) and the per-franchise role/active flag for each
 * user_franchise_roles row.
 *
 * Body: { limit?: number, offset?: number }   (default 100, max 500)
 * Response: {
 *   users: [{
 *     id, email, full_name, is_active, is_super_admin,
 *     memberships: [{ ufr_id, franchise_id, franchise_slug, franchise_name,
 *                     role, is_active, granted_at }]
 *   }],
 *   total
 * }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { serviceClient } from '../_shared/supabase-client.ts';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface UfrJoin {
  id: string;
  role: string;
  is_active: boolean;
  granted_at: string;
  franchise: { id: string; slug: string; name: string } | null;
}

interface UserRowFromDb {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  memberships: UfrJoin[] | null;
}

serveJson(async ({ user, body }) => {
  if (!user.isSuperAdmin) {
    throw Err.forbidden('Only super admins can list all users');
  }

  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;
  const limit = v.field(
    'limit',
    input.limit ?? DEFAULT_LIMIT,
    check.number({ integer: true, min: 1, max: MAX_LIMIT }),
  );
  const offset = v.field(
    'offset',
    input.offset ?? 0,
    check.number({ integer: true, min: 0 }),
  );

  return v.done(async () => {
    const lim = limit ?? DEFAULT_LIMIT;
    const off = offset ?? 0;
    const admin = serviceClient();

    // user_franchise_roles has two FKs back to users (`user_id` + `granted_by`),
    // so PostgREST needs an explicit hint to know which one to embed
    // through. The auto-generated FK constraint name works across every
    // PostgREST version, the column-name hint (`!user_id`) doesn't on older
    // ones — use the constraint name here too for symmetry with
    // list-franchise-users.
    const { data, error, count } = await admin
      .from('users')
      .select(
        `
          id, email, full_name, is_active, is_super_admin,
          memberships:user_franchise_roles!user_franchise_roles_user_id_fkey(
            id, role, is_active, granted_at,
            franchise:franchises(id, slug, name)
          )
        `,
        { count: 'exact' },
      )
      .order('full_name')
      .range(off, off + lim - 1);
    if (error) throw Err.internal(error.message);

    const users = ((data ?? []) as unknown as UserRowFromDb[]).map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      is_active: u.is_active,
      is_super_admin: u.is_super_admin,
      memberships: (u.memberships ?? [])
        .filter((m) => m.franchise !== null)
        .map((m) => ({
          ufr_id: m.id,
          franchise_id: m.franchise!.id,
          franchise_slug: m.franchise!.slug,
          franchise_name: m.franchise!.name,
          role: m.role as 'franchise_admin' | 'billing_user',
          is_active: m.is_active,
          granted_at: m.granted_at,
        })),
    }));

    return { data: { users, total: count ?? 0, limit: lim, offset: off } };
  });
});
