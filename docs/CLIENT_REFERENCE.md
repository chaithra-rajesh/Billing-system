# Client Reference — Manual Invoice → System Mapping

The system replaces a paper "Tax Invoice" form used by M.R. Air Conditioning & Refrigeration Engineering. Reference image: `docs/1000357379.jpg`.

This document is the **source of truth for the invoice PDF layout**. When generating PDFs, every field below must appear in the same position and label as the paper form, so customers can receive identical-looking invoices regardless of whether they were issued by hand or by the system.

---

## Header

| Region | Manual form value (sample) | System source |
|---|---|---|
| Title | TAX INVOICE | static |
| Brand logo (left) | M.R. logo | `franchises.logo_url` |
| Brand name | M.R. Air Conditioning & Refrigeration Engineering | `franchises.name` |
| Brand address | Ashwini Building, Mannagudda Main Road, Ballalbagh, Mangaluru – 575 003 | `franchises.address` |
| Brand phone | 0824-4277295 | `franchises.phone` |
| Co-brand logos (right) | Godrej, smart care | franchise-level static assets (TBD — likely `franchises.partner_logos jsonb`) |
| Franchise GSTIN | 29AOBPK1486M1Z1 | `franchises.gstin` |
| State | Karnataka | franchise state (TBD field) |
| Code | KTK / 29 | franchise state code (TBD field) |

---

## Invoice metadata block

| Manual form field | System column | Notes |
|---|---|---|
| Invoice No. | `invoices.invoice_no` | auto-generated, e.g. `MR-2026-1802` |
| Invoice Date | `invoices.invoice_date` | |
| Transport Mode | `invoices.transport_mode` | |
| Vehicle Number | `invoices.vehicle_no` | |
| Date of Supply | `invoices.date_of_supply` | **added in migration 0003** |
| Place of Supply | `invoices.place_of_supply` | |

---

## Bill-to / Ship-to

The form has **two side-by-side blocks**: Bill-to Party and Ship-to Party. Each has Name, Address, GSTIN, State, Code.

| Manual field | Bill-to source | Ship-to source |
|---|---|---|
| Name | `customers.name` (via `invoices.customer_id`) | `invoices.ship_to_name` |
| Address | `customers.address` | `invoices.ship_to_address` |
| GSTIN | `customers.gstin` | `invoices.ship_to_gstin` |
| State | `customers.state` | `invoices.ship_to_state` |
| Code | `customers.state_code` | `invoices.ship_to_state_code` |

Ship-to fields live on the **invoice**, not the customer, because the same customer can have goods delivered to different sites. The frontend defaults ship-to = bill-to and lets the user override.

> **Added in migration 0003.**

---

## Line items table

Columns: `Sl. No | Particulars | HSN Code | Amount`

| Form column | System column |
|---|---|
| Sl. No | `invoice_items.sl_no` |
| Particulars | `invoice_items.particulars` |
| HSN Code | `invoice_items.hsn_code` |
| Amount | `invoice_items.amount` (= `quantity × rate`, stored not computed) |

The form does not show quantity/rate explicitly — the user wrote them inline in the Particulars cell. The system separates them into discrete columns (`quantity`, `rate`) for analytics, but the **PDF rendering only shows the four columns above**. Quantity and rate are visible only in the editor.

---

## Totals block (right side)

| Form row | System source |
|---|---|
| TOTAL (subtotal) | `invoices.subtotal` |
| Add: CGST @ X% | `invoices.cgst_amount` (rate from `invoices.gst_snapshot.cgst_percent`) |
| Add: SGST @ X% | `invoices.sgst_amount` |
| (Add: IGST @ X% — for inter-state) | `invoices.igst_amount` |
| GRAND TOTAL | `invoices.grand_total` |

Rule: when bill-to state code matches the franchise state code → CGST + SGST. Otherwise → IGST only. Implemented in the `invoices-finalize` edge function.

---

## Total in words (left side)

> "Rupees: One Lakh Twenty Thousand Six Hundred Fourteen only"

System column: `invoices.grand_total_words`. Computed at finalization from `grand_total` using an Indian-numbering function (lakh / crore aware), persisted on the row so the PDF is reproducible.

---

## Bank Details (bottom-left)

Static block: Bank Name, A/c. No., Branch, IFSC.

| Form field | System source |
|---|---|
| Bank Name | `invoices.bank_snapshot.bank_name` |
| A/c. No. | `invoices.bank_snapshot.account_no` |
| Branch | `invoices.bank_snapshot.branch` |
| IFSC | `invoices.bank_snapshot.ifsc` |

The snapshot is **frozen at finalization** so that updating `bank_details` later doesn't retroactively rewrite already-issued invoices.

---

## Notes / Terms (bottom-left small print)

The four numbered notes vary by franchise (e.g. interest rate, jurisdiction). Stored as `franchises.invoice_terms text[]` (array of lines).

> **Added in migration 0003.**

Sample value for M.R. Air Conditioning:
```
[
  "Payment by Crossed Cheques / Demand Draft only",
  "If not paid on due date Interest @24% will be charged",
  "Goods once sold will not be taken back.",
  "Subject to Mangaluru Jurisdiction"
]
```

---

## Footer (bottom-right)

| Element | Source |
|---|---|
| "M.R. Air Conditioning & Refrigeration Engineering" | `franchises.name` |
| Authorised Signatory line | `franchises.signature_url` (added in migration 0003) |

---

## Field-level gaps captured in migration 0003

- `invoices.date_of_supply date`
- `invoices.ship_to_name text` + `ship_to_address`, `ship_to_gstin`, `ship_to_state`, `ship_to_state_code`
- `franchises.state text` + `state_code text`
- `franchises.signature_url text`
- `franchises.invoice_terms text[]`

These are additive — no data migration needed since no rows exist yet.
