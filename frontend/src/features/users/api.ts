import { invokeFunction } from '@/lib/functions';

export type FranchiseRole = 'franchise_admin' | 'billing_user' | 'system_user';

export const ROLE_OPTIONS: { value: FranchiseRole; label: string }[] = [
  { value: 'franchise_admin', label: 'Franchise admin' },
  { value: 'billing_user', label: 'Billing user' },
  { value: 'system_user', label: 'System user' },
];

export function roleLabel(role: FranchiseRole): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

export interface FranchiseUser {
  ufr_id: string;
  role: FranchiseRole;
  ufr_active: boolean;
  granted_at: string;
  id: string;
  email: string;
  full_name: string;
  user_active: boolean;
}

export interface ListFranchiseUsersResponse {
  users: FranchiseUser[];
}

export function listFranchiseUsers(franchiseId: string, signal?: AbortSignal) {
  return invokeFunction<ListFranchiseUsersResponse>('list-franchise-users', {
    body: { franchise_id: franchiseId },
    signal,
  });
}

export interface InviteUserInput {
  email: string;
  full_name: string;
  franchise_id: string;
  role: FranchiseRole;
}

export interface InviteUserResponse {
  user_id: string;
  invited: boolean;
  role: FranchiseRole;
}

export function inviteUser(input: InviteUserInput) {
  return invokeFunction<InviteUserResponse>('invite-user', { body: input });
}

export interface UpdateMembershipInput {
  ufr_id: string;
  role?: FranchiseRole;
  is_active?: boolean;
}

export function updateUserMembership(input: UpdateMembershipInput) {
  return invokeFunction<{ membership: { id: string; role: FranchiseRole; is_active: boolean } }>(
    'update-user-membership',
    { body: input },
  );
}

// ── global users (super-admin only) ──────────────────────────────────────────

export interface UserMembership {
  ufr_id: string;
  franchise_id: string;
  franchise_slug: string;
  franchise_name: string;
  role: FranchiseRole;
  is_active: boolean;
  granted_at: string;
}

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  memberships: UserMembership[];
}

export interface ListUsersResponse {
  users: PlatformUser[];
  total: number;
  limit: number;
  offset: number;
}

export function listUsers(opts: { limit?: number; offset?: number; signal?: AbortSignal } = {}) {
  return invokeFunction<ListUsersResponse>('list-users', {
    body: { limit: opts.limit, offset: opts.offset },
    signal: opts.signal,
  });
}

export function setUserActive(input: { user_id: string; is_active: boolean }) {
  return invokeFunction<{ user: { id: string; email: string; full_name: string; is_active: boolean } }>(
    'set-user-active',
    { body: input },
  );
}
