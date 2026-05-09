/**
 * CORS handling for Edge Functions.
 *
 * Browsers send a preflight OPTIONS request before any cross-origin
 * POST/PUT/DELETE that carries non-simple headers (Authorization, apikey,
 * Idempotency-Key, Content-Type: application/json). Every function must
 * answer that preflight or the actual request will never fire.
 *
 * Allowed origins are read from the ALLOWED_ORIGINS env var (comma-separated).
 * In local dev that's `http://localhost:3000`. In production it's the deployed
 * frontend origin. We do NOT use `*` — Supabase functions send Authorization
 * headers and the spec disallows credentials with a wildcard origin.
 */

const ALLOW_HEADERS = [
  'authorization',
  'apikey',
  'content-type',
  'x-client-info',
  'idempotency-key',
  'x-request-id',
].join(', ');

const ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:3000';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function originFor(req: Request): string | null {
  const reqOrigin = req.headers.get('origin');
  if (!reqOrigin) return null;
  const allowed = allowedOrigins();
  if (allowed.includes('*')) return reqOrigin;
  return allowed.includes(reqOrigin) ? reqOrigin : null;
}

/** Build the headers we attach to every response, including errors. */
export function corsHeaders(req: Request): HeadersInit {
  const origin = originFor(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

/** If the request is a preflight, return a 204 immediately. Otherwise null. */
export function preflightResponse(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req),
  });
}
