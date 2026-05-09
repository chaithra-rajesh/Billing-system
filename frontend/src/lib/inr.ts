/**
 * INR formatting helpers. Money is `numeric(12,2)` in rupees+paise — this
 * project doesn't use multi-currency or integer minor units (see ADR-003,
 * superseded by the Indian-only decision in CLAUDE.md §2 rule 1).
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(rupees: number | string | null | undefined): string {
  if (rupees === null || rupees === undefined || rupees === '') return '—';
  const n = typeof rupees === 'number' ? rupees : Number(rupees);
  if (!Number.isFinite(n)) return '—';
  return INR.format(n);
}

export function formatDateIN(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d);
}
