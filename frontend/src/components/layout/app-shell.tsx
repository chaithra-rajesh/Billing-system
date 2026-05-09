'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './sidebar';

/**
 * Standard page chrome: persistent left sidebar (desktop) / slide-in drawer
 * (mobile) + main content column. Pages render their own page title, action
 * bar, and content cards/tables inside `<AppShell>`.
 *
 * For pages that print (invoice detail), render the print body OUTSIDE
 * AppShell — the sidebar is already `print:hidden`, but the main column's
 * width constraint would crop the printable.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only top strip with the burger; desktop hides it. */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden print:hidden">
          <button
            type="button"
            className="rounded-md p-2 text-foreground hover:bg-secondary"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold tracking-tight">Billing</span>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Title block: page title + optional slug chip + optional subtitle. Slug
 * surfaces the URL key used in invoice numbers (`{SLUG}-{YYYY}-{NNNN}`),
 * which is otherwise hidden in the URL bar.
 */
export function PageTitle({
  title,
  slug,
  subtitle,
}: {
  title: string;
  slug?: string;
  subtitle?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {slug && (
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {slug}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/**
 * Right-aligned action bar. Place ABOVE the table/cards so the user reads
 * the title, sees the primary action, then scans the data.
 */
export function PageActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
