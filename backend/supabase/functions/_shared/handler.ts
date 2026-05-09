/**
 * Edge Function wrapper that takes care of the boilerplate every endpoint
 * shares: CORS preflight, request id, JSON body parsing, JWT auth, error
 * normalization. Per-function logic is just the inner handler.
 */

import { preflightResponse } from './cors.ts';
import { ok, fail, newRequestId, withRequestId } from './response.ts';
import { AppError, Err } from './errors.ts';
import { parseJson } from './validation.ts';
import { requireUser, userClient, serviceClient } from './supabase-client.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export interface HandlerCtx {
  req: Request;
  /**
   * Resolved app user. `id` is the public.users.id (NOT auth.users.id) —
   * the handler looks up the public row by `auth_user_id = jwt.sub` so
   * subsequent FK references (invoices.created_by, user_franchise_roles.user_id, ...)
   * always work with the same id.
   */
  user: { id: string; email: string; isSuperAdmin: boolean };
  /** Supabase client carrying the caller's JWT — RLS applies. */
  sb: SupabaseClient;
  /** Parsed JSON body, or null if there was no body. */
  body: unknown;
  /** Request id surfaced in the x-request-id header on the response. */
  requestId: string;
}

export interface HandlerResult<T> {
  status?: number;
  data: T;
}

export type Handler<T> = (ctx: HandlerCtx) => Promise<HandlerResult<T>>;

export interface ServeOptions {
  /** When true (default), the handler requires a valid JWT. */
  requireAuth?: boolean;
  /** When true, the body must be valid JSON (or empty); defaults to true. */
  parseBody?: boolean;
}

export function serveJson<T>(handler: Handler<T>, options: ServeOptions = {}) {
  const requireAuth = options.requireAuth ?? true;
  const parseBody = options.parseBody ?? true;

  Deno.serve(async (req) => {
    const requestId = newRequestId();
    const pre = preflightResponse(req);
    if (pre) return withRequestId(pre, requestId);

    try {
      let user: HandlerCtx['user'] = { id: '', email: '', isSuperAdmin: false };
      if (requireAuth) {
        const jwtUser = await requireUser(req);
        const admin = serviceClient();
        const { data: appUser, error: lookupErr } = await admin
          .from('users')
          .select('id, email, is_super_admin, is_active')
          .eq('auth_user_id', jwtUser.id)
          .maybeSingle();
        if (lookupErr) throw Err.internal(`user lookup failed: ${lookupErr.message}`);
        if (!appUser) throw Err.forbidden('Your account is not provisioned in this app');
        if (appUser.is_active === false) throw Err.forbidden('Account disabled');
        user = {
          id: appUser.id as string,
          email: appUser.email as string,
          isSuperAdmin: appUser.is_super_admin === true,
        };
      }

      const sb = userClient(req);

      let body: unknown = null;
      if (parseBody && req.method !== 'GET' && req.headers.get('content-length') !== '0') {
        const raw = await req.text();
        body = raw ? JSON.parse(raw) : null;
      }

      const result = await handler({ req, user, sb, body, requestId });
      return withRequestId(ok(req, result.data, result.status ?? 200), requestId);
    } catch (e) {
      if (e instanceof AppError) {
        return withRequestId(
          fail(req, { code: e.code, message: e.message, details: e.details }, e.status),
          requestId,
        );
      }
      if (e instanceof SyntaxError) {
        const err = Err.badRequest('invalid_json', 'Request body must be valid JSON');
        return withRequestId(
          fail(req, { code: err.code, message: err.message }, err.status),
          requestId,
        );
      }
      const message = (e as Error)?.message ?? '';
      if (message === 'unauthorized' || message === 'Missing Authorization header') {
        return withRequestId(
          fail(req, { code: 'unauthorized', message: 'Sign-in required' }, 401),
          requestId,
        );
      }
      console.error('handler error', requestId, e);
      return withRequestId(
        fail(req, { code: 'internal_error', message: 'Internal error' }, 500),
        requestId,
      );
    }
  });
}

export { parseJson };
