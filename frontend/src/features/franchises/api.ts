import { invokeFunction } from '@/lib/functions';

export type FranchiseRole = 'franchise_admin' | 'billing_user' | 'system_user';

export interface FranchiseListItem {
  id: string;
  slug: string;
  name: string;
  gstin: string;
  state: string | null;
  state_code: string | null;
  logo_url: string | null;
  role: FranchiseRole;
}

export interface ListMyFranchisesResponse {
  franchises: FranchiseListItem[];
  total: number;
  limit: number;
  offset: number;
  is_super_admin: boolean;
}

export interface PartnerLogo {
  name: string;
  url: string;
}

export interface FranchiseFull {
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
  partner_logos: PartnerLogo[];
}

export interface BankRecord {
  bank_name: string;
  account_no: string;
  ifsc: string;
  branch: string | null;
}

export interface GstRecord {
  cgst_percent: number;
  sgst_percent: number;
  igst_percent: number;
  effective_from: string;
}

export interface FranchiseContext {
  franchise: FranchiseFull;
  bank: BankRecord | null;
  gst: GstRecord | null;
}

export function listMyFranchises(
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {},
) {
  return invokeFunction<ListMyFranchisesResponse>('list-my-franchises', {
    body: { limit: options.limit, offset: options.offset },
    signal: options.signal,
  });
}

export function getFranchiseContext(franchiseId: string, signal?: AbortSignal) {
  return invokeFunction<FranchiseContext>('get-franchise-context', {
    body: { franchise_id: franchiseId },
    signal,
  });
}

// ── create franchise ─────────────────────────────────────────────────────────

export interface CreateFranchiseInput {
  name: string;
  slug: string;
  gstin: string;
  address?: string;
  phone?: string;
  state?: string;
  state_code?: string;
}

export function createFranchise(input: CreateFranchiseInput) {
  return invokeFunction<{ franchise: FranchiseFull }>('create-franchise', { body: input });
}

// ── settings: writes ─────────────────────────────────────────────────────────

export interface UpdateFranchiseInput {
  franchise_id: string;
  name?: string;
  gstin?: string;
  address?: string;
  phone?: string;
  state?: string;
  state_code?: string;
  logo_url?: string;
  signature_url?: string;
  invoice_terms?: string[];
  partner_logos?: PartnerLogo[];
}

export function updateFranchise(input: UpdateFranchiseInput) {
  return invokeFunction<{ franchise: FranchiseFull }>('update-franchise', { body: input });
}

export interface UpsertBankInput {
  franchise_id: string;
  bank_name: string;
  account_no: string;
  ifsc: string;
  branch?: string;
}

export function upsertBankDetails(input: UpsertBankInput) {
  return invokeFunction<{ bank: BankRecord }>('upsert-bank-details', { body: input });
}

export interface AssetUploadUrl {
  upload_url: string;
  token: string;
  path: string;
  public_url: string;
}

export type AssetKind = 'logo' | 'signature' | 'partner_logo';

export function createAssetUploadUrl(franchiseId: string, kind: AssetKind, filename: string) {
  return invokeFunction<AssetUploadUrl>('create-asset-upload-url', {
    body: { franchise_id: franchiseId, kind, filename },
  });
}

/**
 * End-to-end upload: signed URL → PUT → returns the public URL the caller
 * should persist on the franchise row via `updateFranchise`.
 */
export async function uploadFranchiseAsset(
  franchiseId: string,
  kind: AssetKind,
  file: File,
): Promise<string> {
  const signed = await createAssetUploadUrl(franchiseId, kind, file.name);
  const res = await fetch(signed.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed: ${res.status} ${text}`.trim());
  }
  return signed.public_url;
}
