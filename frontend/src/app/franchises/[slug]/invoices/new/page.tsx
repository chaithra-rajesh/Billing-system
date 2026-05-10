'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/auth/require-auth';
import { useFranchiseBySlug, useFranchiseContext } from '@/features/franchises/hooks';
import { useCreateInvoice } from '@/features/invoices/hooks';
import { EdgeFunctionError } from '@/lib/functions';
import { AppShell, PageTitle } from '@/components/layout/app-shell';
import { LoadingInvoiceForm } from '@/components/ui/loading-states';
import {
  InvoiceForm,
  type InvoiceFormValues,
} from '@/features/invoices/components/invoice-form';

export default function NewInvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <RequireAuth>
      <NewInvoiceView slug={slug} />
    </RequireAuth>
  );
}

function NewInvoiceView({ slug }: { slug: string }) {
  const router = useRouter();
  const { franchise: brief } = useFranchiseBySlug(slug);
  const ctxQuery = useFranchiseContext(brief?.id);
  const createMutation = useCreateInvoice();
  const ctx = ctxQuery.data;

  async function submitInvoice(values: InvoiceFormValues, finalise: boolean) {
    if (!ctx) return;
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await createMutation.mutateAsync({
        idempotencyKey,
        input: {
          franchise_id: ctx.franchise.id,
          customer_id: values.customer_id,
          invoice_date: values.invoice_date || undefined,
          date_of_supply: values.date_of_supply || undefined,
          transport_mode: values.transport_mode || undefined,
          vehicle_no: values.vehicle_no || undefined,
          place_of_supply: values.place_of_supply || undefined,
          ship_to_name: values.ship_to_name || undefined,
          ship_to_address: values.ship_to_address || undefined,
          ship_to_gstin: values.ship_to_gstin || undefined,
          ship_to_state: values.ship_to_state || undefined,
          ship_to_state_code: values.ship_to_state_code || undefined,
          items: values.items.map((it) => ({
            particulars: it.particulars,
            hsn_code: it.hsn_code || undefined,
            quantity: Number(it.quantity),
            rate: Number(it.rate),
          })),
          tax_mode: values.tax_mode,
          cgst_percent: values.tax_mode === 'intra' ? Number(values.cgst_percent) : 0,
          sgst_percent: values.tax_mode === 'intra' ? Number(values.sgst_percent) : 0,
          igst_percent: values.tax_mode === 'inter' ? Number(values.igst_percent) : 0,
          finalise,
        },
      });
      toast.success(
        finalise ? `Invoice ${res.invoice.invoice_no} saved` : `Draft saved`,
      );
      router.replace(`/franchises/${slug}/invoices/${res.invoice.id}`);
    } catch (e) {
      const msg =
        e instanceof EdgeFunctionError ? e.message : (e as Error)?.message || 'Save failed';
      toast.error(msg);
    }
  }

  if (!ctx) {
    return (
      <AppShell>
        <PageTitle title="New invoice" />
        <LoadingInvoiceForm />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle title="New invoice" slug={ctx.franchise.slug} subtitle={ctx.franchise.name} />
      <InvoiceForm
        ctx={ctx}
        saving={createMutation.isPending}
        showFinaliseButton
        cancelHref={() => router.back()}
        onSaveDraft={(values) => submitInvoice(values, false)}
        onFinalise={(values) => submitInvoice(values, true)}
      />
    </AppShell>
  );
}
