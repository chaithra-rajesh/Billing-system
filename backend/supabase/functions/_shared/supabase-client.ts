import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

/**
 * Two Supabase clients per request.
 *
 *  - userClient:    uses the caller's JWT. RLS applies. This is what 99% of
 *                   function code should use — it enforces multi-tenant
 *                   isolation automatically.
 *
 *  - serviceClient: uses the service role key. Bypasses RLS. Reserved for
 *                   genuinely-privileged work: idempotency lookups, audit
 *                   trail writes, cross-tenant maintenance jobs. Never use
 *                   this when you could use userClient instead.
 */

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

/** Read the authenticated user from the JWT. Throws 401 if no/invalid token. */
export async function requireUser(req: Request): Promise<{ id: string; email: string }> {
  const supabase = userClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Error('unauthorized');
  }
  return { id: data.user.id, email: data.user.email ?? '' };
}
