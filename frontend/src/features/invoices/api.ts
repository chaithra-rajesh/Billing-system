import { invokeFunction } from '@/lib/functions';

export type InvoiceStatus = 'draft' | 'finalised' | 'cancelled';

export interface InvoiceListItem {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: InvoiceStatus;
  grand_total: number;
  created_at: string;
  customer: { id: string; name: string; gstin: string | null } | null;
}

export interface ListInvoicesResponse {
  invoices: InvoiceListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface InvoiceItem {
  id: string;
  sl_no: number;
  particulars: string;
  hsn_code: string | null;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoicePartnerLogo {
  name: string;
  url: string;
}

export interface InvoiceFranchise {
  id: string;
  name: string;
  slug: string;
  gstin: string;
  address: string | null;
  phone: string | null;
  state: string | null;
  state_code: string | null;
  logo_url: string | null;
  signature_url: string | null;
  invoice_terms: string[];
  partner_logos: InvoicePartnerLogo[];
}

export interface InvoiceCustomer {
  id: string;
  name: string;
  gstin: string | null;
  address: string | null;
  phone: string | null;
  state: string | null;
  state_code: string | null;
}

export interface InvoiceRow {
  id: string;
  franchise_id: string;
  customer_id: string;
  created_by: string;
  last_edited_by: string | null;
  invoice_no: string;
  invoice_date: string;
  date_of_supply: string | null;
  transport_mode: string | null;
  vehicle_no: string | null;
  place_of_supply: string | null;
  ship_to_name: string | null;
  ship_to_address: string | null;
  ship_to_gstin: string | null;
  ship_to_state: string | null;
  ship_to_state_code: string | null;
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  grand_total: number;
  grand_total_words: string | null;
  bank_snapshot: BankSnapshot | null;
  gst_snapshot: GstSnapshot | null;
  signature_snapshot: string | null;
  status: InvoiceStatus;
  created_at: string;
  updated_at: string | null;
}

export interface InvoiceUser {
  id: string;
  email: string;
  full_name: string;
}

export interface BankSnapshot {
  bank_name: string;
  account_no: string;
  ifsc: string;
  branch: string | null;
}

export interface GstSnapshot {
  cgst_percent: number;
  sgst_percent: number;
  igst_percent: number;
}

export interface GetInvoiceResponse {
  invoice: InvoiceRow;
  items: InvoiceItem[];
  customer: InvoiceCustomer;
  franchise: InvoiceFranchise;
  creator: InvoiceUser | null;
  last_editor: InvoiceUser | null;
}

export interface CreateInvoiceItemInput {
  particulars: string;
  hsn_code?: string;
  quantity: number;
  rate: number;
}

export interface CreateInvoiceInput {
  franchise_id: string;
  customer_id: string;
  invoice_date?: string;
  date_of_supply?: string;
  transport_mode?: string;
  vehicle_no?: string;
  place_of_supply?: string;
  ship_to_name?: string;
  ship_to_address?: string;
  ship_to_gstin?: string;
  ship_to_state?: string;
  ship_to_state_code?: string;
  items: CreateInvoiceItemInput[];
  tax_mode?: 'intra' | 'inter';
  cgst_percent?: number;
  sgst_percent?: number;
  igst_percent?: number;
  finalise?: boolean;
}

export interface CreateInvoiceResponse {
  invoice: InvoiceRow;
  items: InvoiceItem[];
}

export interface UpdateInvoiceInput {
  invoice_id: string;
  customer_id: string;
  invoice_date?: string;
  date_of_supply?: string;
  transport_mode?: string;
  vehicle_no?: string;
  place_of_supply?: string;
  ship_to_name?: string;
  ship_to_address?: string;
  ship_to_gstin?: string;
  ship_to_state?: string;
  ship_to_state_code?: string;
  items: CreateInvoiceItemInput[];
  tax_mode?: 'intra' | 'inter';
  cgst_percent?: number;
  sgst_percent?: number;
  igst_percent?: number;
}

export interface UpdateInvoiceResponse {
  invoice: InvoiceRow;
  items: InvoiceItem[];
}

export function listInvoices(
  franchiseId: string,
  opts?: { status?: InvoiceStatus; limit?: number; offset?: number; signal?: AbortSignal },
) {
  return invokeFunction<ListInvoicesResponse>('list-invoices', {
    body: {
      franchise_id: franchiseId,
      status: opts?.status,
      limit: opts?.limit,
      offset: opts?.offset,
    },
    signal: opts?.signal,
  });
}

export function getInvoice(invoiceId: string, signal?: AbortSignal) {
  return invokeFunction<GetInvoiceResponse>('get-invoice', {
    body: { invoice_id: invoiceId },
    signal,
  });
}

export function createInvoice(input: CreateInvoiceInput, idempotencyKey: string) {
  return invokeFunction<CreateInvoiceResponse>('create-invoice', {
    body: input,
    idempotencyKey,
  });
}

export function updateInvoice(input: UpdateInvoiceInput, idempotencyKey: string) {
  return invokeFunction<UpdateInvoiceResponse>('update-invoice', {
    body: input,
    idempotencyKey,
  });
}
