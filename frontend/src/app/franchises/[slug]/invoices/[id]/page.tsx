'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell, PageActions, PageTitle } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingCard } from '@/components/ui/loading-states';
import { useInvoice } from '@/features/invoices/hooks';
import { InvoiceStatusBadge } from '@/features/invoices/status-badge';
import { DownloadPdfButton } from '@/features/invoices/components/download-pdf-button';
import { InvoicePrintable } from '@/features/invoices/components/invoice-printable';
import { formatDateIN, formatINR } from '@/lib/inr';

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  return (
    <RequireAuth>
      <InvoiceDetailView slug={slug} invoiceId={id} />
    </RequireAuth>
  );
}

function InvoiceDetailView({ slug, invoiceId }: { slug: string; invoiceId: string }) {
  const router = useRouter();
  const { data, isLoading, error } = useInvoice(invoiceId);

  if (isLoading) {
    return (
      <AppShell>
        <PageTitle title="Invoice" />
        <div className="space-y-4">
          <LoadingCard lines={4} />
          <LoadingCard lines={6} />
          <LoadingCard lines={3} />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <PageTitle title="Invoice" />
        <Card>
          <CardHeader>
            <CardTitle>Couldn&apos;t load invoice</CardTitle>
            <CardDescription>{(error as Error)?.message || 'Not found'}</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const { invoice, items, customer, franchise, creator, last_editor } = data;
  const isIntra = invoice.cgst_amount > 0 || invoice.sgst_amount > 0;
  const creatorLabel = creator?.full_name || creator?.email || invoice.created_by;
  const editorLabel = last_editor?.full_name || last_editor?.email || invoice.last_edited_by;

  return (
    <>
      <div className="print:hidden">
        <AppShell>
          <PageTitle
            title={invoice.invoice_no}
            slug={franchise.slug}
            subtitle={`${franchise.name} • ${formatDateIN(invoice.invoice_date)}`}
          />

          <PageActions>
            <Button variant="outline" onClick={() => router.push(`/franchises/${slug}/invoices`)}>
              Back to list
            </Button>
            {invoice.status === 'draft' && (
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/franchises/${slug}/invoices/${invoice.id}/edit`)
                }
              >
                Edit draft
              </Button>
            )}
            <DownloadPdfButton />
          </PageActions>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Bill summary</CardTitle>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <CardDescription>
                Snapshots are frozen — re-downloading the PDF later produces an identical file.
              </CardDescription>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Created by{' '}
                  <span className="font-medium text-foreground">{creatorLabel}</span> on{' '}
                  {formatDateIN(invoice.created_at)}
                </span>
                {editorLabel && (
                  <span>
                    · Last edited by{' '}
                    <span className="font-medium text-foreground">{editorLabel}</span>
                    {invoice.updated_at ? ` on ${formatDateIN(invoice.updated_at)}` : ''}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bill to
                </h3>
                <p className="mt-1 text-sm">{customer.name}</p>
                {customer.address && (
                  <p className="text-sm text-muted-foreground">{customer.address}</p>
                )}
                {customer.gstin && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    GSTIN {customer.gstin}
                  </p>
                )}
                {customer.state && (
                  <p className="text-xs text-muted-foreground">
                    {customer.state} {customer.state_code ? `(${customer.state_code})` : ''}
                  </p>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ship to
                </h3>
                {invoice.ship_to_name ||
                invoice.ship_to_address ||
                invoice.ship_to_gstin ||
                invoice.ship_to_state ? (
                  <>
                    {invoice.ship_to_name && <p className="mt-1 text-sm">{invoice.ship_to_name}</p>}
                    {invoice.ship_to_address && (
                      <p className="text-sm text-muted-foreground">{invoice.ship_to_address}</p>
                    )}
                    {invoice.ship_to_gstin && (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        GSTIN {invoice.ship_to_gstin}
                      </p>
                    )}
                    {invoice.ship_to_state && (
                      <p className="text-xs text-muted-foreground">
                        {invoice.ship_to_state}{' '}
                        {invoice.ship_to_state_code ? `(${invoice.ship_to_state_code})` : ''}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">—</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">Particulars</th>
                      <th className="px-4 py-2 font-medium">HSN</th>
                      <th className="px-4 py-2 text-right font-medium">Qty</th>
                      <th className="px-4 py-2 text-right font-medium">Rate</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2 text-muted-foreground">{it.sl_no}</td>
                        <td className="px-4 py-2">{it.particulars}</td>
                        <td className="px-4 py-2 font-mono text-xs">{it.hsn_code || '—'}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {it.quantity}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {formatINR(it.rate)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {formatINR(it.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatINR(invoice.subtotal)} />
              {isIntra ? (
                <>
                  <Row label="CGST" value={formatINR(invoice.cgst_amount)} />
                  <Row label="SGST" value={formatINR(invoice.sgst_amount)} />
                </>
              ) : (
                <Row label="IGST" value={formatINR(invoice.igst_amount)} />
              )}
              <div className="border-t border-border pt-2">
                <Row label="Grand total" value={formatINR(invoice.grand_total)} emphasis />
              </div>
              {invoice.grand_total_words && (
                <p className="pt-2 text-xs text-muted-foreground">{invoice.grand_total_words}</p>
              )}
            </CardContent>
          </Card>
        </AppShell>
      </div>

      <div className="hidden print:block">
        <InvoicePrintable
          invoice={invoice}
          items={items}
          customer={customer}
          franchise={franchise}
        />
      </div>
    </>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${emphasis ? 'font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
