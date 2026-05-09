/**
 * Returns everything the invoice editor needs to render a finalised-looking
 * form: the franchise (logo / address / GSTIN / state / state_code /
 * invoice_terms / signature_url), the active bank record, and the active
 * GST percentages. One round-trip so the editor can mount with all the
 * static blocks pre-filled.
 *
 * Body: { franchise_id: uuid }
 * Response: { franchise, bank | null, gst | null }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { serviceClient } from '../_shared/supabase-client.ts';

serveJson(async ({ user, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;
  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));

  return v.done(async () => {
    const admin = serviceClient();

    // Authorize: super admin or member of this franchise.
    if (!user.isSuperAdmin) {
      const { data: membership, error: mErr } = await admin
        .from('user_franchise_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('franchise_id', franchise_id!)
        .eq('is_active', true)
        .maybeSingle();
      if (mErr) throw Err.internal(mErr.message);
      if (!membership) throw Err.forbidden('No access to this franchise');
    }

    const [franchiseRes, bankRes, gstRes] = await Promise.all([
      admin
        .from('franchises')
        .select(
          'id, name, slug, gstin, address, phone, state, state_code, logo_url, signature_url, invoice_terms, partner_logos',
        )
        .eq('id', franchise_id!)
        .maybeSingle(),
      admin
        .from('bank_details')
        .select('bank_name, account_no, ifsc, branch')
        .eq('franchise_id', franchise_id!)
        .eq('is_active', true)
        .maybeSingle(),
      admin
        .from('gst_config')
        .select('cgst_percent, sgst_percent, igst_percent, effective_from')
        .eq('franchise_id', franchise_id!)
        .eq('is_active', true)
        .maybeSingle(),
    ]);
    if (franchiseRes.error) throw Err.internal(franchiseRes.error.message);
    if (bankRes.error) throw Err.internal(bankRes.error.message);
    if (gstRes.error) throw Err.internal(gstRes.error.message);
    if (!franchiseRes.data) throw Err.notFound('Franchise not found');

    return {
      data: {
        franchise: franchiseRes.data,
        bank: bankRes.data,
        gst: gstRes.data,
      },
    };
  });
});
