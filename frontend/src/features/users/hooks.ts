'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inviteUser,
  listFranchiseUsers,
  listUsers,
  setUserActive,
  updateUserMembership,
  type InviteUserInput,
  type UpdateMembershipInput,
} from './api';

export const userKeys = {
  all: ['users'] as const,
  global: () => [...userKeys.all, 'global'] as const,
  inFranchise: (franchiseId: string) => [...userKeys.all, 'franchise', franchiseId] as const,
};

export function useFranchiseUsers(franchiseId: string | undefined) {
  return useQuery({
    queryKey: userKeys.inFranchise(franchiseId ?? ''),
    queryFn: ({ signal }) => listFranchiseUsers(franchiseId!, signal),
    enabled: !!franchiseId,
    staleTime: 30_000,
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteUserInput) => inviteUser(input),
    onSuccess: (_, vars) => {
      // Refresh both views: the per-franchise list the admin came from,
      // AND the global users list (so the new user / new membership shows
      // up on the /users page without a manual refetch).
      qc.invalidateQueries({ queryKey: userKeys.inFranchise(vars.franchise_id) });
      qc.invalidateQueries({ queryKey: userKeys.global() });
    },
  });
}

export function useUpdateUserMembership(franchiseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMembershipInput) => updateUserMembership(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.inFranchise(franchiseId) });
      qc.invalidateQueries({ queryKey: userKeys.global() });
    },
  });
}

export function useAllUsers() {
  return useQuery({
    queryKey: userKeys.global(),
    queryFn: ({ signal }) => listUsers({ signal }),
    staleTime: 30_000,
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { user_id: string; is_active: boolean }) => setUserActive(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.global() });
    },
  });
}

export function useUpdateMembershipGlobal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMembershipInput) => updateUserMembership(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
