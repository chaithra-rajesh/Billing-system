'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

/**
 * Browser Supabase client. Singleton — creating multiple instances breaks
 * the auth listener. Uses the anon (publishable) key. Authorization is
 * delegated to RLS on the database, which keys off the user's JWT.
 *
 * The service-role key is intentionally NOT used here and must never appear
 * in this repo.
 */
let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _client;
}
