import { Badge } from '@/components/ui/badge';
import type { InvoiceStatus } from './api';

const VARIANT: Record<InvoiceStatus, 'default' | 'success' | 'destructive'> = {
  draft: 'default',
  finalised: 'success',
  cancelled: 'destructive',
};

const LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  finalised: 'Finalised',
  cancelled: 'Cancelled',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
