/**
 * Creates a customer for a franchise. Used by the invoice editor's
 * "+ Add new" flow when the bill-to party isn't already in the dropdown.
 *
 * RLS gates writes: the user-scoped client can only insert rows whose
 * franchise_id is in `my_franchise_ids()`, so we don't need a separate
 * authorization check here — Postgres will refuse if the caller lacks
 * access to the franchise.
 *
 * Body: { franchise_id, name, gstin?, address?, phone?, alternate_phone?, state?, state_code? }
 * Response: { customer }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';

serveJson(async ({ sb, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));
  const name = v.field('name', input.name, check.string({ required: true, min: 1, max: 200 }));
  const gstin = v.field('gstin', input.gstin, check.gstin());
  const address = v.field('address', input.address, check.string({ max: 1000 }));
  const phone = v.field('phone', input.phone, check.string({ max: 30 }));
  const alternate_phone = v.field('alternate_phone', input.alternate_phone, check.string({ max: 30 }));
  const state = v.field('state', input.state, check.string({ max: 100 }));
  const state_code = v.field('state_code', input.state_code, check.string({ max: 10 }));

  return v.done(async () => {
    const { data, error } = await sb
      .from('customers')
      .insert({
        franchise_id: franchise_id!,
        name: name!,
        gstin: gstin || null,
        address: address || null,
        phone: phone || null,
        alternate_phone: alternate_phone || null,
        state: state || null,
        state_code: state_code || null,
      })
      .select('id, name, gstin, address, phone, alternate_phone, state, state_code, created_at')
      .single();

    if (error) {
      // RLS denial surfaces as PostgREST 42501 / "new row violates row-level security".
      if (error.code === '42501' || /row-level security/i.test(error.message)) {
        throw Err.forbidden('No access to this franchise');
      }
      throw Err.internal(error.message);
    }
    return { status: 201, data: { customer: data } };
  });
});
