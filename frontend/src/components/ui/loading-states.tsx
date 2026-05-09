import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function LoadingTableCard({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {Array.from({ length: rows }).map((_, r) => (
                <tr key={r} className="border-b border-border/50 last:border-0">
                  {Array.from({ length: cols }).map((__, c) => (
                    <td key={c} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-32" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-3.5 w-64" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export function LoadingForm({ fields = 6 }: { fields?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function LoadingInvoiceForm() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-3">
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
