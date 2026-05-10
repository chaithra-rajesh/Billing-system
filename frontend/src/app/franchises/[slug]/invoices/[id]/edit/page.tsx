'use client';

export const runtime = 'edge';

import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell, PageTitle } from '@/components/layout/app-shell';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingInvoiceForm } from '@/components/ui/loading-states';
import { useFranchiseBySlug, useFranchiseContext } from '@/features/franchises/hooks';
import { useInvoice, useUpdateInvoice } from '@/features/invoices/hooks';
import {
  InvoiceForm,
  defaultInvoiceFormValues,
  type InvoiceFormValues,
} from '@/features/invoices/components/invoice-form';
import { EdgeFunctionError } from '@/lib/functions';
import type { Customer } from '@/features/customers/api';
import type { InvoiceCustomer, InvoiceItem, InvoiceRow } from '@/features/invoices/api';

export default function EditInvoicePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  return (
    <RequireAuth>
      <EditInvoiceView slug={slug} invoiceId={id} />
    </RequireAuth>
  );
}

function EditInvoiceView({ slug, invoiceId }: { slug: string; invoiceId: string }) {
  const router = useRouter();
  const { franchise: brief } = useFranchiseBySlug(slug);
  const ctxQuery = useFranchiseContext(brief?.id);
  const invoiceQuery = useInvoice(invoiceId);
  const updateMutation = useUpdateInvoice();

  const ctx = ctxQuery.data;
  const detail = invoiceQuery.data;

  const initialValues = useMemo<InvoiceFormValues | undefined>(() => {
    if (!detail) return undefined;
    return buildInitialValues(detail.invoice, detail.items);
  }, [detail]);

  const initialCustomer = useMemo<Customer | null>(() => {
    if (!detail) return null;
    return adaptInvoiceCustomer(detail.customer);
  }, [detail]);

  async function handleSave(values: InvoiceFormValues) {
    if (!detail) return;
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await updateMutation.mutateAsync({
        idempotencyKey,
        input: {
          invoice_id: detail.invoice.id,
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
        },
      });
      toast.success('Draft updated');
      router.replace(`/franchises/${slug}/invoices/${res.invoice.id}`);
    } catch (e) {
      const msg =
        e instanceof EdgeFunctionError ? e.message : (e as Error)?.message || 'Save failed';
      toast.error(msg);
    }
  }

  if (invoiceQuery.isLoading || !ctx) {
    return (
      <AppShell>
        <PageTitle title="Edit draft" />
        <LoadingInvoiceForm />
      </AppShell>
    );
  }

  if (invoiceQuery.error || !detail) {
    return (
      <AppShell>
        <PageTitle title="Edit draft" />
        <Card>
          <CardHeader>
            <CardTitle>Couldn&apos;t load draft</CardTitle>
            <CardDescription>
              {(invoiceQuery.error as Error)?.message || 'Not found'}
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  if (detail.invoice.status !== 'draft') {
    return (
      <AppShell>
        <PageTitle title="Edit draft" />
        <Card>
          <CardHeader>
            <CardTitle>This invoice can&apos;t be edited</CardTitle>
            <CardDescription>
              Only drafts are editable. This invoice is{' '}
              <span className="font-mono">{detail.invoice.status}</span>.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle
        title={`Edit ${detail.invoice.invoice_no}`}
        slug={ctx.franchise.slug}
        subtitle={ctx.franchise.name}
      />
      <InvoiceForm
        ctx={ctx}
        initialValues={initialValues}
        initialCustomer={initialCustomer}
        invoiceNoLabel={detail.invoice.invoice_no}
        saving={updateMutation.isPending}
        showFinaliseButton={false}
        cancelHref={() => router.push(`/franchises/${slug}/invoices/${invoiceId}`)}
        onSaveDraft={handleSave}
      />
    </AppShell>
  );
}

function buildInitialValues(invoice: InvoiceRow, items: InvoiceItem[]): InvoiceFormValues {
  const fallback = defaultInvoiceFormValues();
  // Pull tax percentages from gst_snapshot if present (only set on finalise),
  // otherwise back-derive from the stored amounts. For drafts the snapshot is
  // null, so we infer from tax_mode + cgst/sgst/igst amounts vs subtotal.
  const subtotal = Number(invoice.subtotal) || 0;
  const taxMode = subtotal > 0 && invoice.igst_amount > 0 ? 'inter' : 'intra';
  const cgstPct = subtotal > 0 ? round2((invoice.cgst_amount * 100) / subtotal) : 0;
  const sgstPct = subtotal > 0 ? round2((invoice.sgst_amount * 100) / subtotal) : 0;
  const igstPct = subtotal > 0 ? round2((invoice.igst_amount * 100) / subtotal) : 0;

  return {
    customer_id: invoice.customer_id,
    invoice_date: invoice.invoice_date,
    date_of_supply: invoice.date_of_supply ?? '',
    transport_mode: invoice.transport_mode ?? '',
    vehicle_no: invoice.vehicle_no ?? '',
    place_of_supply: invoice.place_of_supply ?? '',
    ship_to_name: invoice.ship_to_name ?? '',
    ship_to_address: invoice.ship_to_address ?? '',
    ship_to_gstin: invoice.ship_to_gstin ?? '',
    ship_to_state: invoice.ship_to_state ?? '',
    ship_to_state_code: invoice.ship_to_state_code ?? '',
    items:
      items.length > 0
        ? items
            .slice()
            .sort((a, b) => a.sl_no - b.sl_no)
            .map((it) => ({
              particulars: it.particulars,
              hsn_code: it.hsn_code ?? '',
              quantity: Number(it.quantity),
              rate: Number(it.rate),
            }))
        : fallback.items,
    tax_mode: taxMode,
    cgst_percent: cgstPct,
    sgst_percent: sgstPct,
    igst_percent: igstPct,
  };
}

function adaptInvoiceCustomer(c: InvoiceCustomer): Customer {
  return {
    id: c.id,
    name: c.name,
    gstin: c.gstin,
    address: c.address,
    phone: c.phone,
    alternate_phone: null,
    state: c.state,
    state_code: c.state_code,
    created_at: '',
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
