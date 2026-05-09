/**
 * Issues a one-shot signed PUT URL into the `franchise-assets` storage
 * bucket. The frontend uploads the file directly via the URL, then sends the
 * returned `public_url` back through `update-franchise` to persist it on the
 * franchise row.
 *
 * Path layout: `{franchise_id}/{kind}/{uuid}-{safe-filename}` — the
 * franchise_id prefix is enforced by the bucket's RLS policy (see migration
 * 20260506000002), so a franchise admin cannot write into another
 * franchise's folder.
 *
 * Authorized for super_admin or franchise_admin of the target franchise.
 *
 * Body: { franchise_id, filename, kind: 'logo' | 'signature' | 'partner_logo' }
 * Response: { upload_url, token, path, public_url }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { serviceClient } from '../_shared/supabase-client.ts';

const KINDS = ['logo', 'signature', 'partner_logo'] as const;
const BUCKET = 'franchise-assets';

serveJson(async ({ user, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));
  const filename = v.field(
    'filename',
    input.filename,
    check.string({ required: true, min: 1, max: 255 }),
  );
  const kind = v.field('kind', input.kind, check.enum(KINDS));

  return v.done(async () => {
    const admin = serviceClient();

    // Authorize: super_admin or franchise_admin (billing_user can't upload).
    if (!user.isSuperAdmin) {
      const { data: role, error: rErr } = await admin
        .from('user_franchise_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('franchise_id', franchise_id!)
        .eq('is_active', true)
        .maybeSingle();
      if (rErr) throw Err.internal(rErr.message);
      if (!role || role.role !== 'franchise_admin') {
        throw Err.forbidden('Only super_admin or franchise_admin can upload assets');
      }
    }

    // Sanitize filename: keep extension chars, replace anything risky with _.
    const safeName = filename!.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const path = `${franchise_id}/${kind}/${crypto.randomUUID()}-${safeName}`;

    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw Err.internal(error.message);

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    return {
      data: {
        upload_url: data.signedUrl,
        token: data.token,
        path,
        public_url: pub.publicUrl,
      },
    };
  });
});
