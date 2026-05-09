# Billing App — CLAUDE.md

Authoritative guide for any Claude Code (or human) working in this repo. Read this **before** writing code. If a rule below conflicts with what you're about to do, stop and reconcile first.

---

## 1. What this project is

A production-grade billing system.

- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions, Realtime).
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS — used in **client-only mode**. No server components for data, no route handlers, no server actions, no middleware. Next.js is here for the bundler, router, and DX; not for SSR. All Supabase access happens from the browser.
- **Domain:** multi-franchise Indian GST tax invoicing. Entities: franchises, users, user_franchise_roles, bank_details, gst_config, customers, invoices, invoice_items, login_logs, audit_logs. Inventory (products / stock_movements) is scaffolded but parked behind a comment block until enabled.

The repo is split into two independently deployable apps:

```
billing_app/
├── backend/          # Supabase project (migrations, RLS, edge functions)
└── frontend/         # Next.js app
```

---

## 2. Non-negotiable rules

These rules exist because billing software touches money. A bug here is not a UX paper-cut — it is a chargeback, a lawsuit, or a tax filing error.

1. **Money is `numeric(12,2)` in INR.** This is an Indian GST system; all amounts are rupees with 2-decimal paise. No multi-currency, no integer-cent representation. (See ADR-003 — superseded.)
2. **`amount = quantity × rate` is stored, never recomputed on read.** Rates change; persisted line totals must not.
3. **Finalized invoices are frozen.** Once an invoice's `status` flips from `draft` to `finalised`, the row's bank/GST snapshots and amounts are immutable. Corrections happen via cancellation + new invoice, never by editing a finalized row.
4. **RLS is on for every table.** No exceptions. A new table without a policy is a leak. The default deny is enforced by `ALTER TABLE … ENABLE ROW LEVEL SECURITY` in the same migration that creates the table.
5. **Frontend uses URL + anon (publishable) key only.** The service-role key is backend-only — it never appears in `frontend/`, never in any `NEXT_PUBLIC_…` var, never in a browser bundle.
6. **All frontend data access goes through Edge Functions.** No `supabase.from('...').select()` from the browser, no `.insert()`, no `.update()`, no `.delete()`. The browser only uses `supabase.auth.*` (sign-in, sign-out, session) and `fetch`-to-Edge-Function. RLS is defense-in-depth, not the primary contract.
7. **Every Edge Function handles CORS preflight.** OPTIONS returns 204 with the right headers; every response (including errors) carries `Access-Control-Allow-Origin`. The shared helper `_shared/cors.ts` is mandatory.
8. **All schema changes are migrations.** No clicking in the Supabase dashboard. If it's not in `backend/supabase/migrations/`, it doesn't exist. Forward-only.
9. **Idempotency for mutation endpoints.** Every create-invoice / finalize / cancel call accepts an `Idempotency-Key` header and is replayed from `idempotency_keys` for 24h.
10. **Audit everything.** The `audit_logs` table is written by DB triggers — not app code — for every INSERT/UPDATE/DELETE on every audited table. Triggers can't be bypassed.
11. **Auth is invite-only.** `enable_signup = false` in production. New users are created via the `auth-invite-user` Edge Function, which sends a Supabase Auth invite and inserts the matching `public.users` row + `user_franchise_roles` record in one transaction.

If you find yourself wanting to break one of these, write the proposal in `docs/` and get a human review first. Do not silently bypass.

---

## 3. Repo layout

```
billing_app/
├── CLAUDE.md                          # this file
├── backend/
│   ├── supabase/
│   │   ├── config.toml
│   │   ├── migrations/                # timestamped SQL, append-only
│   │   ├── seed.sql                   # local-dev seed data only
│   │   └── functions/                 # Deno edge functions
│   │       ├── _shared/               # cors, supabase client, errors
│   │       ├── create-invoice/
│   │       └── mark-invoice-paid/
│   ├── docs/
│   │   ├── SCHEMA.md                  # ER diagram + table dictionary
│   │   └── SECURITY.md                # RLS model, threat model
│   ├── .env.example
│   └── README.md
└── frontend/
    ├── src/
    │   ├── app/                       # Next.js App Router
    │   ├── components/
    │   │   ├── ui/                    # primitive design-system components
    │   │   └── layout/                # app shell
    │   ├── features/                  # feature-first modules (bulletproof-react)
    │   │   ├── invoices/
    │   │   ├── customers/
    │   │   └── payments/
    │   ├── lib/                       # framework-agnostic helpers
    │   │   └── supabase/              # browser/server/middleware clients
    │   ├── hooks/
    │   ├── config/                    # env, constants
    │   └── types/                     # shared types incl. supabase-generated
    ├── docs/
    │   ├── DESIGN_GUIDE.md
    │   └── ARCHITECTURE.md
    ├── middleware.ts
    └── README.md
```

---

## 4. Frontend rules

We follow the **bulletproof-react** philosophy: feature-first, unidirectional dependencies, no cross-feature imports.

### 4.1 Rendering model

- **Client-only.** No server components for data, no route handlers, no server actions, no middleware. Next.js is here for routing, bundling, and DX — not for SSR.
- Default every page/component to client-rendered. Static rendering is fine for marketing pages but never fetches data at build time.
- All data lives in the browser via the Supabase client + TanStack Query. Authentication state lives in `localStorage` via the Supabase auth helpers.

### 4.2 Dependency direction

```
shared (ui, lib, hooks, config, types, stores)
   ↑
features/<name>/   ← may import shared, never another feature
   ↑
app/               ← composes features and shared
```

If `features/invoices` needs something from `features/customers`, lift the shared piece into `shared/` (or a new `features/_shared/`). Cross-feature imports are a code smell that we reject in review.

### 4.3 Components

- **Every UI primitive lives in `src/components/ui/`.** Buttons, inputs, cards, badges, dialogs, tables. Pages and feature components compose these — they do **not** style raw `<button>` elements directly.
- Variants are defined with `class-variance-authority` (`cva`). No inline conditional Tailwind chains for variants.
- Components are accessible by default: focus rings, ARIA labels, keyboard navigation. If you can't tab to it, it's broken.

### 4.4 Theming

- Light + dark themes via `next-themes`, controlled by a `data-theme` attribute on `<html>`.
- All colors come from CSS custom properties defined in `src/app/globals.css` and consumed by Tailwind utility classes.
- **Never hard-code hex values in components.** `bg-background`, `text-foreground`, `border-border`, `text-destructive` — always tokens.

### 4.5 State

- **Server state:** TanStack Query. Every read from Supabase is a query; every write is a mutation with `onSuccess` invalidation. No bespoke loading/error reducers.
- **Client state:** Zustand, only when state is genuinely shared across non-parent/child components (theme is handled by `next-themes`, ephemeral form state by `react-hook-form`). Stores live in `features/<name>/store.ts` or `src/stores/` for cross-feature.
- **URL state:** search params for filters/pagination — never duplicated into a store.
- Reads from Supabase use the anon key + the signed-in user's JWT, gated by RLS. Money-mutating writes call Edge Functions over `fetch` — never `supabase.from('invoices').insert(...)` directly.
- Errors surface through a single `<ErrorBoundary>` + Sonner toast pattern; never `alert()`.

### 4.6 Forms & validation

- `react-hook-form` for state and submission. Validation uses RHF's built-in rules (`required`, `pattern`, `min`, `max`, `validate`) — we do not pull in a schema library on the frontend.
- The **server boundary** (Edge Function / route handler) is the source of truth for validation. The frontend's job is fast feedback; the backend's job is correctness. Duplicate the constraints intentionally — don't share a schema across the boundary.
- Money inputs use a dedicated `<MoneyInput />` that stores integer minor units in form state and only formats on display.

---

## 5. Backend rules

### 5.1 Migrations

- Filename: `YYYYMMDDHHMMSS_short_description.sql` (UTC). The Supabase CLI generates this with `supabase migration new`.
- Forward-only. No down migrations checked in — production rollback is a new forward migration.
- Each migration is **idempotent where possible** (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).
- Every `CREATE TABLE` in a migration is followed in the same file by `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and at least one policy.

### 5.2 SQL conventions

- `snake_case` for tables and columns. Tables are plural (`invoices`), join tables are alphabetized (`customer_tags`, not `tag_customers`).
- Primary keys: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`.
- Every table has `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. The `updated_at` is maintained by the `set_updated_at()` trigger.
- Foreign keys are explicit and named: `CONSTRAINT invoices_customer_id_fkey`.
- Enums use `CREATE TYPE … AS ENUM`, not `CHECK (status IN …)`. Migrating an enum requires `ALTER TYPE … ADD VALUE`.
- Indexes for every foreign key and every `WHERE`-clause column hit by an Edge Function.

### 5.3 RLS

The model: `auth.uid()` → `users.id` → `users.organization_id` → row's `organization_id`. Multi-tenant isolation is at the organization level. See `backend/docs/SECURITY.md` for the full policy matrix.

### 5.4 Edge functions

- Deno + TypeScript. Imports use `npm:` / `jsr:` specifiers.
- Every function: validates input via the shared `validate()` helper (`_shared/validation.ts`, hand-rolled — no schema library), authenticates via the request JWT, authorizes via RLS, returns typed JSON, logs to `audit_log` on mutation.
- Shared CORS, error, and Supabase-client helpers live in `supabase/functions/_shared/`.
- Idempotency: `Idempotency-Key` header is hashed and stored in `idempotency_keys`; a duplicate within 24h replays the cached response.

### 5.5 Functions/triggers

- Updated-at trigger on every table.
- Audit trigger on every money-touching table.
- Status transitions enforced by `CHECK` constraints + a `validate_status_transition()` trigger — you can't go from `paid` back to `draft`.

---

## 6. Workflows

### Local backend
```bash
cd backend
supabase start                  # boots local Postgres + Studio
supabase db reset               # rebuilds from migrations + seed.sql
supabase functions serve        # runs edge functions locally
supabase gen types typescript --local > ../frontend/src/types/database.ts
```

### Local frontend
```bash
cd frontend
cp .env.example .env.local      # fill in local supabase URL + anon key
npm install
npm run dev
```

### Adding a migration
```bash
cd backend
supabase migration new add_refunds_table
# edit the generated SQL — table + RLS + policies + indexes + audit trigger
supabase db reset               # apply locally and verify
supabase gen types typescript --local > ../frontend/src/types/database.ts
```

### Before opening a PR
- `npm run typecheck && npm run lint && npm run test` in `frontend/`.
- `supabase db lint` in `backend/`.
- New tables must have: PK, FKs, indexes, RLS, policies, updated-at trigger, audit trigger if money-touching.
- New edge functions must have: input validation (`validate()` helper), auth check, error handler, idempotency support if mutating money.

---

## 7. Design system summary

Full reference: `frontend/docs/DESIGN_GUIDE.md`.

- Palette: white surfaces / black ink / red accent. Status colors are derived (paid=green, due=amber, overdue=red, draft=neutral).
- Typography: Inter (UI), JetBrains Mono (amounts, IDs, codes). Tabular numerals for money.
- Radii: `--radius` = 0.5rem; cards 0.75rem; buttons 0.5rem.
- Spacing: 4-px grid (Tailwind defaults).
- Motion: 150ms ease-out for hover, 200ms for entry. `prefers-reduced-motion` is respected.

---

## 8. Documentation discipline (document-as-you-build)

**Rule:** every meaningful change leaves a written trace. If a future developer (or future Claude session) needs to understand *why* something looks the way it does, the answer must already be on disk. We treat docs as part of the code, not an afterthought.

### 8.1 Three living documents

1. **`docs/BUILD_LOG.md`** — append-only chronological journal. Every scaffolding step, dependency added, file created, schema change, edge function added, design-system token introduced. One dated entry per change. Newest at the top.
2. **`docs/DECISIONS.md`** — Architecture Decision Records (ADRs). Use this when a *choice* was made between alternatives (e.g. "Zustand over Redux", "no zod", "amount_cents BIGINT not NUMERIC"). Format: Context → Options → Decision → Consequences.
3. **Per-area READMEs and `docs/` folders** — `frontend/docs/`, `backend/docs/`, and a `README.md` in any folder a new dev would open first.

### 8.2 What to write down

- Every dependency added, with one sentence on *why this one* and what it replaces.
- Every migration filename, what it changes, and any data backfill considerations.
- Every edge function added, its inputs/outputs, idempotency behavior, who can call it.
- Every design token introduced or changed.
- Every "we considered X but did Y because Z" — that's the most valuable kind of entry, because the diff alone never tells you what wasn't chosen.

### 8.3 What NOT to write down

- Things `git log` already says (who edited what when).
- Things obvious from reading the code (function signatures, prop lists).
- Daily progress narration — keep entries change-shaped, not session-shaped.

### 8.4 The migration test

Before merging anything non-trivial, ask: *if we had to rebuild this app from scratch on a different stack in 6 months, would the docs let us do it?* If no, write more.

---

## 9. What to do when stuck

1. Re-read the relevant section here.
2. Check `backend/docs/SCHEMA.md` and `backend/docs/SECURITY.md` for backend questions.
3. Check `frontend/docs/DESIGN_GUIDE.md` and `frontend/docs/ARCHITECTURE.md` for frontend questions.
4. If the answer isn't documented, propose the change in a `docs/` markdown file and get review **before** coding.

Don't invent conventions. Don't half-finish features. Don't bypass RLS. Don't store dollars as floats.
