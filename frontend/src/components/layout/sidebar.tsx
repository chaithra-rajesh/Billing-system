'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, FileText, LogOut, Pencil, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useFranchiseBySlug, useMyFranchises } from '@/features/franchises/hooks';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Persistent left sidebar for desktop, slide-in drawer for mobile.
 * Navigation links are URL-aware: when the path is `/franchises/{slug}/...`
 * the sidebar adds franchise-scoped links (Invoices, Edit franchise for
 * admins). Action-style links ("New invoice", "New franchise") deliberately
 * stay out of nav — they live in the body action bar of the relevant page.
 *
 * Hidden in print so saving an invoice as PDF prints only the printable.
 */
export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <>
      {/* Desktop: always visible from md+ */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-secondary/30 md:flex print:hidden">
        <SidebarContents />
      </aside>

      {/* Mobile: fixed-overlay drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden print:hidden',
          !mobileOpen && 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        {/* Scrim */}
        <div
          className={cn(
            'absolute inset-0 bg-black/50 transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onCloseMobile}
        />
        {/* Drawer */}
        <aside
          className={cn(
            'relative flex h-full w-64 max-w-[80vw] flex-col border-r border-border bg-background shadow-xl transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            type="button"
            className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-secondary"
            onClick={onCloseMobile}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
          <SidebarContents onNavigate={onCloseMobile} />
        </aside>
      </div>
    </>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/';
  const { user } = useAuth();
  const { data: myFranchises } = useMyFranchises();
  const isSuper = myFranchises?.is_super_admin ?? false;

  const m = pathname.match(/^\/franchises\/([^/]+)/);
  const slug = m?.[1] && m[1] !== 'new' ? m[1] : undefined;
  const { franchise } = useFranchiseBySlug(slug);
  // Super admins act as franchise_admin everywhere — list-my-franchises does
  // tag them as such, but if a super admin navigates straight into a slug
  // that hasn't loaded into the picker cache yet, `franchise` is briefly
  // undefined; falling back to `isSuper` avoids hiding the Edit link in that
  // window.
  const isAdmin = franchise?.role === 'franchise_admin' || isSuper;

  const isExact = (href: string) => pathname === href;

  return (
    <>
      <div className="border-b border-border px-4 py-4">
        <Link
          href="/franchises"
          onClick={onNavigate}
          className="text-sm font-semibold tracking-tight"
        >
          Billing
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <SidebarLink
          href="/franchises"
          active={isExact('/franchises') || isExact('/franchises/new')}
          icon={<Building2 className="h-4 w-4" />}
          onNavigate={onNavigate}
        >
          Franchises
        </SidebarLink>
        {isSuper && (
          <SidebarLink
            href="/users"
            active={pathname === '/users' || pathname.startsWith('/users/')}
            icon={<Users className="h-4 w-4" />}
            onNavigate={onNavigate}
          >
            Users
          </SidebarLink>
        )}

        {slug && franchise && (
          <div className="pt-4">
            <div className="flex items-center gap-2 px-3 pb-1">
              <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {franchise.name}
              </span>
              <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {franchise.slug}
              </span>
            </div>
            <SidebarLink
              href={`/franchises/${slug}/invoices`}
              active={
                pathname === `/franchises/${slug}/invoices` ||
                (pathname.startsWith(`/franchises/${slug}/invoices/`) &&
                  !pathname.endsWith('/new'))
              }
              icon={<FileText className="h-4 w-4" />}
              onNavigate={onNavigate}
            >
              Invoices
            </SidebarLink>
            {isAdmin && (
              <SidebarLink
                href={`/franchises/${slug}/settings`}
                active={pathname === `/franchises/${slug}/settings`}
                icon={<Pencil className="h-4 w-4" />}
                onNavigate={onNavigate}
              >
                Edit franchise
              </SidebarLink>
            )}
          </div>
        )}
      </nav>

      <div className="space-y-2 border-t border-border p-3">
        <div className="truncate text-xs text-muted-foreground" title={user?.email ?? ''}>
          {user?.email ?? '—'}
        </div>
        <SignOutButton />
      </div>
    </>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-secondary',
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { error } = await getSupabaseClient().auth.signOut();
        setBusy(false);
        if (error) {
          toast.error(error.message || 'Sign out failed');
          return;
        }
        router.replace('/login');
      }}
    >
      <LogOut className="h-4 w-4" />
      <span>{busy ? 'Signing out…' : 'Sign out'}</span>
    </Button>
  );
}
