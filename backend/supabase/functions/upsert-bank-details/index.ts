/**
 * Replaces the active bank record for a franchise. Calls the
 * `upsert_bank_details(...)` RPC, which atomically deactivates the current
 * active row and inserts a new active one (so the franchise is never left
 * with zero or two active rows). Old rows stay in the table for the audit
 * trail.
 *
 * Authorization is enforced inside the RPC (super_admin OR franchise_admin).
 *
 * Body: { franchise_id, bank_name, account_no, ifsc, branch? }
 * Response: { bank }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';

serveJson(async ({ sb, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));
  const bank_name = v.field(
    'bank_name',
    input.bank_name,
    check.string({ required: true, min: 1, max: 200 }),
  );
  const account_no = v.field(
    'account_no',
    input.account_no,
    check.string({ required: true, min: 1, max: 50 }),
  );
  const ifsc = v.field('ifsc', input.ifsc, check.string({ required: true, min: 1, max: 20 }));
  const branch = v.field('branch', input.branch, check.string({ max: 200 }));

  return v.done(async () => {
    const { data, error } = await sb.rpc('upsert_bank_details', {
      p_franchise_id: franchise_id!,
      p_bank_name: bank_name!,
      p_account_no: account_no!,
      p_ifsc: ifsc!,
      p_branch: branch || null,
    });

    if (error) {
      if (error.code === '42501' || /forbidden/i.test(error.message)) {
        throw Err.forbidden('Not allowed to edit bank details for this franchise');
      }
      throw Err.internal(error.message);
    }

    return { data: { bank: data } };
  });
});
