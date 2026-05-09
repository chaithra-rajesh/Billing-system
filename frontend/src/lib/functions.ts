'use client';

import { env } from '@/config/env';
import { getSupabaseClient } from '@/lib/supabase/client';

/**
 * Helper for invoking Supabase Edge Functions from the browser.
 *
 * Why a wrapper?
 *  1. Auth: we always send the user's JWT so the function can authorize via RLS.
 *  2. Idempotency: money-mutating calls take an `idempotencyKey` and we standardize
 *     the header name so backend and frontend never disagree.
 *  3. Errors: every function returns `{ error: { code, message } }` on failure;
 *     this helper turns that into a thrown `EdgeFunctionError` with a stable shape.
 */

export class EdgeFunctionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'EdgeFunctionError';
  }
}

interface InvokeOptions<TBody> {
  body?: TBody;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function invokeFunction<TResult, TBody = unknown>(
  name: string,
  options: InvokeOptions<TBody> = {},
): Promise<TResult> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: env.supabaseAnonKey,
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await fetch(`${env.functionsUrl}/${name}`, {
    method: 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const requestId = response.headers.get('x-request-id') ?? undefined;
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const err = (payload as { error?: { code?: string; message?: string } })?.error;
    throw new EdgeFunctionError(
      err?.code ?? 'unknown_error',
      err?.message ?? `Edge function ${name} failed with ${response.status}`,
      response.status,
      requestId,
    );
  }

  // Unwrap the { data: T } envelope produced by the backend `ok()` helper.
  return (payload as { data: TResult } | null)?.data as TResult;
}
