'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCustomer, listCustomers, type CreateCustomerInput } from './api';

export const customerKeys = {
  all: ['customers'] as const,
  byFranchise: (franchiseId: string, search?: string, limit?: number, offset?: number) =>
    [...customerKeys.all, franchiseId, search ?? '', limit ?? 0, offset ?? 0] as const,
};

export function useCustomers(
  franchiseId: string | undefined,
  options: { search?: string; limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: customerKeys.byFranchise(
      franchiseId ?? '',
      options.search,
      options.limit,
      options.offset,
    ),
    queryFn: ({ signal }) =>
      listCustomers(franchiseId!, {
        search: options.search,
        limit: options.limit,
        offset: options.offset,
        signal,
      }),
    enabled: !!franchiseId,
    staleTime: 60_000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => createCustomer(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [...customerKeys.all, variables.franchise_id] });
    },
  });
}
