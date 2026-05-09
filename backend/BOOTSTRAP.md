# Bootstrap

How to get from zero to "I can sign in and create a bill" on a fresh Supabase project. Read this once before running anything.

## Prereqs

- Supabase CLI installed (`npm i -g supabase` or `brew install supabase/tap/supabase`)
- Docker Desktop running (the local Supabase stack runs in containers)
- Node 20+, npm

## 1. Start the local stack

```bash
cd backend
supabase start          # boots Postgres, Studio, GoTrue, Storage, Functions
supabase db reset       # applies migrations and seed.sql
```

`supabase start` prints the API URL, anon key, and service-role key. Copy the anon key — the frontend needs it.

The seed inserts:
- 1 franchise: **M.R. Air Conditioning & Refrigeration Engineering** (slug `mr-air-con`)
- 1 active bank record + 1 active GST config (9 % CGST + 9 % SGST, 18 % IGST)
- 2 sample customers (Karnataka — intra-state; Maharashtra — inter-state)

## 2. Create your first user

The product is invite-only (`enable_signup = false` in production), but for
local dev you create the first user manually:

1. Open Supabase Studio at the URL printed by `supabase start` (default: http://localhost:54323).
2. **Authentication → Users → Add user → "Create new user"** — fill in email + password, leave "Auto Confirm User" checked.
3. The `on_auth_user_created` trigger (migration `0004`) inserts a matching
   `public.users` row automatically. Verify in **Table Editor → public.users**.

## 3. Grant the user access to the seeded franchise

Either make them a super-admin (sees everything) **or** assign a per-franchise role.

Open Studio's SQL Editor and run **one** of:

```sql
-- Option A — super admin (simplest for solo dev)
update public.users
   set is_super_admin = true
 where email = 'YOU@example.com';
```

```sql
-- Option B — explicit franchise role (closer to production reality)
insert into public.user_franchise_roles (user_id, franchise_id, role)
select u.id, f.id, 'franchise_admin'
  from public.users u, public.franchises f
 where u.email = 'YOU@example.com'
   and f.slug  = 'mr-air-con';
```

## 4. Serve Edge Functions

```bash
supabase functions serve
```

This runs every function in `supabase/functions/` on `http://localhost:54321/functions/v1/<name>`.

## 5. Configure the frontend env

```bash
cd ../frontend
cp .env.example .env.local
```

Fill in `.env.local`:

```ini
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase start` output>
NEXT_PUBLIC_FUNCTIONS_URL=http://localhost:54321/functions/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 6. Run the frontend

```bash
npm install
npm run dev
```

Visit http://localhost:3000 — you should be redirected to `/login`. Sign in with the user from step 2.

## 7. (Once the UI lands) Create a bill

After step 6, the franchise picker (or auto-redirect for a single franchise) → invoice list → "New invoice" form → save → PDF download.

## Common issues

- **`Sign-in required` errors from edge functions** — the functions serve binary needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in env. The CLI sets these automatically when you run `supabase functions serve`. If you're running the function binary by hand, export them yourself.
- **`No active GST configuration for this franchise`** — `gst_config.is_active` must be true for exactly one row per franchise. Check the seed ran.
- **`No active bank details for this franchise`** — same, for `bank_details.is_active`.
- **CORS preflight failing** — the functions read `ALLOWED_ORIGINS` (comma-separated). Default is `http://localhost:3000`.
