import { corsHeaders } from './cors.ts';

/**
 * Standard JSON response shape.
 *
 *   success → { data: T }
 *   error   → { error: { code, message, details? } }
 *
 * Every Edge Function returns one of these. Frontend `invokeFunction` parses
 * this shape and throws an `EdgeFunctionError` on the error case.
 */

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export function ok<T>(req: Request, data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
}

export function fail(req: Request, error: ErrorPayload, status = 400): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
}

export function withRequestId(response: Response, requestId: string): Response {
  response.headers.set('x-request-id', requestId);
  return response;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
