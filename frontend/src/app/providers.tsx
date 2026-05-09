'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { useState, type ReactNode } from 'react';
import { TopProgressBar } from '@/components/ui/top-progress-bar';

/**
 * Top-level client providers. Composed by app/layout.tsx.
 *
 * Lives at the root because every page is client-rendered (see ADR-006).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TopProgressBar />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
