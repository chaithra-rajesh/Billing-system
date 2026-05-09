'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
  type CreateInvoiceInput,
  type InvoiceStatus,
  type UpdateInvoiceInput,
} from './api';

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (franchiseId: string, status?: InvoiceStatus, limit?: number, offset?: number) =>
    [
      ...invoiceKeys.all,
      'list',
      franchiseId,
      status ?? 'all',
      limit ?? 0,
      offset ?? 0,
    ] as const,
  detail: (invoiceId: string) => [...invoiceKeys.all, 'detail', invoiceId] as const,
};

export function useInvoices(
  franchiseId: string | undefined,
  options: { status?: InvoiceStatus; limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: invoiceKeys.list(
      franchiseId ?? '',
      options.status,
      options.limit,
      options.offset,
    ),
    queryFn: ({ signal }) =>
      listInvoices(franchiseId!, {
        status: options.status,
        limit: options.limit,
        offset: options.offset,
        signal,
      }),
    enabled: !!franchiseId,
    placeholderData: (prev) => prev,
  });
}

export function useInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.detail(invoiceId ?? ''),
    queryFn: ({ signal }) => getInvoice(invoiceId!, signal),
    enabled: !!invoiceId,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateInvoiceInput; idempotencyKey: string }) =>
      createInvoice(input, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: UpdateInvoiceInput; idempotencyKey: string }) =>
      updateInvoice(input, idempotencyKey),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(data.invoice.id) });
    },
  });
}
