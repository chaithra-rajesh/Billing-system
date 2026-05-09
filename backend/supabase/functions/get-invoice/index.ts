/**
 * Returns a single invoice with everything the detail page and PDF need:
 * the invoice row, its line items, customer, franchise, plus the creator
 * and (when present) the most recent editor as `{id, email, full_name}`.
 *
 * Body: { invoice_id: uuid }
 * Response: { invoice, items, customer, franchise, creator, last_editor }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { serviceClient } from '../_shared/supabase-client.ts';

serveJson(async ({ sb, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;
  const invoice_id = v.field('invoice_id', input.invoice_id, check.uuid({ required: true }));

  return v.done(async () => {
    const { data: invoice, error: invErr } = await sb
      .from('invoices')
      .select('*')
      .eq('id', invoice_id!)
      .maybeSingle();
    if (invErr) throw Err.internal(invErr.message);
    if (!invoice) throw Err.notFound('Invoice not found');

    // creator + last_editor lookups: users RLS only lets non-super-admins
    // read their own row, so for cross-user lookups we need the service
    // client. This is read-only, scoped to the two ids on the invoice, so
    // RLS bypass is safe.
    const admin = serviceClient();
    const userIds = Array.from(
      new Set([invoice.created_by, invoice.last_edited_by].filter(Boolean) as string[]),
    );

    const [itemsRes, customerRes, franchiseRes, usersRes] = await Promise.all([
      sb
        .from('invoice_items')
        .select('id, sl_no, particulars, hsn_code, quantity, rate, amount')
        .eq('invoice_id', invoice_id!)
        .order('sl_no'),
      sb.from('customers').select('*').eq('id', invoice.customer_id).maybeSingle(),
      sb.from('franchises').select('*').eq('id', invoice.franchise_id).maybeSingle(),
      userIds.length > 0
        ? admin.from('users').select('id, email, full_name').in('id', userIds)
        : Promise.resolve({ data: [], error: null as { message: string } | null }),
    ]);
    if (itemsRes.error) throw Err.internal(itemsRes.error.message);
    if (customerRes.error) throw Err.internal(customerRes.error.message);
    if (franchiseRes.error) throw Err.internal(franchiseRes.error.message);
    if (usersRes.error) throw Err.internal(usersRes.error.message);

    type LiteUser = { id: string; email: string; full_name: string };
    const usersById = new Map<string, LiteUser>(
      (usersRes.data ?? []).map((u: LiteUser) => [u.id, u]),
    );

    return {
      data: {
        invoice,
        items: itemsRes.data ?? [],
        customer: customerRes.data,
        franchise: franchiseRes.data,
        creator: usersById.get(invoice.created_by) ?? null,
        last_editor: invoice.last_edited_by ? usersById.get(invoice.last_edited_by) ?? null : null,
      },
    };
  });
});
