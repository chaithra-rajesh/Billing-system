/**
 * Lists invoices for a franchise. Used by the invoice list page.
 *
 * Body:  { franchise_id: uuid, status?: 'draft'|'finalised'|'cancelled', limit?: number, offset?: number }
 * Response: { invoices: [...], total, limit, offset }
 *
 * `total` is the row count after filters but before limit/offset — clients
 * use it to render Prev/Next and "X of N" without a second round-trip. The
 * limit/offset echo helps clients render correct page numbers when they fall
 * back to the server defaults.
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';

const STATUSES = ['draft', 'finalised', 'cancelled'] as const;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

serveJson(async ({ sb, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;
  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));
  const status = v.field('status', input.status, (val) => {
    if (val === undefined || val === null || val === '') return '' as string;
    return check.enum(STATUSES)(val);
  });
  const limit = v.field(
    'limit',
    input.limit ?? DEFAULT_LIMIT,
    check.number({ integer: true, min: 1, max: MAX_LIMIT }),
  );
  const offset = v.field('offset', input.offset ?? 0, check.number({ integer: true, min: 0 }));

  return v.done(async () => {
    const lim = limit ?? DEFAULT_LIMIT;
    const off = offset ?? 0;
    let query = sb
      .from('invoices')
      .select(
        'id, invoice_no, invoice_date, status, grand_total, created_at, customer:customers(id, name, gstin)',
        { count: 'exact' },
      )
      .eq('franchise_id', franchise_id!)
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1);

    if (status && status !== '') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;
    if (error) throw Err.internal(error.message);
    return {
      data: {
        invoices: data ?? [],
        total: count ?? 0,
        limit: lim,
        offset: off,
      },
    };
  });
});
