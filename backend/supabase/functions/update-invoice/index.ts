/**
 * Updates a draft invoice. Refuses if the invoice is not in 'draft' status —
 * finalised and cancelled rows are immutable per CLAUDE.md rule 3.
 *
 * Drafts do not store snapshots; they are only frozen at finalisation. So this
 * function recomputes amounts, replaces invoice_items wholesale, and updates
 * the parent row's editable fields. `bank_snapshot` / `gst_snapshot` /
 * `signature_snapshot` / `franchise_snapshot` / `customer_snapshot` /
 * `grand_total_words` / `invoice_no` are never touched here.
 *
 * Body:
 *   {
 *     invoice_id: uuid,
 *     customer_id, invoice_date?, date_of_supply?,
 *     transport_mode?, vehicle_no?, place_of_supply?,
 *     ship_to_name?, ship_to_address?, ship_to_gstin?, ship_to_state?, ship_to_state_code?,
 *     items: [{ particulars, hsn_code?, quantity, rate }],
 *     tax_mode?: 'intra' | 'inter',
 *     cgst_percent?, sgst_percent?, igst_percent?
 *   }
 *
 * Response: { invoice, items }
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator, Invalid } from '../_shared/validation.ts';
import { withIdempotency } from '../_shared/idempotency.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;

interface ItemInput {
  particulars: string;
  hsn_code?: string;
  quantity: number;
  rate: number;
}

type TaxMode = 'intra' | 'inter';

serveJson(async ({ user, sb, req, body }) => {
  const v = validator();
  const input = (body ?? {}) as Record<string, unknown>;

  const invoice_id = v.field('invoice_id', input.invoice_id, check.uuid({ required: true }));
  const customer_id = v.field('customer_id', input.customer_id, check.uuid({ required: true }));
  const invoice_date = v.field('invoice_date', input.invoice_date, check.string({ max: 10 }));
  const date_of_supply = v.field('date_of_supply', input.date_of_supply, check.string({ max: 10 }));
  const transport_mode = v.field('transport_mode', input.transport_mode, check.string({ max: 100 }));
  const vehicle_no = v.field('vehicle_no', input.vehicle_no, check.string({ max: 50 }));
  const place_of_supply = v.field('place_of_supply', input.place_of_supply, check.string({ max: 200 }));

  const ship_to_name = v.field('ship_to_name', input.ship_to_name, check.string({ max: 200 }));
  const ship_to_address = v.field('ship_to_address', input.ship_to_address, check.string({ max: 1000 }));
  const ship_to_gstin = v.field('ship_to_gstin', input.ship_to_gstin, check.gstin());
  const ship_to_state = v.field('ship_to_state', input.ship_to_state, check.string({ max: 100 }));
  const ship_to_state_code = v.field('ship_to_state_code', input.ship_to_state_code, check.string({ max: 10 }));

  const tax_mode = v.field('tax_mode', input.tax_mode ?? 'intra', check.enum(['intra', 'inter'] as const));
  const cgst_percent = v.field('cgst_percent', input.cgst_percent ?? 0, check.number({ min: 0, max: 100 }));
  const sgst_percent = v.field('sgst_percent', input.sgst_percent ?? 0, check.number({ min: 0, max: 100 }));
  const igst_percent = v.field('igst_percent', input.igst_percent ?? 0, check.number({ min: 0, max: 100 }));

  const items = v.field(
    'items',
    input.items,
    check.array<ItemInput>(
      (item) => {
        if (typeof item !== 'object' || item === null) return new Invalid('must be an object');
        const it = item as Record<string, unknown>;
        const particulars = check.string({ required: true, max: 500 })(it.particulars);
        if (particulars instanceof Invalid) return new Invalid(`particulars: ${particulars.message}`);
        const hsn_code = check.string({ max: 20 })(it.hsn_code);
        if (hsn_code instanceof Invalid) return new Invalid(`hsn_code: ${hsn_code.message}`);
        const quantity = check.number({ min: 0.001 })(it.quantity);
        if (quantity instanceof Invalid) return new Invalid(`quantity: ${quantity.message}`);
        const rate = check.money()(it.rate);
        if (rate instanceof Invalid) return new Invalid(`rate: ${rate.message}`);
        return { particulars, hsn_code: hsn_code || undefined, quantity, rate };
      },
      { min: 1, max: 200 },
    ),
  );

  return v.done(() =>
    runUpdate({
      sb,
      req,
      userId: user.id,
      invoice_id: invoice_id!,
      customer_id: customer_id!,
      invoice_date: invoice_date || undefined,
      date_of_supply: date_of_supply || undefined,
      transport_mode: transport_mode || undefined,
      vehicle_no: vehicle_no || undefined,
      place_of_supply: place_of_supply || undefined,
      ship_to_name: ship_to_name || undefined,
      ship_to_address: ship_to_address || undefined,
      ship_to_gstin: ship_to_gstin || undefined,
      ship_to_state: ship_to_state || undefined,
      ship_to_state_code: ship_to_state_code || undefined,
      tax_mode: tax_mode as TaxMode,
      cgst_percent: cgst_percent ?? 0,
      sgst_percent: sgst_percent ?? 0,
      igst_percent: igst_percent ?? 0,
      items: items!,
    }),
  );
});

interface UpdateArgs {
  sb: SupabaseClient;
  req: Request;
  userId: string;
  invoice_id: string;
  customer_id: string;
  invoice_date?: string;
  date_of_supply?: string;
  transport_mode?: string;
  vehicle_no?: string;
  place_of_supply?: string;
  ship_to_name?: string;
  ship_to_address?: string;
  ship_to_gstin?: string;
  ship_to_state?: string;
  ship_to_state_code?: string;
  tax_mode: TaxMode;
  cgst_percent: number;
  sgst_percent: number;
  igst_percent: number;
  items: ItemInput[];
}

async function runUpdate(args: UpdateArgs) {
  const sb = args.sb;

  const result = await withIdempotency<unknown>({
    req: args.req,
    userId: args.userId,
    fnName: 'update-invoice',
    body: {
      invoice_id: args.invoice_id,
      customer_id: args.customer_id,
      invoice_date: args.invoice_date,
      items: args.items,
      tax_mode: args.tax_mode,
      cgst_percent: args.cgst_percent,
      sgst_percent: args.sgst_percent,
      igst_percent: args.igst_percent,
    },
    handler: async () => {
      // Load the existing invoice. RLS gates visibility.
      const { data: existing, error: loadErr } = await sb
        .from('invoices')
        .select('id, franchise_id, status')
        .eq('id', args.invoice_id)
        .maybeSingle();
      if (loadErr) throw Err.internal(loadErr.message);
      if (!existing) throw Err.notFound('Invoice not found');

      if (existing.status !== 'draft') {
        throw Err.unprocessable(
          'invoice_not_draft',
          `Only drafts can be edited (current status: ${existing.status})`,
        );
      }

      // Confirm the customer is in the same franchise as the invoice.
      const { data: customer, error: custErr } = await sb
        .from('customers')
        .select('id, franchise_id')
        .eq('id', args.customer_id)
        .maybeSingle();
      if (custErr) throw Err.internal(custErr.message);
      if (!customer) throw Err.notFound('Customer not found');
      if (customer.franchise_id !== existing.franchise_id) {
        throw Err.badRequest(
          'customer_franchise_mismatch',
          'Customer does not belong to this franchise',
        );
      }

      // Recompute line + invoice totals (rule 2: amount is stored, not derived
      // on read — but it IS derived from quantity × rate at write time).
      const itemsWithAmount = args.items.map((it, i) => ({
        sl_no: i + 1,
        particulars: it.particulars,
        hsn_code: it.hsn_code ?? null,
        quantity: round2(it.quantity),
        rate: round2(it.rate),
        amount: round2(it.quantity * it.rate),
      }));
      const subtotal = round2(itemsWithAmount.reduce((s, it) => s + it.amount, 0));

      const cgstPct = args.tax_mode === 'intra' ? args.cgst_percent : 0;
      const sgstPct = args.tax_mode === 'intra' ? args.sgst_percent : 0;
      const igstPct = args.tax_mode === 'inter' ? args.igst_percent : 0;
      const cgst_amount = round2((subtotal * cgstPct) / 100);
      const sgst_amount = round2((subtotal * sgstPct) / 100);
      const igst_amount = round2((subtotal * igstPct) / 100);
      const grand_total = round2(subtotal + cgst_amount + sgst_amount + igst_amount);

      const invoiceUpdate = {
        customer_id: args.customer_id,
        invoice_date: args.invoice_date ?? new Date().toISOString().slice(0, 10),
        date_of_supply: args.date_of_supply ?? null,
        transport_mode: args.transport_mode ?? null,
        vehicle_no: args.vehicle_no ?? null,
        place_of_supply: args.place_of_supply ?? null,
        ship_to_name: args.ship_to_name ?? null,
        ship_to_address: args.ship_to_address ?? null,
        ship_to_gstin: args.ship_to_gstin ?? null,
        ship_to_state: args.ship_to_state ?? null,
        ship_to_state_code: args.ship_to_state_code ?? null,
        subtotal,
        cgst_amount,
        sgst_amount,
        igst_amount,
        grand_total,
        tax_mode: args.tax_mode,
        last_edited_by: args.userId,
      };

      const { data: updatedInvoice, error: updErr } = await sb
        .from('invoices')
        .update(invoiceUpdate)
        .eq('id', args.invoice_id)
        .eq('status', 'draft') // belt-and-suspenders against status flip race
        .select('*')
        .single();
      if (updErr) throw Err.internal(`invoice update failed: ${updErr.message}`);

      // Replace items wholesale. Simpler than diffing and the sl_no order
      // matters; the table is small (max 200 rows by validation).
      const { error: delErr } = await sb
        .from('invoice_items')
        .delete()
        .eq('invoice_id', args.invoice_id);
      if (delErr) throw Err.internal(`invoice_items delete failed: ${delErr.message}`);

      const itemsToInsert = itemsWithAmount.map((it) => ({
        invoice_id: args.invoice_id,
        ...it,
      }));
      const { data: insertedItems, error: itemsErr } = await sb
        .from('invoice_items')
        .insert(itemsToInsert)
        .select('id, sl_no, particulars, hsn_code, quantity, rate, amount');
      if (itemsErr) throw Err.internal(`invoice_items insert failed: ${itemsErr.message}`);

      return {
        status: 200,
        body: { invoice: updatedInvoice, items: insertedItems ?? [] },
      };
    },
  });

  return { status: result.status, data: result.body };
}
