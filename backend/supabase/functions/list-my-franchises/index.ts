/**
 * Returns the franchises the caller can access with their role for each.
 * Drives the franchise picker — single result auto-selects, multiple shows
 * the picker.
 *
 * Body: { limit?: number, offset?: number }
 * Response: { franchises: [...], total, limit, offset, is_super_admin }
 *
 * Pagination follows the same shape as the other list-* endpoints.
 * `total` reflects the count *before* limit/offset so the picker can show
 * "X of N" and Prev/Next without re-querying. Most users have one or two
 * franchises so the default limit of 50 covers the common case in a single
 * page; super-admins on multi-tenant deploys actually use the paging.
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { serviceClient } from '../_shared/supabase-client.ts';

interface FranchiseRow {
  id: string;
  slug: string;
  name: string;
  gstin: string;
  state: string | null;
  state_code: string | null;
  logo_url: string | null;
  is_active?: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

serveJson(async ({ user, body }) => {
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

    if (user.isSuperAdmin) {
      const { data, error, count } = await admin
        .from('franchises')
        .select('id, slug, name, gstin, state, state_code, logo_url', { count: 'exact' })
        .eq('is_active', true)
        .order('name')
        .range(off, off + lim - 1);
      if (error) throw Err.internal(error.message);
      return {
        data: {
          franchises: (data ?? []).map((f: FranchiseRow) => ({
            ...f,
            role: 'franchise_admin' as const,
          })),
          total: count ?? 0,
          limit: lim,
          offset: off,
          is_super_admin: true,
        },
      };
    }

    // Non-super: scope to the caller's active memberships. We can't ask
    // PostgREST to filter the joined franchise on is_active *and* count
    // accurately in one query, so we fetch the full membership set and
    // page in JS. Practical hit: a user with even 100 franchise roles is
    // ~50 KB of join rows — well within an Edge Function's budget.
    const { data, error } = await admin
      .from('user_franchise_roles')
      .select(
        'role, franchise:franchises!inner(id, slug, name, gstin, state, state_code, logo_url, is_active)',
      )
      .eq('user_id', user.id)
      .eq('is_active', true);
    if (error) throw Err.internal(error.message);

    const all = (data ?? [])
      .filter((row) => (row.franchise as unknown as FranchiseRow)?.is_active)
      .map((row) => {
        const f = row.franchise as unknown as FranchiseRow;
        return {
          id: f.id,
          slug: f.slug,
          name: f.name,
          gstin: f.gstin,
          state: f.state,
          state_code: f.state_code,
          logo_url: f.logo_url,
          role: row.role as 'franchise_admin' | 'billing_user',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      data: {
        franchises: all.slice(off, off + lim),
        total: all.length,
        limit: lim,
        offset: off,
        is_super_admin: false,
      },
    };
  });
});
