import { invokeFunction } from '@/lib/functions';

export interface Customer {
  id: string;
  name: string;
  gstin: string | null;
  address: string | null;
  phone: string | null;
  alternate_phone: string | null;
  state: string | null;
  state_code: string | null;
  created_at: string;
}

export interface ListCustomersResponse {
  customers: Customer[];
  total: number;
  limit: number;
  offset: number;
}

export function listCustomers(
  franchiseId: string,
  options: { search?: string; limit?: number; offset?: number; signal?: AbortSignal } = {},
) {
  return invokeFunction<ListCustomersResponse>('list-customers', {
    body: {
      franchise_id: franchiseId,
      search: options.search,
      limit: options.limit,
      offset: options.offset,
    },
    signal: options.signal,
  });
}

export interface CreateCustomerInput {
  franchise_id: string;
  name: string;
  gstin?: string;
  address?: string;
  phone?: string;
  alternate_phone?: string;
  state?: string;
  state_code?: string;
}

export interface CreateCustomerResponse {
  customer: Customer;
}

export function createCustomer(input: CreateCustomerInput) {
  return invokeFunction<CreateCustomerResponse>('create-customer', { body: input });
}
