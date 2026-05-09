'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFranchise,
  getFranchiseContext,
  listMyFranchises,
  updateFranchise,
  upsertBankDetails,
  type CreateFranchiseInput,
  type FranchiseListItem,
  type UpdateFranchiseInput,
  type UpsertBankInput,
} from './api';

export const franchiseKeys = {
  all: ['franchises'] as const,
  mine: (limit?: number, offset?: number) =>
    [...franchiseKeys.all, 'mine', limit ?? 0, offset ?? 0] as const,
  context: (franchiseId: string) => [...franchiseKeys.all, 'context', franchiseId] as const,
};

export function useMyFranchises(options: { limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: franchiseKeys.mine(options.limit, options.offset),
    queryFn: ({ signal }) =>
      listMyFranchises({ limit: options.limit, offset: options.offset, signal }),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/** Find a franchise the current user has access to by URL slug. */
export function useFranchiseBySlug(slug: string | undefined) {
  const query = useMyFranchises();
  const franchise: FranchiseListItem | undefined = slug
    ? query.data?.franchises.find((f) => f.slug === slug)
    : undefined;
  return { ...query, franchise };
}

export function useFranchiseContext(franchiseId: string | undefined) {
  return useQuery({
    queryKey: franchiseKeys.context(franchiseId ?? ''),
    queryFn: ({ signal }) => getFranchiseContext(franchiseId!, signal),
    enabled: !!franchiseId,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateFranchise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateFranchiseInput) => updateFranchise(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: franchiseKeys.context(vars.franchise_id) });
      qc.invalidateQueries({ queryKey: franchiseKeys.all });
    },
  });
}

export function useCreateFranchise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFranchiseInput) => createFranchise(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: franchiseKeys.all });
    },
  });
}

export function useUpsertBankDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertBankInput) => upsertBankDetails(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: franchiseKeys.context(vars.franchise_id) });
    },
  });
}
