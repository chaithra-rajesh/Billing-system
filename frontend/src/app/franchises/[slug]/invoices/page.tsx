'use client';

export const runtime = 'edge';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell, PageActions, PageTitle } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingTableCard } from '@/components/ui/loading-states';
import { useFranchiseBySlug } from '@/features/franchises/hooks';
import { useInvoices } from '@/features/invoices/hooks';
import { InvoiceStatusBadge } from '@/features/invoices/status-badge';
import { formatDateIN, formatINR } from '@/lib/inr';

const PAGE_SIZE = 25;

export default function InvoicesListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <RequireAuth>
      <InvoicesListView slug={slug} />
    </RequireAuth>
  );
}

function InvoicesListView({ slug }: { slug: string }) {
  const router = useRouter();
  const { franchise, isLoading: loadingFranchise } = useFranchiseBySlug(slug);
  const [page, setPage] = useState(0);
  const { data, isLoading, error, isFetching } = useInvoices(franchise?.id, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const total = data?.total ?? 0;
  const pageCount = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  if (!loadingFranchise && !franchise) {
    return (
      <AppShell>
        <PageTitle title="Not found" />
        <Card>
          <CardHeader>
            <CardTitle>You don&apos;t have access to this franchise</CardTitle>
            <CardDescription>
              <button className="underline" onClick={() => router.replace('/franchises')}>
                Back to franchises
              </button>
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle
        title={franchise?.name ?? 'Invoices'}
        slug={franchise?.slug}
        subtitle={franchise?.gstin ? `GSTIN ${franchise.gstin}` : undefined}
      />

      <PageActions>
        <Button asChild>
          <Link href={`/franchises/${slug}/invoices/new`}>+ New invoice</Link>
        </Button>
      </PageActions>

      {(isLoading || loadingFranchise) && <LoadingTableCard rows={6} cols={5} />}
      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Couldn&apos;t load invoices</CardTitle>
            <CardDescription>{(error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      )}
      {!isLoading && !error && data && data.invoices.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No invoices yet</CardTitle>
            <CardDescription>
              Click <em>+ New invoice</em> above to create the first bill for this franchise.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {!isLoading && !error && data && data.invoices.length > 0 && (
        <Card>
          <CardContent className="p-0">
            {/* Mobile: stacked card list — table doesn't fit a phone width and
                horizontal scroll on the primary content view is a poor UX. */}
            <ul className="divide-y divide-border/50 sm:hidden">
              {data.invoices.map((inv) => (
                <li
                  key={inv.id}
                  onClick={() => router.push(`/franchises/${slug}/invoices/${inv.id}`)}
                  className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 hover:bg-secondary/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs">{inv.invoice_no}</div>
                    <div className="mt-0.5 truncate text-sm">{inv.customer?.name ?? '—'}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{formatDateIN(inv.invoice_date)}</span>
                      <InvoiceStatusBadge status={inv.status} />
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm tabular-nums">
                    {formatINR(inv.grand_total)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Invoice no</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => router.push(`/franchises/${slug}/invoices/${inv.id}`)}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-secondary/30"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{inv.invoice_no}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateIN(inv.invoice_date)}</td>
                      <td className="px-4 py-3">{inv.customer?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <InvoiceStatusBadge status={inv.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatINR(inv.grand_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>
                {rangeStart}–{rangeEnd} of {total}
                {isFetching && ' • updating…'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="px-1 hidden sm:inline">
                  Page {page + 1} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page + 1 >= pageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
