/**
 * Indian-numbering ("Lakh / Crore") number-to-words converter for invoice
 * grand totals. Persisted on `invoices.grand_total_words` at finalization.
 *
 * Range supported: 0 to 99,99,99,99,999.99 (covers numeric(12,2)).
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return twoDigits(r);
  if (r === 0) return `${ONES[h]} Hundred`;
  return `${ONES[h]} Hundred ${twoDigits(r)}`;
}

function rupeesToWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;
  if (crore > 0) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigits(rest));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * "Rupees One Lakh Twenty Thousand Six Hundred Fourteen and Fifty Paise only"
 * Matches the format on the M.R. Air Conditioning paper invoice.
 */
export function amountToIndianWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  const rupeeStr = `Rupees ${rupeesToWords(rupees)}`;
  if (paise === 0) return `${rupeeStr} only`;
  return `${rupeeStr} and ${twoDigits(paise)} Paise only`;
}
