'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { useFranchiseBySlug, useFranchiseContext } from '@/features/franchises/hooks';
import { useCreateCustomer, useCustomers } from '@/features/customers/hooks';
import { useCreateInvoice } from '@/features/invoices/hooks';
import { EdgeFunctionError } from '@/lib/functions';
import { amountToIndianWords } from '@/lib/words';
import { AppShell, PageActions, PageTitle } from '@/components/layout/app-shell';
import type { FranchiseFull } from '@/features/franchises/api';
import type { Customer } from '@/features/customers/api';

const CUSTOMER_RESULT_LIMIT = 5;

interface NewCustomerDraft {
  name: string;
  gstin: string;
  address: string;
  phone: string;
  alternate_phone: string;
  state: string;
  state_code: string;
}

const emptyDraft = (): NewCustomerDraft => ({
  name: '',
  gstin: '',
  address: '',
  phone: '',
  alternate_phone: '',
  state: '',
  state_code: '',
});

interface ItemRow {
  particulars: string;
  hsn_code: string;
  quantity: number;
  rate: number;
}

type TaxMode = 'intra' | 'inter';

interface InvoiceFormValues {
  customer_id: string;
  invoice_date: string;
  date_of_supply: string;
  transport_mode: string;
  vehicle_no: string;
  place_of_supply: string;
  ship_to_name: string;
  ship_to_address: string;
  ship_to_gstin: string;
  ship_to_state: string;
  ship_to_state_code: string;
  items: ItemRow[];
  tax_mode: TaxMode;
  cgst_percent: number;
  sgst_percent: number;
  igst_percent: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function NewInvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <RequireAuth>
      <NewInvoiceView slug={slug} />
    </RequireAuth>
  );
}

function NewInvoiceView({ slug }: { slug: string }) {
  const router = useRouter();
  const { franchise: brief } = useFranchiseBySlug(slug);
  const ctxQuery = useFranchiseContext(brief?.id);
  const createMutation = useCreateInvoice();
  const createCustomerMutation = useCreateCustomer();

  // Customer picker — typeahead: server-side search, top-5 results.
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomerDraft>(emptyDraft);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(customerSearch.trim()), 200);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const customersQuery = useCustomers(brief?.id, {
    search: debouncedSearch || undefined,
    limit: CUSTOMER_RESULT_LIMIT,
  });

  const pickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!searchOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [searchOpen]);

  const form = useForm<InvoiceFormValues>({
    defaultValues: {
      customer_id: '',
      invoice_date: todayISO(),
      date_of_supply: '',
      transport_mode: '',
      vehicle_no: '',
      place_of_supply: '',
      ship_to_name: '',
      ship_to_address: '',
      ship_to_gstin: '',
      ship_to_state: '',
      ship_to_state_code: '',
      items: [{ particulars: '', hsn_code: '', quantity: 1, rate: 0 }],
      tax_mode: 'intra',
      cgst_percent: 0,
      sgst_percent: 0,
      igst_percent: 0,
    },
  });

  const itemsArray = useFieldArray({ control: form.control, name: 'items' });
  const items = form.watch('items');
  const taxMode = form.watch('tax_mode');
  const cgstInput = form.watch('cgst_percent');
  const sgstInput = form.watch('sgst_percent');
  const igstInput = form.watch('igst_percent');

  const searchResults = customersQuery.data?.customers ?? [];
  const ctx = ctxQuery.data;
  const customer: Customer | undefined = selectedCustomer ?? undefined;

  // Seed editable percentages from active gst_config when ctx loads.
  useEffect(() => {
    if (!ctx?.gst) return;
    if (form.getValues('cgst_percent') === 0)
      form.setValue('cgst_percent', Number(ctx.gst.cgst_percent));
    if (form.getValues('sgst_percent') === 0)
      form.setValue('sgst_percent', Number(ctx.gst.sgst_percent));
    if (form.getValues('igst_percent') === 0)
      form.setValue('igst_percent', Number(ctx.gst.igst_percent));
  }, [ctx?.gst, form]);

  // Auto-flip tax mode when the picked customer's state differs from franchise.
  useEffect(() => {
    if (!ctx?.franchise.state_code || !customer?.state_code) return;
    const intra = ctx.franchise.state_code === customer.state_code;
    form.setValue('tax_mode', intra ? 'intra' : 'inter', { shouldDirty: false });
  }, [ctx?.franchise.state_code, customer?.state_code, form]);

  // Live totals — recompute on every render. RHF's watched items array can
  // keep a stable reference while inner fields mutate, which made useMemo
  // skip updates; inline keeps subtotal in sync with the per-line amounts.
  const subtotal = round2(
    items.reduce(
      (s, it) => s + (Number(it.quantity) || 0) * (Number(it.rate) || 0),
      0,
    ),
  );

  const cgstAmt =
    taxMode === 'intra' ? round2((subtotal * (Number(cgstInput) || 0)) / 100) : 0;
  const sgstAmt =
    taxMode === 'intra' ? round2((subtotal * (Number(sgstInput) || 0)) / 100) : 0;
  const igstAmt =
    taxMode === 'inter' ? round2((subtotal * (Number(igstInput) || 0)) / 100) : 0;
  const grandTotal = round2(subtotal + cgstAmt + sgstAmt + igstAmt);
  const wordsPreview = grandTotal > 0 ? amountToIndianWords(grandTotal) : '—';

  function pickCustomer(c: Customer) {
    setSelectedCustomer(c);
    form.setValue('customer_id', c.id, { shouldValidate: true });
    setSearchOpen(false);
    setCustomerSearch('');
    setAddingCustomer(false);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    form.setValue('customer_id', '', { shouldValidate: false });
    setSearchOpen(true);
  }

  function startAddCustomer() {
    setAddingCustomer(true);
    setNewCustomerError(null);
    setNewCustomer((d) => ({ ...d, name: customerSearch.trim() || d.name }));
    setSearchOpen(false);
  }

  async function handleSaveNewCustomer() {
    if (!ctx) return;
    const name = newCustomer.name.trim();
    if (!name) {
      setNewCustomerError('Name is required');
      return;
    }
    setNewCustomerError(null);
    try {
      const res = await createCustomerMutation.mutateAsync({
        franchise_id: ctx.franchise.id,
        name,
        gstin: newCustomer.gstin.trim() || undefined,
        address: newCustomer.address.trim() || undefined,
        phone: newCustomer.phone.trim() || undefined,
        alternate_phone: newCustomer.alternate_phone.trim() || undefined,
        state: newCustomer.state.trim() || undefined,
        state_code: newCustomer.state_code.trim() || undefined,
      });
      pickCustomer(res.customer);
      setNewCustomer(emptyDraft());
      toast.success(`Added ${res.customer.name}`);
    } catch (e) {
      const msg =
        e instanceof EdgeFunctionError ? e.message : (e as Error)?.message || 'Could not add customer';
      setNewCustomerError(msg);
      toast.error(msg);
    }
  }

  async function submitInvoice(values: InvoiceFormValues, finalise: boolean) {
    if (!ctx) return;
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await createMutation.mutateAsync({
        idempotencyKey,
        input: {
          franchise_id: ctx.franchise.id,
          customer_id: values.customer_id,
          invoice_date: values.invoice_date || undefined,
          date_of_supply: values.date_of_supply || undefined,
          transport_mode: values.transport_mode || undefined,
          vehicle_no: values.vehicle_no || undefined,
          place_of_supply: values.place_of_supply || undefined,
          ship_to_name: values.ship_to_name || undefined,
          ship_to_address: values.ship_to_address || undefined,
          ship_to_gstin: values.ship_to_gstin || undefined,
          ship_to_state: values.ship_to_state || undefined,
          ship_to_state_code: values.ship_to_state_code || undefined,
          items: values.items.map((it) => ({
            particulars: it.particulars,
            hsn_code: it.hsn_code || undefined,
            quantity: Number(it.quantity),
            rate: Number(it.rate),
          })),
          tax_mode: values.tax_mode,
          cgst_percent: values.tax_mode === 'intra' ? Number(values.cgst_percent) : 0,
          sgst_percent: values.tax_mode === 'intra' ? Number(values.sgst_percent) : 0,
          igst_percent: values.tax_mode === 'inter' ? Number(values.igst_percent) : 0,
          finalise,
        },
      });
      toast.success(
        finalise
          ? `Invoice ${res.invoice.invoice_no} saved`
          : `Draft saved`,
      );
      router.replace(`/franchises/${slug}/invoices/${res.invoice.id}`);
    } catch (e) {
      const msg =
        e instanceof EdgeFunctionError ? e.message : (e as Error)?.message || 'Save failed';
      toast.error(msg);
    }
  }

  const onSubmit = (values: InvoiceFormValues) => submitInvoice(values, true);
  const onSaveDraft = () => form.handleSubmit((values) => submitInvoice(values, false))();

  if (!ctx) {
    return (
      <AppShell>
        <PageTitle title="New invoice" />
        <p className="text-sm text-muted-foreground">Loading invoice form…</p>
      </AppShell>
    );
  }

  const { franchise, bank, gst } = ctx;

  return (
    <AppShell>
      <PageTitle title="New invoice" slug={franchise.slug} subtitle={franchise.name} />

      <PageActions>
        <Button variant="outline" type="button" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={onSaveDraft}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? 'Saving…' : 'Save draft'}
        </Button>
        <Button
          type="submit"
          form="invoice-form"
          disabled={createMutation.isPending || !gst || !bank}
          title={
            !gst || !bank
              ? 'Set up GST config and bank details for this franchise before finalising'
              : undefined
          }
        >
          {createMutation.isPending ? 'Saving…' : 'Save & finalise'}
        </Button>
      </PageActions>

      <div className="mx-auto w-full max-w-5xl">
        <form
          id="invoice-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="border-2 border-black bg-white text-[11px] text-black shadow-sm"
          noValidate
        >
          {/* Header strip */}
          <Header franchise={franchise} />

          {/* GSTIN / State / Code row */}
          <div className="grid grid-cols-1 border-b-2 border-black sm:grid-cols-3">
            <Cell>
              <strong>GSTIN :</strong> {franchise.gstin}
            </Cell>
            <Cell border>
              <strong>State :</strong> {franchise.state ?? '—'}
            </Cell>
            <Cell>
              <strong>Code :</strong> {franchise.state_code ?? '—'}
            </Cell>
          </div>

          {/* Invoice meta */}
          <div className="grid grid-cols-1 border-b-2 border-black md:grid-cols-2">
            <div className="border-b-2 border-black md:border-b-0 md:border-r-2">
              <MetaRow label="Invoice No." value={<span className="text-muted-foreground">— assigned on save —</span>} />
              <MetaRow
                label="Invoice Date"
                input={
                  <input
                    type="date"
                    {...form.register('invoice_date', { required: true })}
                    className="h-6 w-full bg-transparent px-1 text-[11px] focus:bg-yellow-50 focus:outline-none"
                  />
                }
              />
            </div>
            <div>
              <MetaRow
                label="Transport Mode"
                input={
                  <input
                    {...form.register('transport_mode')}
                    className="h-6 w-full bg-transparent px-1 text-[11px] focus:bg-yellow-50 focus:outline-none"
                  />
                }
              />
              <MetaRow
                label="Vehicle Number"
                input={
                  <input
                    {...form.register('vehicle_no')}
                    className="h-6 w-full bg-transparent px-1 text-[11px] focus:bg-yellow-50 focus:outline-none"
                  />
                }
              />
              <MetaRow
                label="Date of Supply"
                input={
                  <input
                    type="date"
                    {...form.register('date_of_supply')}
                    className="h-6 w-full bg-transparent px-1 text-[11px] focus:bg-yellow-50 focus:outline-none"
                  />
                }
              />
              <MetaRow
                label="Place of Supply"
                input={
                  <input
                    {...form.register('place_of_supply')}
                    className="h-6 w-full bg-transparent px-1 text-[11px] focus:bg-yellow-50 focus:outline-none"
                  />
                }
              />
            </div>
          </div>

          {/* Bill to / Ship to */}
          <div className="grid grid-cols-1 border-b-2 border-black md:grid-cols-2">
            <div className="border-b-2 border-black md:border-b-0 md:border-r-2">
              <SectionTitle>Bill to Party</SectionTitle>
              <div className="relative px-2 pb-2 pt-2" ref={pickerRef}>
                {selectedCustomer && !searchOpen ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 truncate border border-black/40 bg-white px-2 py-1 text-[11px]">
                      {selectedCustomer.name}
                    </div>
                    <button
                      type="button"
                      onClick={clearCustomer}
                      className="text-[10px] underline hover:text-black/70"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      onFocus={() => setSearchOpen(true)}
                      placeholder="Search customer by name…"
                      className="h-7 w-full border border-black/40 bg-white px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-black/40"
                    />
                    {searchOpen && (
                      <div className="absolute left-2 right-2 top-full z-20 mt-1 max-h-64 overflow-auto border border-black/40 bg-white shadow-md">
                        {customersQuery.isFetching && (
                          <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                            Searching…
                          </div>
                        )}
                        {!customersQuery.isFetching && searchResults.length === 0 && (
                          <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                            {debouncedSearch ? 'No matches' : 'Start typing to search'}
                          </div>
                        )}
                        {searchResults.slice(0, CUSTOMER_RESULT_LIMIT).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => pickCustomer(c)}
                            className="block w-full truncate border-b border-black/10 px-2 py-1.5 text-left text-[11px] hover:bg-yellow-50 last:border-b-0"
                          >
                            <span className="font-medium">{c.name}</span>
                            {c.gstin && (
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                {c.gstin}
                              </span>
                            )}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={startAddCustomer}
                          className="block w-full border-t border-black/40 bg-secondary/40 px-2 py-1.5 text-left text-[11px] font-semibold hover:bg-yellow-50"
                        >
                          + Add new customer…
                        </button>
                      </div>
                    )}
                  </>
                )}
                {/* Hidden RHF-controlled field so existing required validation still fires. */}
                <input
                  type="hidden"
                  {...form.register('customer_id', { required: 'Pick a customer' })}
                />
              </div>
              {addingCustomer ? (
                <NewCustomerForm
                  draft={newCustomer}
                  onChange={setNewCustomer}
                  onSave={handleSaveNewCustomer}
                  onCancel={() => {
                    setAddingCustomer(false);
                    setNewCustomer(emptyDraft());
                    setNewCustomerError(null);
                  }}
                  saving={createCustomerMutation.isPending}
                  error={newCustomerError}
                />
              ) : (
                <>
                  <PartyRow label="Name" value={customer?.name ?? ''} />
                  <PartyRow label="Address" value={customer?.address ?? ''} multi />
                  <PartyRow label="GSTIN" value={customer?.gstin ?? ''} />
                  <div className="grid grid-cols-2">
                    <PartyRow label="State" value={customer?.state ?? ''} border />
                    <PartyRow label="Code" value={customer?.state_code ?? ''} />
                  </div>
                </>
              )}
            </div>
            <div>
              <SectionTitle>Ship to Party</SectionTitle>
              <PartyRow
                label="Name"
                input={<HandInput {...form.register('ship_to_name')} />}
              />
              <PartyRow
                label="Address"
                input={<HandInput {...form.register('ship_to_address')} />}
                multi
              />
              <PartyRow
                label="GSTIN"
                input={<HandInput {...form.register('ship_to_gstin')} />}
              />
              <div className="grid grid-cols-2">
                <PartyRow
                  label="State"
                  input={<HandInput {...form.register('ship_to_state')} />}
                  border
                />
                <PartyRow
                  label="Code"
                  input={<HandInput {...form.register('ship_to_state_code')} />}
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="w-10 border-r-2 border-black p-1 font-semibold">Sl.<br />No</th>
                <th className="border-r-2 border-black p-1 text-left font-semibold">Particulars</th>
                <th className="w-28 border-r-2 border-black p-1 font-semibold">HSN Code</th>
                <th className="w-32 p-1 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {itemsArray.fields.map((field, idx) => {
                const q = Number(items[idx]?.quantity) || 0;
                const r = Number(items[idx]?.rate) || 0;
                const lineAmt = round2(q * r);
                return (
                  <tr key={field.id} className="border-b border-black/30 align-top">
                    <td className="border-r-2 border-black p-1 text-center">{idx + 1}</td>
                    <td className="border-r-2 border-black p-1">
                      <HandInput
                        placeholder="Description of goods"
                        {...form.register(`items.${idx}.particulars`, { required: true })}
                      />
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>Qty</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          {...form.register(`items.${idx}.quantity`, {
                            valueAsNumber: true,
                            required: true,
                          })}
                          className="h-5 w-16 border-b border-black/40 bg-transparent px-1 text-center text-[10px] focus:bg-yellow-50 focus:outline-none"
                        />
                        <span>×</span>
                        <span>Rate</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          {...form.register(`items.${idx}.rate`, {
                            valueAsNumber: true,
                            required: true,
                          })}
                          className="h-5 w-20 border-b border-black/40 bg-transparent px-1 text-center text-[10px] focus:bg-yellow-50 focus:outline-none"
                        />
                        {itemsArray.fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => itemsArray.remove(idx)}
                            className="ml-auto text-destructive hover:underline"
                          >
                            remove
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="border-r-2 border-black p-1">
                      <HandInput {...form.register(`items.${idx}.hsn_code`)} />
                    </td>
                    <td className="p-1 text-right font-mono tabular-nums">
                      {fmtINR(lineAmt)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-b-2 border-black">
                <td colSpan={4} className="p-1">
                  <button
                    type="button"
                    onClick={() =>
                      itemsArray.append({ particulars: '', hsn_code: '', quantity: 1, rate: 0 })
                    }
                    className="text-[11px] underline hover:text-black/70"
                  >
                    + Add row
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Totals row: words on left, totals block on right */}
          <div className="grid grid-cols-1 border-b-2 border-black md:grid-cols-[1fr_340px]">
            <div className="border-b-2 border-black p-2 md:border-b-0 md:border-r-2">
              <div className="text-center text-[10px] font-semibold">Total Invoice amount in words</div>
              <div className="mt-2 text-[11px]">
                <span className="font-semibold">Rupees :</span>{' '}
                <span className="italic">{wordsPreview}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>Tax routing</span>
                <select
                  {...form.register('tax_mode')}
                  className="h-6 border border-black/40 bg-white px-1 text-[10px] focus:outline-none"
                >
                  <option value="intra">Intra-state (CGST + SGST)</option>
                  <option value="inter">Inter-state (IGST)</option>
                </select>
                {customer?.state_code && ctx.franchise.state_code && (
                  <span className="text-[10px]">
                    auto-detected:{' '}
                    {customer.state_code === ctx.franchise.state_code ? 'intra' : 'inter'}
                  </span>
                )}
              </div>
            </div>
            <div className="text-[11px]">
              <TotalsRow label="TOTAL" value={fmtINR(subtotal)} />
              {taxMode === 'intra' ? (
                <>
                  <TotalsPercentRow
                    label="Add: CGST"
                    percent={
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        {...form.register('cgst_percent', { valueAsNumber: true })}
                        className="h-5 w-14 border-b border-black/40 bg-transparent px-1 text-right text-[11px] focus:bg-yellow-50 focus:outline-none"
                      />
                    }
                    value={fmtINR(cgstAmt)}
                  />
                  <TotalsPercentRow
                    label="Add: SGST"
                    percent={
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        {...form.register('sgst_percent', { valueAsNumber: true })}
                        className="h-5 w-14 border-b border-black/40 bg-transparent px-1 text-right text-[11px] focus:bg-yellow-50 focus:outline-none"
                      />
                    }
                    value={fmtINR(sgstAmt)}
                  />
                </>
              ) : (
                <TotalsPercentRow
                  label="Add: IGST"
                  percent={
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      {...form.register('igst_percent', { valueAsNumber: true })}
                      className="h-5 w-14 border-b border-black/40 bg-transparent px-1 text-right text-[11px] focus:bg-yellow-50 focus:outline-none"
                    />
                  }
                  value={fmtINR(igstAmt)}
                />
              )}
              <TotalsRow label="GRAND TOTAL" value={fmtINR(grandTotal)} bold />
            </div>
          </div>

          {/* Bottom: notes / bank / signature */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_280px]">
            <div className="border-b-2 border-black p-2 text-[10px] md:border-b-0 md:border-r-2">
              <div className="font-semibold">E.O.E.</div>
              <div className="mt-1 font-semibold">Note :</div>
              <ol className="mt-0.5 list-inside list-decimal space-y-0.5">
                {franchise.invoice_terms.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </div>
            <div className="border-b-2 border-black p-2 text-[10px] md:border-b-0 md:border-r-2">
              <div className="text-center font-semibold">Bank Details</div>
              {bank ? (
                <div className="mt-1 space-y-0.5 font-mono">
                  <div>Bank Name : {bank.bank_name}</div>
                  <div>A/c. No.&nbsp;&nbsp;: {bank.account_no}</div>
                  <div>Branch&nbsp;&nbsp;&nbsp;&nbsp;: {bank.branch ?? '—'}</div>
                  <div>IFSC&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {bank.ifsc}</div>
                </div>
              ) : (
                <div className="mt-1 text-destructive">No active bank details — set one before finalising.</div>
              )}
            </div>
            <div className="p-2 text-center text-[10px]">
              <div className="font-semibold">{franchise.name}</div>
              <div className="mt-12 border-t border-black pt-1">Authorised Signatory</div>
            </div>
          </div>
        </form>

        <p className="mt-3 text-xs text-muted-foreground print:hidden">
          {!gst && 'No active GST configuration on this franchise. Add one in admin before saving. '}
          {!bank && 'No active bank details on this franchise. Add one in admin before saving.'}
        </p>
      </div>
    </AppShell>
  );
}

// ── small presentational helpers ────────────────────────────────────────────

function Header({ franchise }: { franchise: FranchiseFull }) {
  return (
    <div className="flex flex-col items-stretch border-b-2 border-black sm:flex-row">
      <div className="flex items-center justify-center border-b-2 border-black p-2 sm:w-32 sm:border-b-0 sm:border-r-2">
        {franchise.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={franchise.logo_url} alt={franchise.name} className="h-16 w-auto object-contain" />
        ) : (
          <div className="text-[10px] text-muted-foreground">no logo</div>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-2 py-2 text-center">
        <h1 className="text-base font-bold tracking-wide">TAX INVOICE</h1>
        <div className="mt-1 text-sm font-bold">{franchise.name}</div>
        {franchise.address && (
          <div className="mt-0.5 text-[10px] leading-tight">{franchise.address}</div>
        )}
        {franchise.phone && <div className="mt-0.5 text-[10px]">📞 {franchise.phone}</div>}
      </div>
      <div className="flex flex-row items-center justify-center gap-2 border-t-2 border-black p-2 sm:w-32 sm:flex-col sm:border-l-2 sm:border-t-0">
        {franchise.partner_logos?.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.url}
            src={p.url}
            alt={p.name}
            className="h-8 w-auto object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Cell({ children, border }: { children: React.ReactNode; border?: boolean }) {
  return (
    <div className={`px-2 py-1 ${border ? 'border-x-2 border-black' : ''}`}>{children}</div>
  );
}

function MetaRow({ label, input, value }: { label: string; input?: React.ReactNode; value?: React.ReactNode }) {
  return (
    <div className="flex items-center border-b border-black/40 last:border-b-0">
      <div className="w-32 border-r border-black/40 px-2 py-1 text-[10px] font-semibold">{label}</div>
      <div className="flex-1 px-1 py-0.5">{input ?? value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-black/40 bg-secondary/40 px-2 py-1 text-center text-[11px] font-bold">
      {children}
    </div>
  );
}

function PartyRow({
  label,
  value,
  input,
  multi,
  border,
}: {
  label: string;
  value?: string;
  input?: React.ReactNode;
  multi?: boolean;
  border?: boolean;
}) {
  return (
    <div
      className={`flex items-start border-b border-black/40 last:border-b-0 ${
        border ? 'border-r border-black/40' : ''
      }`}
    >
      <div className="w-20 border-r border-black/40 px-2 py-1 text-[10px] font-semibold">{label}</div>
      <div className={`flex-1 px-1 py-0.5 ${multi ? 'min-h-10' : ''}`}>
        {input ?? <span className="block min-h-4 text-[11px]">{value || ''}</span>}
      </div>
    </div>
  );
}

function HandInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-6 w-full bg-transparent px-1 text-[11px] focus:bg-yellow-50 focus:outline-none"
    />
  );
}

function TotalsRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={`flex items-center border-b-2 border-black last:border-b-0 ${
        bold ? 'bg-secondary/50 font-bold' : ''
      }`}
    >
      <div className="flex-1 border-r-2 border-black px-2 py-1">{label}</div>
      <div className="w-32 px-2 py-1 text-right font-mono tabular-nums">{value}</div>
    </div>
  );
}

function NewCustomerForm({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: NewCustomerDraft;
  onChange: (next: NewCustomerDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const set = <K extends keyof NewCustomerDraft>(key: K, value: NewCustomerDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-1.5 border-t border-black/40 bg-yellow-50/40 px-2 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Add new customer
      </div>
      <DraftField
        label="Name"
        value={draft.name}
        onChange={(v) => set('name', v)}
        placeholder="Required"
        autoFocus
      />
      <DraftField
        label="Address"
        value={draft.address}
        onChange={(v) => set('address', v)}
      />
      <DraftField
        label="GSTIN"
        value={draft.gstin}
        onChange={(v) => set('gstin', v.toUpperCase())}
        placeholder="22AAAAA0000A1Z5"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <DraftField label="Phone" value={draft.phone} onChange={(v) => set('phone', v)} />
        <DraftField
          label="Alt. phone"
          value={draft.alternate_phone}
          onChange={(v) => set('alternate_phone', v)}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <DraftField label="State" value={draft.state} onChange={(v) => set('state', v)} />
        <DraftField
          label="Code"
          value={draft.state_code}
          onChange={(v) => set('state_code', v)}
        />
      </div>
      {error && <div className="text-[10px] text-destructive">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-[10px] underline hover:text-black/70 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.name.trim()}
          className="rounded border border-black bg-black px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save customer'}
        </button>
      </div>
    </div>
  );
}

function DraftField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-[10px]">
      <span className="w-16 shrink-0 font-semibold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-6 w-full border border-black/30 bg-white px-1 text-[11px] focus:bg-yellow-50 focus:outline-none focus:ring-1 focus:ring-black/40"
      />
    </label>
  );
}

function TotalsPercentRow({
  label,
  percent,
  value,
}: {
  label: string;
  percent: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex items-center border-b-2 border-black">
      <div className="flex flex-1 items-center gap-1 border-r-2 border-black px-2 py-1">
        <span>{label} @</span>
        {percent}
        <span>%</span>
      </div>
      <div className="w-32 px-2 py-1 text-right font-mono tabular-nums">{value}</div>
    </div>
  );
}
