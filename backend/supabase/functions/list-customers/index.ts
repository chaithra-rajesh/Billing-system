/**
 * Lists customers for a franchise. RLS gates access, so we only need to pass
 * the franchise filter — Supabase will refuse to return rows for franchises
 * the caller can't see.
 *
 * Body: { franchise_id: uuid, search?: string, limit?: number, offset?: number }
 * Response: { customers: [...], total, limit, offset }
 *
 * Pagination follows the standard shape used by every list-* function in this
 * project: `total` is the count after filters but before limit/offset, so the
 * caller can render "X-Y of Z" and Prev/Next without a second round-trip.
 * The typeahead in the invoice editor passes a tiny limit (5) and ignores
 * `total`; the customers admin page uses limit + offset to page through.
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

serveJson(async ({ sb, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;
  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));
  const search = v.field('search', input.search, check.string({ max: 200 }));
  const limit = v.field(
    'limit',
    input.limit ?? DEFAULT_LIMIT,
    check.number({ min: 1, max: MAX_LIMIT, integer: true }),
  );
  const offset = v.field(
    'offset',
    input.offset ?? 0,
    check.number({ min: 0, integer: true }),
  );

  return v.done(async () => {
    const lim = limit ?? DEFAULT_LIMIT;
    const off = offset ?? 0;
    let query = sb
      .from('customers')
      .select(
        'id, name, gstin, address, phone, alternate_phone, state, state_code, created_at',
        { count: 'exact' },
      )
      .eq('franchise_id', franchise_id!)
      .order('name')
      .range(off, off + lim - 1);

    if (search && search.length > 0) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw Err.internal(error.message);
    return {
      data: {
        customers: data ?? [],
        total: count ?? 0,
        limit: lim,
        offset: off,
      },
    };
  });
});
