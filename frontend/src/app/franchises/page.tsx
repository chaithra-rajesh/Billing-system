'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell, PageActions, PageTitle } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingTableCard } from '@/components/ui/loading-states';
import { useMyFranchises } from '@/features/franchises/hooks';

export default function FranchisesPage() {
  return (
    <RequireAuth>
      <FranchisesView />
    </RequireAuth>
  );
}

function FranchisesView() {
  const router = useRouter();
  const { data, isLoading, error } = useMyFranchises();

  const franchises = data?.franchises ?? [];
  const isSuper = data?.is_super_admin ?? false;

  // Auto-redirect non-super_admins with exactly one franchise. Super admins
  // always land on the picker so the "New franchise" action is one click away.
  const single = !isSuper && franchises.length === 1 ? franchises[0] : null;
  useEffect(() => {
    if (single) router.replace(`/franchises/${single.slug}/invoices`);
  }, [single, router]);

  return (
    <AppShell>
      <PageTitle title="Franchises" subtitle="Pick the franchise you want to bill from." />

      {isSuper && (
        <PageActions>
          <Button asChild>
            <Link href="/franchises/new">+ New franchise</Link>
          </Button>
        </PageActions>
      )}

      {isLoading && <LoadingTableCard rows={4} cols={3} />}

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Couldn&apos;t load franchises</CardTitle>
            <CardDescription>{(error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isLoading && !error && franchises.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{isSuper ? 'No franchises yet' : 'No franchise access'}</CardTitle>
            <CardDescription>
              {isSuper
                ? 'Click "+ New franchise" above to provision your first one.'
                : "Your account isn't linked to any franchise yet. Ask your admin to grant access."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isLoading && !error && franchises.length >= 1 && !single && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {franchises.map((f) => (
            <li
              key={f.id}
              className="group relative rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-foreground/20 hover:bg-secondary/40"
            >
              <button
                type="button"
                onClick={() => router.push(`/franchises/${f.slug}/invoices`)}
                className="flex w-full flex-col items-start rounded-xl p-4 pr-12 text-left"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="text-base font-medium">{f.name}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {f.slug}
                  </span>
                </div>
                <span className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {f.role.replace('_', ' ')}
                </span>
                {f.gstin && <span className="mt-2 font-mono text-xs">{f.gstin}</span>}
              </button>
              {f.role === 'franchise_admin' && (
                <Link
                  href={`/franchises/${f.slug}/settings`}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label={`Edit ${f.name}`}
                  title="Edit franchise"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {single && <p className="text-sm text-muted-foreground">Redirecting to {single.name}…</p>}
    </AppShell>
  );
}
