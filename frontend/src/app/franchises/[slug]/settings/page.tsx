'use client';

import { use, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell, PageActions, PageTitle } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useFranchiseBySlug,
  useFranchiseContext,
  useMyFranchises,
  useUpdateFranchise,
  useUpsertBankDetails,
} from '@/features/franchises/hooks';
import { uploadFranchiseAsset } from '@/features/franchises/api';
import type {
  AssetKind,
  FranchiseFull,
  PartnerLogo,
} from '@/features/franchises/api';
import { UsersSection } from '@/features/users/components/users-section';

export default function FranchiseSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <RequireAuth>
      <SettingsView slug={slug} />
    </RequireAuth>
  );
}

function SettingsView({ slug }: { slug: string }) {
  const router = useRouter();
  const { franchise: pickerEntry, isLoading: pickerLoading } = useFranchiseBySlug(slug);
  const { data: myFranchises } = useMyFranchises();
  const { data: ctx, isLoading: ctxLoading, error } = useFranchiseContext(pickerEntry?.id);

  // Gate: super_admin OR franchise_admin. We check both is_super_admin (the
  // global flag) and the franchise role — list-my-franchises tags super
  // admins as franchise_admin, but checking is_super_admin directly avoids
  // false negatives if pickerEntry isn't loaded yet.
  const isSuper = myFranchises?.is_super_admin ?? false;
  const allowed = isSuper || pickerEntry?.role === 'franchise_admin';

  if (pickerLoading || ctxLoading) {
    return (
      <AppShell>
        <PageTitle title="Settings" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  // Non-super, no membership → no access. Super admins always pass through
  // since they're entitled to every franchise.
  if (!pickerEntry && !isSuper) {
    return (
      <AppShell>
        <PageTitle title="Settings" />
        <Card>
          <CardHeader>
            <CardTitle>No access</CardTitle>
            <CardDescription>You don&apos;t have access to this franchise.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell>
        <PageTitle title="Settings" />
        <Card>
          <CardHeader>
            <CardTitle>Admin only</CardTitle>
            <CardDescription>
              Only franchise admins (or super admins) can edit franchise settings. Your role is{' '}
              <span className="font-mono">{pickerEntry?.role ?? 'unknown'}</span>.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  if (error || !ctx) {
    return (
      <AppShell>
        <PageTitle title="Settings" />
        <Card>
          <CardHeader>
            <CardTitle>Couldn&apos;t load settings</CardTitle>
            <CardDescription>{(error as Error)?.message || 'Try again later.'}</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle
        title="Franchise settings"
        slug={ctx.franchise.slug}
        subtitle={ctx.franchise.name}
      />

      <PageActions>
        <Button variant="outline" onClick={() => router.push(`/franchises/${slug}/invoices`)}>
          Back to invoices
        </Button>
      </PageActions>

      <div className="mx-auto w-full max-w-3xl space-y-6">
        <FranchiseDetailsForm franchise={ctx.franchise} />
        <BankDetailsForm franchise={ctx.franchise} bank={ctx.bank} />
        <LogosSection franchise={ctx.franchise} />
        <UsersSection franchiseId={ctx.franchise.id} />
      </div>
    </AppShell>
  );
}

// ── Franchise details form ──────────────────────────────────────────────────

interface DetailsValues {
  name: string;
  gstin: string;
  address: string;
  phone: string;
  state: string;
  state_code: string;
  invoice_terms_text: string; // newline-separated
}

function FranchiseDetailsForm({ franchise }: { franchise: FranchiseFull }) {
  const update = useUpdateFranchise();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<DetailsValues>({
    defaultValues: {
      name: franchise.name,
      gstin: franchise.gstin,
      address: franchise.address ?? '',
      phone: franchise.phone ?? '',
      state: franchise.state ?? '',
      state_code: franchise.state_code ?? '',
      invoice_terms_text: (franchise.invoice_terms ?? []).join('\n'),
    },
  });

  async function onSubmit(values: DetailsValues) {
    const terms = values.invoice_terms_text
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      const res = await update.mutateAsync({
        franchise_id: franchise.id,
        name: values.name,
        gstin: values.gstin,
        address: values.address,
        phone: values.phone,
        state: values.state,
        state_code: values.state_code,
        invoice_terms: terms,
      });
      toast.success('Franchise details saved');
      reset({
        name: res.franchise.name,
        gstin: res.franchise.gstin,
        address: res.franchise.address ?? '',
        phone: res.franchise.phone ?? '',
        state: res.franchise.state ?? '',
        state_code: res.franchise.state_code ?? '',
        invoice_terms_text: (res.franchise.invoice_terms ?? []).join('\n'),
      });
    } catch (e) {
      toast.error((e as Error).message || 'Save failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Franchise details</CardTitle>
        <CardDescription>
          GSTIN, address, and the numbered terms printed on every invoice.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
          <Field label="Name" error={errors.name?.message}>
            <Input
              {...register('name', { required: 'Required', maxLength: 200 })}
              aria-invalid={!!errors.name}
            />
          </Field>
          <Field label="GSTIN" error={errors.gstin?.message}>
            <Input
              {...register('gstin', {
                required: 'Required',
                pattern: {
                  value: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/,
                  message: 'Invalid GSTIN format',
                },
              })}
              aria-invalid={!!errors.gstin}
              className="font-mono"
            />
          </Field>
          <Field label="Address" className="sm:col-span-2" error={errors.address?.message}>
            <Input {...register('address', { maxLength: 1000 })} />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Input {...register('phone', { maxLength: 30 })} />
          </Field>
          <Field label="State" error={errors.state?.message}>
            <Input {...register('state', { maxLength: 100 })} />
          </Field>
          <Field label="State code" error={errors.state_code?.message}>
            <Input
              {...register('state_code', { maxLength: 10 })}
              className="font-mono"
              placeholder="e.g. 29"
            />
          </Field>
          <Field
            label="Invoice terms (one per line)"
            className="sm:col-span-2"
            error={errors.invoice_terms_text?.message}
          >
            <Textarea
              {...register('invoice_terms_text')}
              rows={4}
              placeholder="Payment by Crossed Cheques / Demand Draft only"
            />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={!isDirty || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save details'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Bank details form ───────────────────────────────────────────────────────

interface BankValues {
  bank_name: string;
  account_no: string;
  ifsc: string;
  branch: string;
}

function BankDetailsForm({
  franchise,
  bank,
}: {
  franchise: FranchiseFull;
  bank: { bank_name: string; account_no: string; ifsc: string; branch: string | null } | null;
}) {
  const upsert = useUpsertBankDetails();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<BankValues>({
    defaultValues: {
      bank_name: bank?.bank_name ?? '',
      account_no: bank?.account_no ?? '',
      ifsc: bank?.ifsc ?? '',
      branch: bank?.branch ?? '',
    },
  });

  async function onSubmit(values: BankValues) {
    try {
      const res = await upsert.mutateAsync({
        franchise_id: franchise.id,
        bank_name: values.bank_name,
        account_no: values.account_no,
        ifsc: values.ifsc,
        branch: values.branch,
      });
      toast.success('Bank details saved');
      reset({
        bank_name: res.bank.bank_name,
        account_no: res.bank.account_no,
        ifsc: res.bank.ifsc,
        branch: res.bank.branch ?? '',
      });
    } catch (e) {
      toast.error((e as Error).message || 'Save failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank details</CardTitle>
        <CardDescription>
          Saving creates a new active record. Old records stay in the database for the audit trail
          and old invoices keep the bank snapshot they were finalised with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
          <Field label="Bank name" error={errors.bank_name?.message}>
            <Input
              {...register('bank_name', { required: 'Required', maxLength: 200 })}
              aria-invalid={!!errors.bank_name}
            />
          </Field>
          <Field label="Branch" error={errors.branch?.message}>
            <Input {...register('branch', { maxLength: 200 })} />
          </Field>
          <Field label="Account number" error={errors.account_no?.message}>
            <Input
              {...register('account_no', { required: 'Required', maxLength: 50 })}
              aria-invalid={!!errors.account_no}
              className="font-mono"
            />
          </Field>
          <Field label="IFSC" error={errors.ifsc?.message}>
            <Input
              {...register('ifsc', { required: 'Required', maxLength: 20 })}
              aria-invalid={!!errors.ifsc}
              className="font-mono"
            />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={!isDirty || upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save bank details'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Logos section ───────────────────────────────────────────────────────────

function LogosSection({ franchise }: { franchise: FranchiseFull }) {
  const update = useUpdateFranchise();
  const [partnerName, setPartnerName] = useState('');
  const partnerFileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<AssetKind | null>(null);

  async function handleSimpleUpload(kind: 'logo' | 'signature', file: File) {
    setBusy(kind);
    try {
      const url = await uploadFranchiseAsset(franchise.id, kind, file);
      await update.mutateAsync({
        franchise_id: franchise.id,
        ...(kind === 'logo' ? { logo_url: url } : { signature_url: url }),
      });
      toast.success(`${kind === 'logo' ? 'Logo' : 'Signature'} updated`);
    } catch (e) {
      toast.error((e as Error).message || 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleAddPartnerLogo() {
    const file = partnerFileRef.current?.files?.[0];
    if (!partnerName.trim()) {
      toast.error('Partner name is required');
      return;
    }
    if (!file) {
      toast.error('Pick an image file');
      return;
    }
    setBusy('partner_logo');
    try {
      const url = await uploadFranchiseAsset(franchise.id, 'partner_logo', file);
      const next: PartnerLogo[] = [
        ...(franchise.partner_logos ?? []),
        { name: partnerName.trim(), url },
      ];
      await update.mutateAsync({ franchise_id: franchise.id, partner_logos: next });
      toast.success(`Added ${partnerName.trim()}`);
      setPartnerName('');
      if (partnerFileRef.current) partnerFileRef.current.value = '';
    } catch (e) {
      toast.error((e as Error).message || 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleRemovePartnerLogo(index: number) {
    const next = (franchise.partner_logos ?? []).filter((_, i) => i !== index);
    try {
      await update.mutateAsync({ franchise_id: franchise.id, partner_logos: next });
      toast.success('Removed');
    } catch (e) {
      toast.error((e as Error).message || 'Remove failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logos & signature</CardTitle>
        <CardDescription>
          Uploaded files live in Supabase Storage (bucket <code>franchise-assets</code>) and the
          public URL is saved on the franchise. Future invoices use the new image; finalised
          invoices keep the snapshot they were issued with.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SingleAssetUploader
          label="Main logo"
          currentUrl={franchise.logo_url}
          busy={busy === 'logo'}
          onUpload={(f) => handleSimpleUpload('logo', f)}
        />
        <SingleAssetUploader
          label="Authorised signature"
          currentUrl={franchise.signature_url}
          busy={busy === 'signature'}
          onUpload={(f) => handleSimpleUpload('signature', f)}
        />

        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <h3 className="text-sm font-semibold">Partner logos</h3>
            <p className="text-xs text-muted-foreground">
              Co-brand chips printed in the invoice header (e.g. Godrej, Smart Care).
            </p>
          </div>
          <ul className="space-y-2">
            {(franchise.partner_logos ?? []).length === 0 ? (
              <li className="text-xs text-muted-foreground">No partner logos yet.</li>
            ) : (
              (franchise.partner_logos ?? []).map((p, i) => (
                <li
                  key={`${p.url}-${i}`}
                  className="flex items-center justify-between rounded-md border border-border p-2"
                >
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.name} className="h-8 w-12 object-contain" />
                    <span className="text-sm">{p.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemovePartnerLogo(i)}
                    disabled={update.isPending}
                  >
                    Remove
                  </Button>
                </li>
              ))
            )}
          </ul>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              placeholder="Partner name (e.g. Godrej)"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
            />
            <input
              ref={partnerFileRef}
              type="file"
              accept="image/*"
              className="text-sm"
            />
            <Button type="button" onClick={handleAddPartnerLogo} disabled={busy === 'partner_logo'}>
              {busy === 'partner_logo' ? 'Uploading…' : 'Add'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SingleAssetUploader({
  label,
  currentUrl,
  busy,
  onUpload,
}: {
  label: string;
  currentUrl: string | null;
  busy: boolean;
  onUpload: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-center">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt=""
            className="h-12 w-20 rounded border border-border object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">No image set</span>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            if (ref.current) ref.current.value = '';
          }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{busy ? 'Uploading…' : ''}</span>
    </div>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
      <FormError message={error} />
    </div>
  );
}

