# Billing System

A multi-franchise GST tax-invoicing application for Indian businesses. Built as a Supabase + Next.js stack with strict separation between the data layer and the UI.

> **Authoritative engineering guide:** [`CLAUDE.md`](./CLAUDE.md). Anything in this README is a friendly summary; `CLAUDE.md` wins on conflict.

---

## Stack

| Layer       | Tech                                                                 |
| ----------- | -------------------------------------------------------------------- |
| Database    | Supabase Postgres (RLS-enforced, multi-tenant by franchise)          |
| Auth        | Supabase Auth (invite-only, no public signup)                        |
| API         | Supabase Edge Functions (Deno + TypeScript)                          |
| Frontend    | Next.js 15 (client-only), TypeScript, Tailwind CSS                   |
| State       | TanStack Query (server state), Zustand (cross-feature client state)  |
| Forms       | react-hook-form                                                      |
| Icons/UI    | Component primitives in `frontend/src/components/ui` via `cva`       |

The frontend uses Next.js as a **bundler + router only** — no SSR, no server components for data, no route handlers, no server actions, no middleware. All data access goes through Edge Functions called from the browser.

---

## Repository layout

```
billing_app/
├── CLAUDE.md          # Engineering rulebook (read first)
├── README.md          # This file
├── docs/              # Cross-cutting docs (BUILD_LOG, DECISIONS, references)
├── backend/
│   └── supabase/
│       ├── migrations/    # Forward-only timestamped SQL
│       ├── functions/     # Edge Functions (one folder per endpoint)
│       └── seed.sql       # Local-dev seed data only
└── frontend/
    └── src/
        ├── app/           # Next.js App Router pages
        ├── components/    # ui primitives + layout shell
        ├── features/      # Feature-first modules (bulletproof-react)
        ├── hooks/
        ├── lib/           # Framework-agnostic helpers
        ├── config/
        └── types/
```

Feature modules under `frontend/src/features/<name>` may import from `shared/` but **never** from another feature. That rule is enforced in code review.

---

## Domain model

Core entities (full schema in `backend/docs/SCHEMA.md`):

- `franchises` — tenants
- `users` + `user_franchise_roles` — auth identities and per-franchise roles
- `customers` — per-franchise customer book
- `invoices` + `invoice_items` — money-touching, append-mostly
- `bank_details`, `gst_config` — franchise-level settings, snapshotted onto finalized invoices
- `audit_logs`, `login_logs` — DB-trigger-driven audit trail
- `idempotency_keys` — replay protection for mutation endpoints

Money is stored as `numeric(12,2)` in INR. Line totals are persisted (`amount = quantity × rate`) and never recomputed on read. Once an invoice is finalized, its row is frozen — corrections happen via cancellation + reissue.

---

## Local development

### Prerequisites

- Node.js 20+
- Supabase CLI (`npm i -g supabase`)
- Docker Desktop (for the local Supabase stack)

### Backend

```bash
cd backend
cp .env.example .env                 # fill in if needed
supabase start                       # boots local Postgres + Studio + Auth
supabase db reset                    # apply migrations + seed.sql
supabase functions serve             # run Edge Functions on :54321/functions/v1
```

Generate frontend types after any schema change:

```bash
supabase gen types typescript --local > ../frontend/src/types/database.ts
```

### Frontend

```bash
cd frontend
cp .env.example .env.local           # fill in NEXT_PUBLIC_SUPABASE_URL + anon key
npm install
npm run dev
```

The app expects to talk to a running local Supabase instance by default.

### Adding a migration

```bash
cd backend
supabase migration new <short_description>
# edit the generated SQL — table + RLS + policies + indexes + audit trigger
supabase db reset
supabase gen types typescript --local > ../frontend/src/types/database.ts
```

---

## Non-negotiable rules (summary)

These exist because billing software touches money. Full reasoning in `CLAUDE.md`.

1. Money is `numeric(12,2)` INR. No floats. No multi-currency.
2. Line `amount` is stored, never recomputed on read.
3. Finalized invoices are immutable. Edits = cancel + reissue.
4. RLS is on for every table. Default deny.
5. The browser uses the Supabase **anon key** only. The service-role key never appears in `frontend/`.
6. All frontend data access goes through Edge Functions. No `supabase.from(...).insert()` from the browser.
7. Every Edge Function handles CORS preflight via the shared helper.
8. All schema changes are migrations. Never click in the dashboard.
9. Mutation endpoints accept `Idempotency-Key` and replay for 24h.
10. Audit logging is DB-trigger-driven, not app-code-driven.
11. Auth is invite-only.

---

## Documentation

| Document                                  | What's in it                                  |
| ----------------------------------------- | --------------------------------------------- |
| `CLAUDE.md`                               | Engineering rulebook, conventions, do/don't  |
| `docs/BUILD_LOG.md`                       | Append-only journal of meaningful changes    |
| `docs/DECISIONS.md`                       | ADRs — chosen approach + alternatives        |
| `backend/docs/SCHEMA.md`                  | ER diagram + table dictionary                 |
| `backend/docs/SECURITY.md`                | RLS policy matrix + threat model              |
| `frontend/docs/DESIGN_GUIDE.md`           | Tokens, typography, motion                    |
| `frontend/docs/ARCHITECTURE.md`           | Frontend module boundaries                    |

If the answer to a question isn't in one of these, propose the doc change in a PR before writing code that depends on the assumption.

---

## License

Proprietary. Not for redistribution.
