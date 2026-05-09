/**
 * Creates a new franchise. Restricted to super admins — letting a
 * franchise_admin spin up arbitrary franchises (and become their admin) is a
 * privilege escalation, so we keep this gated to platform owners. The
 * existing `franchises_insert` RLS policy already enforces this; we
 * double-check in the function body for a clearer error message.
 *
 * Slug is the URL key and Supabase Storage path prefix, so it's tightly
 * validated: lowercase letters / digits / hyphens, 2-30 chars.
 *
 * Bank, GST, logos, signature, terms — all configurable by the franchise
 * admin afterwards via the Settings page. This function only seeds the row.
 *
 * Body: { name, slug, gstin, address?, phone?, state?, state_code? }
 * Response: { franchise }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;

serveJson(async ({ user, sb, body }) => {
  if (!user.isSuperAdmin) {
    throw Err.forbidden('Only super admins can create franchises');
  }

  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const name = v.field('name', input.name, check.string({ required: true, min: 1, max: 200 }));
  const slug = v.field('slug', input.slug, check.string({ required: true, min: 2, max: 30 }));
  const gstin = v.field('gstin', input.gstin, check.gstin({ required: true }));
  const address = v.field('address', input.address, check.string({ max: 1000 }));
  const phone = v.field('phone', input.phone, check.string({ max: 30 }));
  const state = v.field('state', input.state, check.string({ max: 100 }));
  const state_code = v.field('state_code', input.state_code, check.string({ max: 10 }));

  return v.done(async () => {
    if (!SLUG_RE.test(slug!)) {
      throw Err.unprocessable(
        'invalid_slug',
        'Slug must be lowercase letters, digits, and hyphens (2–30 chars, no leading/trailing hyphen)',
      );
    }

    const { data, error } = await sb
      .from('franchises')
      .insert({
        name: name!,
        slug: slug!,
        gstin: gstin!,
        address: address || null,
        phone: phone || null,
        state: state || null,
        state_code: state_code || null,
      })
      .select(
        'id, name, slug, gstin, address, phone, state, state_code, logo_url, signature_url, invoice_terms, partner_logos',
      )
      .single();

    if (error) {
      if (error.code === '23505') {
        // unique_violation — only `slug` has a unique constraint here
        throw Err.conflict('slug_taken', 'A franchise with this slug already exists');
      }
      if (error.code === '42501' || /row-level security/i.test(error.message)) {
        throw Err.forbidden('Not allowed');
      }
      throw Err.internal(error.message);
    }

    return { status: 201, data: { franchise: data } };
  });
});
