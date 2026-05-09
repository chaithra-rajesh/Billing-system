/**
 * Single source of truth for environment variables on the frontend.
 *
 * Every var is NEXT_PUBLIC_… because the frontend has no server code.
 * Anything in here is visible to anyone with browser devtools — never put a secret here.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  appUrl: required('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL),
  functionsUrl: required('NEXT_PUBLIC_FUNCTIONS_URL', process.env.NEXT_PUBLIC_FUNCTIONS_URL),
} as const;
