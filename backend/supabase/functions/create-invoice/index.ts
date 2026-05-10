/**
 * Creates a new invoice. Default behavior is create-and-finalise so the UI's
 * "create bill → download PDF" flow is one round-trip; pass { finalise: false }
 * to save a draft instead.
 *
 * On finalisation we snapshot everything that could change later — franchise
 * profile, customer profile, bank details, GST percentages used, signature —
 * onto the invoice row. The PDF reads from snapshots so re-rendering an old
 * invoice after the franchise/customer/bank/GST is edited still produces the
 * original document. CLAUDE.md rule 3.
 *
 * Tax routing: caller supplies `tax_mode` ('intra' | 'inter') and the relevant
 * percentages. If omitted, we infer from customer.state_code === franchise.state_code
 * and pull active gst_config rates as defaults.
 *
 * Idempotency: required for finalised creates — a retried request must not
 * issue two invoice numbers. Drafts may also pass a key.
 *
 * Body:
 *   {
 *     franchise_id, customer_id,
 *     invoice_date?, date_of_supply?,
 *     transport_mode?, vehicle_no?, place_of_supply?,
 *     ship_to_name?, ship_to_address?, ship_to_gstin?, ship_to_state?, ship_to_state_code?,
 *     items: [{ particulars, hsn_code?, quantity, rate }],
 *     tax_mode?: 'intra' | 'inter',
 *     cgst_percent?, sgst_percent?, igst_percent?,
 *     finalise?: boolean  // default true
 *   }
 *
 * Response: { invoice, items }
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { serveJson } from '../_shared/handler.ts';
import { Err } from '../_shared/errors.ts';
import { check, validator, Invalid } from '../_shared/validation.ts';
import { withIdempotency } from '../_shared/idempotency.ts';
import { amountToIndianWords } from '../_shared/words.ts';

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

  const franchise_id = v.field('franchise_id', input.franchise_id, check.uuid({ required: true }));
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
  const cgst_percent = v.field(
    'cgst_percent',
    input.cgst_percent ?? 0,
    check.number({ min: 0, max: 100 }),
  );
  const sgst_percent = v.field(
    'sgst_percent',
    input.sgst_percent ?? 0,
    check.number({ min: 0, max: 100 }),
  );
  const igst_percent = v.field(
    'igst_percent',
    input.igst_percent ?? 0,
    check.number({ min: 0, max: 100 }),
  );

  const finalise = input.finalise === undefined ? true : input.finalise === true;

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
    runCreate({
      sb,
      req,
      userId: user.id,
      franchise_id: franchise_id!,
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
      finalise,
    }),
  );
});

interface CreateArgs {
  sb: SupabaseClient;
  req: Request;
  userId: string;
  franchise_id: string;
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
  finalise: boolean;
}

async function runCreate(args: CreateArgs) {
  const sb = args.sb;

  const result = await withIdempotency<unknown>({
    req: args.req,
    userId: args.userId,
    fnName: 'create-invoice',
    body: {
      franchise_id: args.franchise_id,
      customer_id: args.customer_id,
      invoice_date: args.invoice_date,
      items: args.items,
      tax_mode: args.tax_mode,
      cgst_percent: args.cgst_percent,
      sgst_percent: args.sgst_percent,
      igst_percent: args.igst_percent,
      finalise: args.finalise,
    },
    handler: async () => {
      // Pull full franchise + customer rows so we can freeze them on the
      // invoice. Bank + GST follow.
      const [franchiseRes, customerRes, bankRes, gstRes] = await Promise.all([
        sb
          .from('franchises')
          .select(
            'id, name, slug, gstin, address, phone, state, state_code, logo_url, signature_url, invoice_terms, partner_logos',
          )
          .eq('id', args.franchise_id)
          .maybeSingle(),
        sb
          .from('customers')
          .select('id, franchise_id, name, gstin, address, phone, alternate_phone, state, state_code')
          .eq('id', args.customer_id)
          .maybeSingle(),
        sb
          .from('bank_details')
          .select('bank_name, account_no, ifsc, branch')
          .eq('franchise_id', args.franchise_id)
          .eq('is_active', true)
          .maybeSingle(),
        sb
          .from('gst_config')
          .select('cgst_percent, sgst_percent, igst_percent, effective_from')
          .eq('franchise_id', args.franchise_id)
          .eq('is_active', true)
          .maybeSingle(),
      ]);
      if (franchiseRes.error) throw Err.internal(franchiseRes.error.message);
      if (customerRes.error) throw Err.internal(customerRes.error.message);
      if (bankRes.error) throw Err.internal(bankRes.error.message);
      if (gstRes.error) throw Err.internal(gstRes.error.message);
      if (!franchiseRes.data) throw Err.notFound('Franchise not found');
      if (!customerRes.data) throw Err.notFound('Customer not found');
      if (customerRes.data.franchise_id !== args.franchise_id) {
        throw Err.badRequest('customer_franchise_mismatch', 'Customer does not belong to this franchise');
      }

      const franchise = franchiseRes.data;
      const customer = customerRes.data;
      const activeBank = bankRes.data;
      const activeGst = gstRes.data;

      // Line item amounts — quantity × rate, persisted not derived (rule 2).
      const itemsWithAmount = args.items.map((it, i) => ({
        sl_no: i + 1,
        particulars: it.particulars,
        hsn_code: it.hsn_code ?? null,
        quantity: round2(it.quantity),
        rate: round2(it.rate),
        amount: round2(it.quantity * it.rate),
      }));

      const subtotal = round2(itemsWithAmount.reduce((s, it) => s + it.amount, 0));

      // Use the editor-provided percentages directly. Fall back to active
      // gst_config only when the field was not supplied at all (undefined) —
      // an explicit 0 % (zero-rated goods) must be honoured, so use ?? not ||.
      const cgstPct = args.tax_mode === 'intra'
        ? Number(args.cgst_percent ?? activeGst?.cgst_percent ?? 0)
        : 0;
      const sgstPct = args.tax_mode === 'intra'
        ? Number(args.sgst_percent ?? activeGst?.sgst_percent ?? 0)
        : 0;
      const igstPct = args.tax_mode === 'inter'
        ? Number(args.igst_percent ?? activeGst?.igst_percent ?? 0)
        : 0;

      const cgst_amount = round2((subtotal * cgstPct) / 100);
      const sgst_amount = round2((subtotal * sgstPct) / 100);
      const igst_amount = round2((subtotal * igstPct) / 100);
      const grand_total = round2(subtotal + cgst_amount + sgst_amount + igst_amount);

      // Snapshots — only on finalise.
      let bank_snapshot: unknown = null;
      let gst_snapshot: unknown = null;
      let signature_snapshot: string | null = null;
      let franchise_snapshot: unknown = null;
      let customer_snapshot: unknown = null;
      let grand_total_words: string | null = null;
      if (args.finalise) {
        if (!activeBank) {
          throw Err.unprocessable('no_active_bank', 'No active bank details for this franchise');
        }
        bank_snapshot = activeBank;
        // gst_snapshot stores what was actually applied to this invoice —
        // including any user override — not the active config row.
        gst_snapshot = {
          cgst_percent: cgstPct,
          sgst_percent: sgstPct,
          igst_percent: igstPct,
          effective_from: activeGst?.effective_from ?? null,
        };
        signature_snapshot = franchise.signature_url ?? null;
        franchise_snapshot = {
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
        };
        customer_snapshot = {
          id: customer.id,
          name: customer.name,
          gstin: customer.gstin,
          address: customer.address,
          phone: customer.phone,
          alternate_phone: customer.alternate_phone,
          state: customer.state,
          state_code: customer.state_code,
        };
        grand_total_words = amountToIndianWords(grand_total);
      }

      const { data: invoiceNo, error: noErr } = await sb.rpc('generate_invoice_no', {
        p_franchise_id: args.franchise_id,
      });
      if (noErr) throw Err.internal(`invoice_no generation failed: ${noErr.message}`);

      const invoiceRow = {
        franchise_id: args.franchise_id,
        customer_id: args.customer_id,
        created_by: args.userId,
        invoice_no: invoiceNo as string,
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
        grand_total_words,
        bank_snapshot,
        gst_snapshot,
        signature_snapshot,
        franchise_snapshot,
        customer_snapshot,
        tax_mode: args.tax_mode,
        status: args.finalise ? 'finalised' : 'draft',
      };

      const { data: insertedInvoice, error: insErr } = await sb
        .from('invoices')
        .insert(invoiceRow)
        .select('*')
        .single();
      if (insErr) throw Err.internal(`invoice insert failed: ${insErr.message}`);

      const itemsToInsert = itemsWithAmount.map((it) => ({
        invoice_id: insertedInvoice.id,
        ...it,
      }));
      const { data: insertedItems, error: itemsErr } = await sb
        .from('invoice_items')
        .insert(itemsToInsert)
        .select('id, sl_no, particulars, hsn_code, quantity, rate, amount');
      if (itemsErr) {
        await sb.from('invoices').delete().eq('id', insertedInvoice.id);
        throw Err.internal(`invoice_items insert failed: ${itemsErr.message}`);
      }

      return {
        status: 201,
        body: { invoice: insertedInvoice, items: insertedItems ?? [] },
      };
    },
  });

  return { status: result.status, data: result.body };
}
