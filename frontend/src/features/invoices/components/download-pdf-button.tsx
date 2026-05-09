'use client';

import { Button } from '@/components/ui/button';

/**
 * Triggers the browser's native print dialog. The detail page renders an
 * <InvoicePrintable> alongside the on-screen view; print CSS hides everything
 * else so only the paper-form layout reaches the printer / "Save as PDF".
 *
 * No PDF library, no font registration — the OS handles font fallback.
 */
export function DownloadPdfButton() {
  return <Button onClick={() => window.print()}>Print / Save PDF</Button>;
}
