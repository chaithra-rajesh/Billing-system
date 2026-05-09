/**
 * Idempotency helper.
 *
 * Per CLAUDE.md rule 9, every money-mutating Edge Function accepts an
 * `Idempotency-Key` header. The first call runs the handler and caches the
 * JSON response; replays within 24h return the cached response (and HTTP
 * status) instead of running the handler again.
 *
 * Storage: `public.idempotency_keys`. Bypassed by RLS via the service-role
 * client — clients never read this table directly.
 *
 * Fingerprinting: we hash (function_name + canonical body). If the same key
 * arrives with a different body, we treat that as a misuse and return 409.
 */

import { serviceClient } from './supabase-client.ts';
import { Err } from './errors.ts';

const KEY_HEADER = 'Idempotency-Key';

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

export interface IdempotencyResult<T> {
  /** True if this response was served from the cache (replay). */
  replayed: boolean;
  /** HTTP status to use for the response. */
  status: number;
  /** Parsed response body. */
  body: T;
}

export interface RunOptions<T> {
  req: Request;
  userId: string;
  fnName: string;
  body: unknown;
  /** Required: produces the success body and HTTP status on the first call. */
  handler: () => Promise<{ status?: number; body: T }>;
}

/**
 * Run `handler` exactly once per (user, key, fingerprint).
 *
 *  - No header → run normally, do not cache.
 *  - Header + first call → run handler, store the response, return it.
 *  - Header + replay (same fingerprint) → return cached response, replayed = true.
 *  - Header + replay (different fingerprint) → 409 idempotency_conflict.
 */
export async function withIdempotency<T>(opts: RunOptions<T>): Promise<IdempotencyResult<T>> {
  const key = opts.req.headers.get(KEY_HEADER);
  if (!key) {
    const { status = 200, body } = await opts.handler();
    return { replayed: false, status, body };
  }

  const fingerprint = await sha256Hex(opts.fnName + '|' + canonicalize(opts.body));
  const sb = serviceClient();

  // Check for an existing record. (user_id, key) is unique.
  const { data: existing, error: lookupErr } = await sb
    .from('idempotency_keys')
    .select('fingerprint, status_code, response_body, expires_at')
    .eq('user_id', opts.userId)
    .eq('key', key)
    .maybeSingle();

  if (lookupErr) throw Err.internal(`idempotency lookup failed: ${lookupErr.message}`);

  if (existing && new Date(existing.expires_at as string).getTime() > Date.now()) {
    if (existing.fingerprint !== fingerprint) {
      throw Err.conflict('idempotency_conflict', 'Idempotency key reused with a different payload');
    }
    return {
      replayed: true,
      status: existing.status_code as number,
      body: existing.response_body as T,
    };
  }

  // First call: run handler, then cache.
  const { status = 200, body } = await opts.handler();

  const { error: insertErr } = await sb.from('idempotency_keys').upsert(
    {
      user_id: opts.userId,
      key,
      fingerprint,
      status_code: status,
      response_body: body as unknown as object,
    },
    { onConflict: 'user_id,key' },
  );
  if (insertErr) {
    // Cache miss is not a hard failure — the user already got a successful
    // result; we just lose replay protection on this call. Log to console.
    console.warn('idempotency cache write failed:', insertErr.message);
  }

  return { replayed: false, status, body };
}
