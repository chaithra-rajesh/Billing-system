/**
 * Authorization helpers — answer "can this user do this thing in this franchise?"
 *
 * RLS already gates raw table access; these helpers exist for application-level
 * checks inside Edge Functions where we need a clear yes/no before doing
 * orchestration work (e.g. "only franchise_admin can invite users").
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { Err } from './errors.ts';

export type Role = 'franchise_admin' | 'billing_user';

export interface Membership {
  user_id: string;
  franchise_id: string;
  role: Role;
  is_active: boolean;
}

export async function isSuperAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('users')
    .select('is_super_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw Err.internal(`auth lookup failed: ${error.message}`);
  return data?.is_super_admin === true;
}

export async function getMemberships(
  client: SupabaseClient,
  userId: string,
): Promise<Membership[]> {
  const { data, error } = await client
    .from('user_franchise_roles')
    .select('user_id, franchise_id, role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw Err.internal(`role lookup failed: ${error.message}`);
  return (data ?? []) as Membership[];
}

export async function requireFranchiseAccess(
  client: SupabaseClient,
  userId: string,
  franchiseId: string,
  minimumRole: Role = 'billing_user',
): Promise<Membership> {
  if (await isSuperAdmin(client, userId)) {
    return { user_id: userId, franchise_id: franchiseId, role: 'franchise_admin', is_active: true };
  }
  const memberships = await getMemberships(client, userId);
  const m = memberships.find((x) => x.franchise_id === franchiseId);
  if (!m) throw Err.forbidden('No access to this franchise');

  if (minimumRole === 'franchise_admin' && m.role !== 'franchise_admin') {
    throw Err.forbidden('franchise_admin role required');
  }
  return m;
}
