/**
 * Flips a draft invoice to status='finalised'. Captures the bank / GST /
 * signature / franchise / customer snapshots and persists `grand_total_words`
 * — the snapshots PDFs need to stay reproducible per CLAUDE.md rule 3.
 *
 * Once finalised, `update-invoice` refuses further edits (status check), so
 * the row's amounts and snapshots are immutable from this point on.
 *
 * Body:
 *   {
 *     invoice_id: uuid,
 *     // Tax percentages used to derive cgst_amount / sgst_amount / igst_amount
 *     // when the draft was last updated. Caller (the editor form) already has
 *     // these in state — passing them avoids re-deriving from amount/subtotal,
 *     // which loses precision for clean rates (e.g. 9.00 % vs 9.0000 %).
 *     cgst_percent?: number,
 *     sgst_percent?: number,
 *     igst_percent?: number,
 *   }
 *
 * Response: { invoice }
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator } from '../_shared/validation.ts';
import { withIdempotency } from '../_shared/idempotency.ts';
import { amountToIndianWords } from '../_shared/words.ts';

serveJson(async ({ user, sb, req, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const invoice_id = v.field('invoice_id', input.invoice_id, check.uuid({ required: true }));
  const cgst_percent = v.field('cgst_percent', input.cgst_percent ?? 0, check.number({ min: 0, max: 100 }));
  const sgst_percent = v.field('sgst_percent', input.sgst_percent ?? 0, check.number({ min: 0, max: 100 }));
  const igst_percent = v.field('igst_percent', input.igst_percent ?? 0, check.number({ min: 0, max: 100 }));

  return v.done(() =>
    runFinalise({
      sb,
      req,
      userId: user.id,
      invoice_id: invoice_id!,
      cgst_percent: cgst_percent ?? 0,
      sgst_percent: sgst_percent ?? 0,
      igst_percent: igst_percent ?? 0,
    }),
  );
});

interface FinaliseArgs {
  sb: SupabaseClient;
  req: Request;
  userId: string;
  invoice_id: string;
  cgst_percent: number;
  sgst_percent: number;
  igst_percent: number;
}

async function runFinalise(args: FinaliseArgs) {
  const sb = args.sb;

  const result = await withIdempotency<unknown>({
    req: args.req,
    userId: args.userId,
    fnName: 'finalise-invoice',
    body: {
      invoice_id: args.invoice_id,
      cgst_percent: args.cgst_percent,
      sgst_percent: args.sgst_percent,
      igst_percent: args.igst_percent,
    },
    handler: async () => {
      const { data: existing, error: loadErr } = await sb
        .from('invoices')
        .select(
          'id, franchise_id, customer_id, status, subtotal, cgst_amount, sgst_amount, igst_amount, grand_total, tax_mode',
        )
        .eq('id', args.invoice_id)
        .maybeSingle();
      if (loadErr) throw Err.internal(loadErr.message);
      if (!existing) throw Err.notFound('Invoice not found');

      if (existing.status !== 'draft') {
        throw Err.unprocessable(
          'invoice_not_draft',
          `Only drafts can be finalised (current status: ${existing.status})`,
        );
      }

      // Pull everything we need to build the snapshots.
      const [franchiseRes, customerRes, bankRes, gstRes] = await Promise.all([
        sb
          .from('franchises')
          .select(
            'id, name, slug, gstin, address, phone, state, state_code, logo_url, signature_url, invoice_terms, partner_logos',
          )
          .eq('id', existing.franchise_id)
          .maybeSingle(),
        sb
          .from('customers')
          .select('id, franchise_id, name, gstin, address, phone, alternate_phone, state, state_code')
          .eq('id', existing.customer_id)
          .maybeSingle(),
        sb
          .from('bank_details')
          .select('bank_name, account_no, ifsc, branch')
          .eq('franchise_id', existing.franchise_id)
          .eq('is_active', true)
          .maybeSingle(),
        sb
          .from('gst_config')
          .select('cgst_percent, sgst_percent, igst_percent, effective_from')
          .eq('franchise_id', existing.franchise_id)
          .eq('is_active', true)
          .maybeSingle(),
      ]);
      if (franchiseRes.error) throw Err.internal(franchiseRes.error.message);
      if (customerRes.error) throw Err.internal(customerRes.error.message);
      if (bankRes.error) throw Err.internal(bankRes.error.message);
      if (gstRes.error) throw Err.internal(gstRes.error.message);
      if (!franchiseRes.data) throw Err.notFound('Franchise not found');
      if (!customerRes.data) throw Err.notFound('Customer not found');
      if (!bankRes.data) {
        throw Err.unprocessable('no_active_bank', 'No active bank details for this franchise');
      }

      const franchise = franchiseRes.data;
      const customer = customerRes.data;
      const activeBank = bankRes.data;
      const activeGst = gstRes.data;

      // Use caller-supplied percentages; fall back to active gst_config for
      // anything missing. Use ?? not || so an explicit 0 (e.g. zero-rated
      // intra-state goods) is honoured.
      const subtotal = Number(existing.subtotal) || 0;
      const taxMode = existing.tax_mode === 'inter' ? 'inter' : 'intra';
      const cgstPct = taxMode === 'intra'
        ? (args.cgst_percent || Number(activeGst?.cgst_percent ?? 0) || inferPct(existing.cgst_amount, subtotal))
        : 0;
      const sgstPct = taxMode === 'intra'
        ? (args.sgst_percent || Number(activeGst?.sgst_percent ?? 0) || inferPct(existing.sgst_amount, subtotal))
        : 0;
      const igstPct = taxMode === 'inter'
        ? (args.igst_percent || Number(activeGst?.igst_percent ?? 0) || inferPct(existing.igst_amount, subtotal))
        : 0;

      const finalisedRow = {
        status: 'finalised' as const,
        bank_snapshot: activeBank,
        gst_snapshot: {
          cgst_percent: cgstPct,
          sgst_percent: sgstPct,
          igst_percent: igstPct,
          effective_from: activeGst?.effective_from ?? null,
        },
        signature_snapshot: franchise.signature_url ?? null,
        franchise_snapshot: {
          id: franchise.id,
          name: franchise.name,
          slug: franchise.slug,
          gstin: franchise.gstin,
          address: franchise.address,
          phone: franchise.phone,
          state: franchise.state,
          state_code: franchise.state_code,
          logo_url: franchise.logo_url,
          signature_url: franchise.signature_url,
          invoice_terms: franchise.invoice_terms,
          partner_logos: franchise.partner_logos,
        },
        customer_snapshot: {
          id: customer.id,
          name: customer.name,
          gstin: customer.gstin,
          address: customer.address,
          phone: customer.phone,
          alternate_phone: customer.alternate_phone,
          state: customer.state,
          state_code: customer.state_code,
        },
        grand_total_words: amountToIndianWords(Number(existing.grand_total) || 0),
        last_edited_by: args.userId,
      };

      const { data: updatedInvoice, error: updErr } = await sb
        .from('invoices')
        .update(finalisedRow)
        .eq('id', args.invoice_id)
        .eq('status', 'draft') // race guard: refuse if someone else flipped it
        .select('*')
        .single();
      if (updErr) throw Err.internal(`finalise update failed: ${updErr.message}`);

      return { status: 200, body: { invoice: updatedInvoice } };
    },
  });

  return { status: result.status, data: result.body };
}

function inferPct(amount: number | null, subtotal: number): number {
  const a = Number(amount) || 0;
  if (subtotal <= 0 || a <= 0) return 0;
  return Math.round((a / subtotal) * 10000) / 100;
}
