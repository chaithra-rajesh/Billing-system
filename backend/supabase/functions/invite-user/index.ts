/**
 * Invites a user to a franchise. Two paths:
 *
 *   1. **New user** — sends a Supabase Auth invite email; the auth-sync
 *      trigger (migration 20260505000002) creates the public.users row;
 *      we then create the user_franchise_roles row.
 *   2. **Existing user** — looks up by email, reuses the public.users row,
 *      and adds (or reactivates / re-roles) a user_franchise_roles row for
 *      this franchise. This is also how an admin "adds another franchise"
 *      to a user later.
 *
 * Authorized for super_admin or franchise_admin of the target franchise.
 *
 * Body: { email, full_name, franchise_id, role: 'franchise_admin' | 'billing_user' }
 * Response: { user_id, invited: boolean, role }
 */

import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { serviceClient } from '../_shared/supabase-client.ts';

const ROLES = ['franchise_admin', 'billing_user', 'system_user'] as const;

/**
 * Build the post-invite redirect URL — where the email link drops the user
 * after Supabase verifies the token. The Origin header is the most
 * accurate source (the admin's own browser), with APP_URL as a fallback for
 * cron / server-to-server callers, or `null` if neither is available (in
 * which case Supabase falls back to its project-wide Site URL).
 */
function inviteRedirect(req: Request): string | undefined {
  const origin = req.headers.get('origin')?.trim();
  const fallback = Deno.env.get('APP_URL')?.trim();
  const base = origin || fallback;
  return base ? `${base.replace(/\/$/, '')}/accept-invite` : undefined;
}

serveJson(async ({ req, user, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const email = v.field('email', input.email, check.email());
  const full_name = v.field(
    'full_name',
    input.full_name,
    check.string({ required: true, min: 1, max: 200 }),
  );
  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));
  const role = v.field('role', input.role, check.enum(ROLES));

  return v.done(async () => {
    const admin = serviceClient();

    // Authorize: super_admin or franchise_admin of this franchise.
    if (!user.isSuperAdmin) {
      const { data: r, error: rErr } = await admin
        .from('user_franchise_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('franchise_id', franchise_id!)
        .eq('is_active', true)
        .maybeSingle();
      if (rErr) throw Err.internal(rErr.message);
      if (!r || r.role !== 'franchise_admin') {
        throw Err.forbidden('Only super_admin or franchise_admin can invite users');
      }
    }

    // Step 1: find or invite the user.
    let publicUserId: string;
    let invited = false;

    const { data: existing, error: lookupErr } = await admin
      .from('users')
      .select('id, email')
      .eq('email', email!)
      .maybeSingle();
    if (lookupErr) throw Err.internal(lookupErr.message);

    if (existing) {
      publicUserId = existing.id as string;
    } else {
      const redirectTo = inviteRedirect(req);
      const { data: invRes, error: invErr } = await admin.auth.admin.inviteUserByEmail(
        email!,
        { data: { full_name }, ...(redirectTo ? { redirectTo } : {}) },
      );
      if (invErr) throw Err.internal(`Invite failed: ${invErr.message}`);

      // The handle_new_auth_user trigger SHOULD have populated public.users
      // by now, but on projects where the trigger isn't installed (or is
      // out-of-date) it won't have. Try the lookup; if missing, upsert the
      // row ourselves so the rest of the flow can proceed deterministically.
      const authUserId = invRes.user.id;
      const { data: triggered } = await admin
        .from('users')
        .select('id, auth_user_id, full_name')
        .or(`auth_user_id.eq.${authUserId},id.eq.${authUserId}`)
        .maybeSingle();

      if (triggered) {
        // Make sure auth_user_id and full_name are populated even if the
        // older trigger version (pre-20260505000002) created the row.
        const patch: Record<string, unknown> = {};
        if (!triggered.auth_user_id) patch.auth_user_id = authUserId;
        if (!triggered.full_name || triggered.full_name === '') patch.full_name = full_name;
        if (Object.keys(patch).length > 0) {
          await admin.from('users').update(patch).eq('id', triggered.id);
        }
        publicUserId = triggered.id as string;
      } else {
        // Trigger absent — insert the public.users row ourselves.
        const { data: created, error: createErr } = await admin
          .from('users')
          .insert({
            id: authUserId,
            auth_user_id: authUserId,
            email: email!,
            full_name,
            is_active: true,
            is_super_admin: false,
          })
          .select('id')
          .single();
        if (createErr) throw Err.internal(`Failed to seed public.users: ${createErr.message}`);
        publicUserId = created.id as string;
      }
      invited = true;
    }

    // Step 2: ensure a user_franchise_roles row exists with the right role.
    const { data: existingRole, error: roleErr } = await admin
      .from('user_franchise_roles')
      .select('id, role, is_active')
      .eq('user_id', publicUserId)
      .eq('franchise_id', franchise_id!)
      .maybeSingle();
    if (roleErr) throw Err.internal(roleErr.message);

    if (existingRole) {
      if (existingRole.is_active && existingRole.role === role) {
        return { data: { user_id: publicUserId, invited, role: existingRole.role } };
      }
      const { error } = await admin
        .from('user_franchise_roles')
        .update({
          role,
          is_active: true,
          granted_by: user.id,
          granted_at: new Date().toISOString(),
        })
        .eq('id', existingRole.id);
      if (error) throw Err.internal(error.message);
    } else {
      const { error } = await admin.from('user_franchise_roles').insert({
        user_id: publicUserId,
        franchise_id: franchise_id!,
        role,
        granted_by: user.id,
        is_active: true,
      });
      if (error) throw Err.internal(error.message);
    }

    return { status: 201, data: { user_id: publicUserId, invited, role } };
  });
});
