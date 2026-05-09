# Architecture Decision Records

A new ADR every time we pick one option over another and that choice is load-bearing. Append, do not edit (mark superseded if the world changes). Numbered, dated.

Format:

```
## ADR-NNN — Short title
**Date:** YYYY-MM-DD
**Status:** proposed | accepted | superseded by ADR-NNN
**Context:** what forced the decision
**Options considered:** bullet list with one-line trade-offs
**Decision:** what we picked
**Consequences:** good and bad — what falls out of this choice
```

---

## ADR-001 — No schema library on the frontend
**Date:** 2026-04-28
**Status:** accepted

**Context:** Forms need validation; we need to decide whether to use a schema library (zod, yup, valibot) on the frontend.

**Options considered:**
- **zod (shared FE/BE):** strong types, single source of truth, but couples FE and BE deployments and adds bundle weight.
- **zod (FE only):** redundant with backend validation, but nicer DX for forms.
- **react-hook-form built-ins (chosen):** zero extra deps, validation rules colocated with fields, server is the source of truth for correctness.

**Decision:** Use react-hook-form's built-in validation rules on the frontend. Keep validation on the server boundary as the authoritative check. Do not share schemas across the boundary.

**Consequences:**
- (+) Smaller frontend bundle, fewer deps.
- (+) Backend can evolve its validation independently without breaking FE deployments.
- (−) Field rules are duplicated between FE (UX) and BE (correctness). Accepted — they serve different purposes.

---

## ADR-002 — Zustand for client state, TanStack Query for server state
**Date:** 2026-04-28
**Status:** accepted

**Context:** We need a state strategy. React's built-ins are sufficient for component-local state, but cross-component client state and async server data need explicit choices.

**Options considered:**
- **Redux Toolkit:** powerful, but verbose for a CRUD-heavy app and conflates server/client state.
- **Jotai:** atomic, but the mental model is heavier than we need.
- **Zustand (chosen for client state):** small API, no provider boilerplate, easy to test.
- **TanStack Query (chosen for server state):** dedicated to async caching, mutations, invalidation; complements Zustand instead of competing.

**Decision:** Zustand for genuinely cross-component client state (UI state, ephemeral selections). TanStack Query for everything that touches Supabase. `next-themes` for theme. RHF for form state. URL search params for filters/pagination.

**Consequences:**
- (+) Each tool has one job; junior devs can learn each in an hour.
- (+) Server state is never duplicated into a client store, which is the #1 cause of stale-data bugs.
- (−) Four state primitives to teach instead of one. Accepted — the alternative is one primitive misused four ways.

---

## ADR-003 — Money is integer minor units
**Date:** 2026-04-28
**Status:** accepted

**Context:** We need to pick a representation for monetary values. Floats lose precision. Decimals are slow and easy to misuse.

**Options considered:**
- **`NUMERIC(19,4)` in Postgres, `string` in TS:** correct but every operation has to remember the scale.
- **`FLOAT`:** never. `0.1 + 0.2 !== 0.3`.
- **`BIGINT` minor units (chosen):** "$10.00" is `1000`. Math is integer. Format only at the UI edge.

**Decision:** All monetary columns are `BIGINT amount_cents` paired with `currency CHAR(3)`. The frontend stores integers in form state and formats via `Intl.NumberFormat`.

**Consequences:**
- (+) No rounding bugs in arithmetic. Idempotent serialization.
- (+) Same mental model as Stripe, which we will likely integrate.
- (−) Currencies with non-2 minor units (JPY=0, KWD=3) need a per-currency `minor_unit` lookup. We'll add a `currencies` table when we add multi-currency support — flagged for later.

---

## ADR-004 — Forward-only migrations, no down scripts
**Date:** 2026-04-28
**Status:** accepted

**Context:** Migration tooling typically supports up/down. In practice, "down" rarely runs cleanly in production and gives false confidence.

**Decision:** Migrations are forward-only. Recovery from a bad migration is a new forward migration. Local rebuilds use `supabase db reset`.

**Consequences:**
- (+) One code path; less to test.
- (+) Forces engineers to write reversible *changes* (additive, then deprecate, then drop) rather than relying on a rollback button.
- (−) No quick local "undo" for a half-written migration — write a new file or `git reset` and `db reset`.

---

## ADR-006 — Client-only Next.js (no SSR, no route handlers, no server actions)
**Date:** 2026-04-28
**Status:** accepted

**Context:** Next.js offers server components, route handlers, server actions, and middleware. We have to decide which of these we use. Each one extends the trust boundary into the frontend repo, requires server-only env, and complicates deployment.

**Options considered:**
- **Full SSR + server actions:** richer DX, but the frontend repo now holds secrets (service-role key, webhook signing keys) and the deploy target needs a Node runtime.
- **Hybrid (SSR for reads, Edge Functions for writes):** muddies the rule of "server boundary lives in `backend/`". Two places to look when something breaks.
- **Client-only Next (chosen):** Next is just a router + bundler. The frontend has no server code, no secrets, no Node runtime requirement. The only server boundary is Supabase Edge Functions in `backend/`.

**Decision:** Use Next.js in client-only mode. No server components for data, no route handlers, no server actions, no middleware. All Supabase access is from the browser with the anon key. Money-mutating operations are `fetch` calls to Supabase Edge Functions.

**Consequences:**
- (+) The frontend repo has zero secrets. `NEXT_PUBLIC_…` is the only prefix used. Anything leaked is already public.
- (+) One backend, one trust boundary. RLS + Edge Functions are the only place authorization decisions are made.
- (+) Frontend deploys as a static bundle (Vercel, Netlify, S3+CloudFront, anywhere). No Node runtime required at the edge.
- (−) Initial render of authenticated pages waits for the client to hydrate and call Supabase. Acceptable for an internal-facing billing app; would need re-evaluation for public marketing pages.
- (−) Cannot use Next's `<Image>` optimization for remote images without a separate optimizer, since there is no server. Acceptable.

---

## ADR-005 — Payment service provider (placeholder)
**Date:** TBD
**Status:** proposed

**Context:** We need a PSP (Stripe, Adyen, Razorpay, etc.). Decision deferred until pricing region/customer base is fixed.

**Decision:** Pending. Until decided, all "payment captured" flows are mocked at the Edge Function boundary so the UI can be built end-to-end against a fake provider. The provider abstraction lives at `backend/supabase/functions/_shared/payments/` (to be added).

---
