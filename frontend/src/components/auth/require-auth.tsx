'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

/**
 * Wrap any authenticated page in <RequireAuth>...</RequireAuth>.
 *
 * While the auth state is resolving, renders nothing (avoids a flash of
 * authenticated UI). If the user isn't signed in, replaces the URL with
 * `/login?next=<current path>` and the login page redirects back on success.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      const next = encodeURIComponent(pathname || '/');
      router.replace(`/login?next=${next}`);
    }
  }, [loading, session, pathname, router]);

  if (loading || !session) return null;
  return <>{children}</>;
}
