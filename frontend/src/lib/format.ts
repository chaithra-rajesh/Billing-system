/**
 * Money formatting helpers.
 *
 * Internal representation across the app is integer minor units (`amount_cents`).
 * UI is the only place we ever convert to a human-readable string. Backend math
 * stays in integers; never round-trip through `Number` and back.
 */

const MINOR_UNITS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  AUD: 2,
  CAD: 2,
  JPY: 0,
  KWD: 3,
  BHD: 3,
};

function minorUnits(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

export function formatMoney(
  amountMinor: number | bigint,
  currency: string,
  locale: string = 'en-US',
): string {
  const units = minorUnits(currency);
  const amount = Number(amountMinor) / 10 ** units;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: units,
    maximumFractionDigits: units,
  }).format(amount);
}

export function parseMoneyInput(input: string, currency: string): number {
  const units = minorUnits(currency);
  const cleaned = input.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  const asFloat = Number(cleaned);
  if (Number.isNaN(asFloat)) return 0;
  return Math.round(asFloat * 10 ** units);
}

export function formatDate(value: string | Date, locale: string = 'en-US'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(value: string | Date, locale: string = 'en-US'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
