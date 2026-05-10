'use client';

import { amountToIndianWords } from '@/lib/words';
import type {
  BankSnapshot,
  GetInvoiceResponse,
  InvoiceCustomer,
  InvoiceFranchise,
  InvoiceItem,
  InvoiceRow,
} from '../api';

/**
 * HTML "paper-form" rendering of an invoice. Mirrors the M.R. Air Conditioning
 * scanned form in docs/1000357379.jpg so what the customer receives looks
 * identical to the printed booklet.
 *
 * Hidden on screen — only visible during `window.print()`.
 *
 * All money fields and snapshots are read straight off the persisted invoice
 * row (`bank_snapshot`, `gst_snapshot`, `signature_snapshot`,
 * `grand_total_words`). Re-printing an old invoice never picks up newer
 * franchise / bank / GST changes.
 *
 * Styling uses theme-agnostic colours (black borders, gray-100 header bands)
 * because print output must look identical in light and dark mode.
 */

function fmtINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(dt);
}

interface InvoicePrintableProps {
  invoice: InvoiceRow;
  items: InvoiceItem[];
  customer: InvoiceCustomer;
  franchise: InvoiceFranchise;
  /** Live active bank_details, used only when invoice.bank_snapshot is null. */
  bank?: BankSnapshot | null;
}

export function InvoicePrintable({
  invoice,
  items,
  customer,
  franchise,
  bank,
}: InvoicePrintableProps) {
  const isIntra =
    invoice.cgst_amount > 0 || invoice.sgst_amount > 0 || invoice.igst_amount === 0;

  const gst = invoice.gst_snapshot;
  // Display-only fallback: older rows had gst_snapshot percentages stored as 0
  // even though tax was applied. Derive from amount ÷ subtotal in that case so
  // the printed invoice doesn't say "CGST @ 0.00% — 9,278.80". Snapshot row
  // itself is not mutated; rule 3 (immutability) still holds.
  const inferPct = (amount: number, snapshotPct: number | null | undefined) => {
    const fromSnap = Number(snapshotPct ?? 0);
    if (fromSnap > 0) return fromSnap;
    if (invoice.subtotal > 0 && amount > 0) {
      return Math.round((amount / invoice.subtotal) * 10000) / 100;
    }
    return 0;
  };
  const cgstPct = inferPct(invoice.cgst_amount, gst?.cgst_percent);
  const sgstPct = inferPct(invoice.sgst_amount, gst?.sgst_percent);
  const igstPct = inferPct(invoice.igst_amount, gst?.igst_percent);

  // Drafts and older rows may have null grand_total_words. Compute on the fly
  // so the printed invoice never has a blank "amount in words" line.
  const totalInWords =
    invoice.grand_total_words?.trim() || amountToIndianWords(invoice.grand_total);

  // Drafts have no bank_snapshot yet — fall back to the franchise's currently
  // active bank so the print preview isn't blank. Finalised invoices carry
  // their snapshot and are unaffected (rule 3 immutability preserved).
  const bankToShow = invoice.bank_snapshot ?? bank ?? null;
  const signatureToShow = invoice.signature_snapshot ?? franchise.signature_url ?? null;

  const shipName = invoice.ship_to_name || '';
  const shipAddress = invoice.ship_to_address || '';
  const shipGstin = invoice.ship_to_gstin || '';
  const shipState = invoice.ship_to_state || '';
  const shipStateCode = invoice.ship_to_state_code || '';

  const partners = franchise.partner_logos ?? [];

  return (
    <div className="invoice-printable bg-white p-2 text-[10px] leading-snug text-black">
      <h1 className="mb-1 text-center text-base font-bold">TAX INVOICE</h1>

      <div className="border border-black">
        {/* Brand row: franchise logo (left) | name + address + phone (centred)
            | partner logos (right). Mirrors the M.R. paper form's "Godrej /
            smart care" chip placement on the right of the brand block. */}
        <div className="flex border-b border-black">
          <div className="flex w-24 items-center justify-center border-r border-black p-1">
            {franchise.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={franchise.logo_url}
                alt=""
                className="h-16 w-20 object-contain"
              />
            ) : (
              <div className="h-16 w-20" />
            )}
          </div>
          <div className="flex-1 p-1 text-center">
            <div className="text-base font-bold">{franchise.name}</div>
            {franchise.address && <div>{franchise.address}</div>}
            {franchise.phone && <div>☎ : {franchise.phone}</div>}
          </div>
          <div className="flex w-24 flex-wrap items-center justify-center gap-1 border-l border-black p-1">
            {partners.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${p.url}-${i}`}
                src={p.url}
                alt={p.name}
                className="h-8 max-w-[5rem] object-contain"
              />
            ))}
          </div>
        </div>

        {/* GSTIN / State / Code row */}
        <div className="flex border-b border-black">
          <div className="flex-1 border-r border-black p-1">
            <span className="font-semibold">GSTIN : </span>
            {franchise.gstin}
          </div>
          <div className="flex-1 border-r border-black p-1">
            <span className="font-semibold">State : </span>
            {franchise.state || ''}
          </div>
          <div className="w-32 p-1">
            <span className="font-semibold">Code : </span>
            {franchise.state_code || ''}
          </div>
        </div>

        {/* Meta block: 2 cols (left = invoice no/date, right = transport/vehicle/supply/place) */}
        <div className="flex border-b border-black">
          <div className="flex-1 border-r border-black">
            <div className="border-b border-black p-1">
              <span className="font-semibold">Invoice No. : </span>
              {invoice.invoice_no}
            </div>
            <div className="p-1">
              <span className="font-semibold">Invoice Date : </span>
              {fmtDate(invoice.invoice_date)}
            </div>
          </div>
          <div className="flex-1">
            <MetaLine label="Transport Mode" value={invoice.transport_mode || ''} />
            <MetaLine label="Vehicle Number" value={invoice.vehicle_no || ''} />
            <MetaLine label="Date of Supply" value={fmtDate(invoice.date_of_supply)} />
            <MetaLine label="Place of Supply" value={invoice.place_of_supply || ''} last />
          </div>
        </div>

        {/* Bill to / Ship to */}
        <div className="flex border-b border-black">
          <PartyBlock
            heading="Bill to Party"
            name={customer.name}
            address={customer.address || ''}
            gstin={customer.gstin || ''}
            state={customer.state || ''}
            stateCode={customer.state_code || ''}
            withRightBorder
          />
          <PartyBlock
            heading="Ship to Party"
            name={shipName}
            address={shipAddress}
            gstin={shipGstin}
            state={shipState}
            stateCode={shipStateCode}
          />
        </div>

        {/* Items header */}
        <div className="flex border-b border-black bg-gray-100 font-semibold">
          <div className="w-12 border-r border-black p-1 text-center">Sl. No</div>
          <div className="flex-1 border-r border-black p-1 text-center">Particulars</div>
          <div className="w-24 border-r border-black p-1 text-center">HSN Code</div>
          <div className="w-28 p-1 text-center">Amount</div>
        </div>

        {/* Items rows — pad to 8 minimum so the form keeps its shape */}
        {items.map((it) => (
          <div key={it.id} className="flex min-h-[1.5rem] border-b border-black">
            <div className="w-12 border-r border-black p-1 text-center">{it.sl_no}</div>
            <div className="flex-1 border-r border-black p-1">{it.particulars}</div>
            <div className="w-24 border-r border-black p-1 text-center font-mono">
              {it.hsn_code || ''}
            </div>
            <div className="w-28 p-1 text-right font-mono tabular-nums">{fmtINR(it.amount)}</div>
          </div>
        ))}
        {Array.from({ length: Math.max(0, 8 - items.length) }).map((_, i) => (
          <div key={`pad-${i}`} className="flex min-h-[1.5rem] border-b border-black">
            <div className="w-12 border-r border-black p-1">&nbsp;</div>
            <div className="flex-1 border-r border-black p-1">&nbsp;</div>
            <div className="w-24 border-r border-black p-1">&nbsp;</div>
            <div className="w-28 p-1">&nbsp;</div>
          </div>
        ))}

        {/* Words (left) + Totals stack (right) */}
        <div className="flex border-b border-black">
          <div className="flex flex-1 flex-col border-r border-black p-1">
            <div className="text-center font-semibold">Total Invoice amount in words</div>
            <div className="mt-1 break-words">{totalInWords}</div>
          </div>
          <div className="w-60">
            <TotalLine label="TOTAL" value={fmtINR(invoice.subtotal)} bold />
            {isIntra ? (
              <>
                <TotalLine
                  label={`Add : CGST @ ${cgstPct.toFixed(2)}%`}
                  value={fmtINR(invoice.cgst_amount)}
                />
                <TotalLine
                  label={`Add : SGST @ ${sgstPct.toFixed(2)}%`}
                  value={fmtINR(invoice.sgst_amount)}
                />
              </>
            ) : (
              <TotalLine
                label={`Add : IGST @ ${igstPct.toFixed(2)}%`}
                value={fmtINR(invoice.igst_amount)}
              />
            )}
            <div className="flex bg-gray-100 font-bold">
              <div className="flex-1 border-r border-black p-1">GRAND TOTAL</div>
              <div className="w-28 p-1 text-right font-mono tabular-nums">
                {fmtINR(invoice.grand_total)}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom 3-col: E.O.E. notes | Bank | Signature */}
        <div className="flex">
          <div className="flex-1 border-r border-black p-1">
            <div className="font-semibold">E.O.E.</div>
            <div className="font-semibold">Note :</div>
            {(franchise.invoice_terms ?? []).map((line, i) => (
              <div key={i}>
                {i + 1}. {line}
              </div>
            ))}
          </div>
          <div className="flex-1 border-r border-black p-1">
            <div className="text-center font-semibold">Bank Details</div>
            {bankToShow && (
              <>
                <div>
                  <span className="font-semibold">Bank Name : </span>
                  {bankToShow.bank_name}
                </div>
                <div>
                  <span className="font-semibold">A/c. No. : </span>
                  {bankToShow.account_no}
                </div>
                {bankToShow.branch && (
                  <div>
                    <span className="font-semibold">Branch : </span>
                    {bankToShow.branch}
                  </div>
                )}
                <div>
                  <span className="font-semibold">IFSC : </span>
                  {bankToShow.ifsc}
                </div>
              </>
            )}
          </div>
          <div className="flex w-52 flex-col items-center p-1 text-center">
            <div className="font-bold">{franchise.name}</div>
            <div className="mt-4">
              {signatureToShow && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureToShow}
                  alt=""
                  className="mx-auto h-10 object-contain"
                />
              )}
            </div>
            <div className="mt-2 font-semibold">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`p-1 ${last ? '' : 'border-b border-black'}`}>
      <span className="font-semibold">{label} : </span>
      {value}
    </div>
  );
}

function PartyBlock({
  heading,
  name,
  address,
  gstin,
  state,
  stateCode,
  withRightBorder,
}: {
  heading: string;
  name: string;
  address: string;
  gstin: string;
  state: string;
  stateCode: string;
  withRightBorder?: boolean;
}) {
  return (
    <div className={`flex-1 p-1 ${withRightBorder ? 'border-r border-black' : ''}`}>
      <div className="text-center font-semibold">{heading}</div>
      <div className="mt-1">
        <span className="font-semibold">Name : </span>
        {name}
      </div>
      <div>
        <span className="font-semibold">Address : </span>
        {address}
      </div>
      <div>
        <span className="font-semibold">GSTIN : </span>
        {gstin}
      </div>
      <div className="flex">
        <span className="flex-1">
          <span className="font-semibold">State : </span>
          {state}
        </span>
        <span>
          <span className="font-semibold">Code : </span>
          {stateCode}
        </span>
      </div>
    </div>
  );
}

function TotalLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex border-b border-black ${bold ? 'font-semibold' : ''}`}>
      <div className="flex-1 border-r border-black p-1">{label}</div>
      <div className="w-28 p-1 text-right font-mono tabular-nums">{value}</div>
    </div>
  );
}

export function buildInvoicePrintable(data: GetInvoiceResponse) {
  return (
    <InvoicePrintable
      invoice={data.invoice}
      items={data.items}
      customer={data.customer}
      franchise={data.franchise}
      bank={data.bank}
    />
  );
}
