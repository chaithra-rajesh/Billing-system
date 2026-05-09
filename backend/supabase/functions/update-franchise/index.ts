/**
 * Patches editable fields on a franchise row. Authorized via the user-scoped
 * client so the migration's RLS policy enforces super_admin OR franchise_admin
 * — no separate role check needed in code.
 *
 * Slug and is_active are NOT editable here (slug is the URL key; is_active
 * gates login flows and stays super-admin-only via the table's existing
 * delete policy).
 *
 * Body: { franchise_id, name?, gstin?, address?, phone?, state?, state_code?,
 *         logo_url?, signature_url?, invoice_terms?, partner_logos? }
 * Response: { franchise }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator, Invalid } from '../_shared/validation.ts';

interface PartnerLogo {
  name: string;
  url: string;
}

const partnerLogoCheck = (item: unknown): PartnerLogo | Invalid => {
  if (typeof item !== 'object' || item === null) return new Invalid('must be object');
  const obj = item as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.length === 0) return new Invalid('name required');
  if (typeof obj.url !== 'string' || obj.url.length === 0) return new Invalid('url required');
  if (obj.name.length > 100) return new Invalid('name too long');
  if (obj.url.length > 1000) return new Invalid('url too long');
  return { name: obj.name, url: obj.url };
};

const stringItemCheck = (v: unknown): string | Invalid => {
  if (typeof v !== 'string') return new Invalid('must be a string');
  if (v.length === 0) return new Invalid('must not be empty');
  if (v.length > 500) return new Invalid('max length 500');
  return v;
};

serveJson(async ({ sb, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));

  // Optional patch fields. We only touch keys the caller actually sent so a
  // partial PATCH doesn't accidentally null out fields they didn't mention.
  const name = 'name' in input
    ? v.field('name', input.name, check.string({ required: true, min: 1, max: 200 }))
    : undefined;
  const gstin = 'gstin' in input
    ? v.field('gstin', input.gstin, check.gstin({ required: true }))
    : undefined;
  const address = 'address' in input
    ? v.field('address', input.address, check.string({ max: 1000 }))
    : undefined;
  const phone = 'phone' in input
    ? v.field('phone', input.phone, check.string({ max: 30 }))
    : undefined;
  const state = 'state' in input
    ? v.field('state', input.state, check.string({ max: 100 }))
    : undefined;
  const state_code = 'state_code' in input
    ? v.field('state_code', input.state_code, check.string({ max: 10 }))
    : undefined;
  const logo_url = 'logo_url' in input
    ? v.field('logo_url', input.logo_url, check.string({ max: 1000 }))
    : undefined;
  const signature_url = 'signature_url' in input
    ? v.field('signature_url', input.signature_url, check.string({ max: 1000 }))
    : undefined;
  const invoice_terms = 'invoice_terms' in input
    ? v.field('invoice_terms', input.invoice_terms, check.array(stringItemCheck, { max: 20 }))
    : undefined;
  const partner_logos = 'partner_logos' in input
    ? v.field('partner_logos', input.partner_logos, check.array(partnerLogoCheck, { max: 10 }))
    : undefined;

  return v.done(async () => {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (gstin !== undefined) updates.gstin = gstin;
    if (address !== undefined) updates.address = address || null;
    if (phone !== undefined) updates.phone = phone || null;
    if (state !== undefined) updates.state = state || null;
    if (state_code !== undefined) updates.state_code = state_code || null;
    if (logo_url !== undefined) updates.logo_url = logo_url || null;
    if (signature_url !== undefined) updates.signature_url = signature_url || null;
    if (invoice_terms !== undefined) updates.invoice_terms = invoice_terms;
    if (partner_logos !== undefined) updates.partner_logos = partner_logos;

    if (Object.keys(updates).length === 0) {
      throw Err.badRequest('no_changes', 'Send at least one field to update');
    }

    const { data, error } = await sb
      .from('franchises')
      .update(updates)
      .eq('id', franchise_id!)
      .select(
        'id, name, slug, gstin, address, phone, state, state_code, logo_url, signature_url, invoice_terms, partner_logos',
      )
      .maybeSingle();

    if (error) {
      // RLS denial → 42501. Anything else is genuinely internal.
      if (error.code === '42501' || /row-level security/i.test(error.message)) {
        throw Err.forbidden('Not allowed to edit this franchise');
      }
      throw Err.internal(error.message);
    }
    if (!data) {
      // Either not found or RLS hid it from us. We can't tell which — return
      // 404 either way so we don't leak existence.
      throw Err.notFound('Franchise not found');
    }
    return { data: { franchise: data } };
  });
});
