# Invariants

Rules that must hold at all times. Violating any **Confirmed** invariant will cause user-facing bugs, data loss, or security vulnerabilities.

---

## Confirmed Invariants

These have been verified against the source code.

### INV-01: Subscription row on signup

Every Supabase user gets a `subscriptions` row on signup via the database trigger `on_auth_user_created`, which runs `handle_new_user()` (initial definition in `supabase/migrations/001_initial_schema.sql`; later migrations replace the function body, including `supabase/migrations/20260403180000_create_profiles.sql` and `supabase/migrations/20260404150000_auto_pro_first_66_users.sql`).

The trigger always **inserts** `status='free'`, `plan='free'`. For a limited launch campaign, the same function may **immediately update** that row to permanent test Pro for eligible new users (see `docs/ops-auto-pro-first-66-2026-04-04.md`).

**Consequence of violation**: New users cannot use the app. Hooks assume a subscription row always exists.

### INV-02: `pro_source='none'` means cancelled

In `src/lib/subscription/status.ts:getEffectiveSubscriptionStatus()`, when `status='active'` and `plan='pro'` but `proSource='none'`, the function returns `'cancelled'`. This prevents manually set Pro subscriptions from being treated as paid.

**Consequence of violation**: Users with manually cleared subscriptions would incorrectly see Pro features.

Source: `src/lib/subscription/status.ts` lines 73-74.

### INV-03: Repository selection by subscription status

`getRepository()` in `src/lib/db/index.ts`:
- `subscriptionStatus === 'active'` returns `hybridRepository` (IndexedDB + Supabase sync)
- `wasPro === true` (and not active) returns `readonlyRemoteRepository` (Supabase read-only)
- Otherwise returns `localRepository` (IndexedDB only)

**Consequence of violation**: Free users could write to Supabase (billing impact, data leakage), or Pro users could lose cloud sync.

Source: `src/lib/db/index.ts` lines 25-38.

### INV-04: IndexedDB is never accessed server-side

`getDb()` in `src/lib/db/dexie.ts` throws `Error('IndexedDB is not available on server side')` when `typeof window === 'undefined'`.

**Consequence of violation**: Server-side rendering crashes or build failures.

Source: `src/lib/db/dexie.ts` lines 69-72.

### INV-05: KOMOJU webhook signature verification

The webhook handler at `src/app/api/subscription/webhook/route.ts` verifies the HMAC-SHA256 signature using `verifyWebhookSignature()` from `src/lib/komoju/client.ts` (timing-safe comparison via `crypto.timingSafeEqual`) **before** any processing occurs.

**Consequence of violation**: Attackers could forge webhook events to activate Pro subscriptions without payment.

Source: `src/app/api/subscription/webhook/route.ts` lines 56-78, `src/lib/komoju/client.ts` line 4.

### INV-06: RLS on core tables

Row Level Security is enabled on `subscriptions`, `projects`, `words` tables (in `supabase/migrations/001_initial_schema.sql`). Users can only access their own data through the anon key.

**Consequence of violation**: Users could read/write other users' data.

### INV-07: Supabase browser client is singleton

`src/lib/supabase/client.ts` uses a module-level `supabaseInstance` variable. `createClient()` returns the existing instance if it exists.

**Consequence of violation**: Multiple Supabase client instances cause auth state desynchronization and memory leaks.

Source: `src/lib/supabase/client.ts` lines 4, 16-18.

### INV-08: AI responses validated with Zod

All AI extraction responses are validated with Zod schemas before use. Malformed AI output is expected and handled. The validation schemas are in `src/lib/schemas/`.

**Consequence of violation**: Malformed AI output could crash the app or corrupt stored data.

### INV-09: Pro-only extraction modes

Extraction modes `circled`, `highlighted`, `eiken`, `idiom`, and `wrong` require Pro subscription. This is enforced server-side in `src/app/api/extract/route.ts` via the `requiresPro` flag passed to `check_and_increment_scan` RPC.

**Consequence of violation**: Free users access Pro-only features.

Source: `src/app/api/extract/route.ts` lines 155-157.

### INV-10: Protected routes redirect to login

Middleware at `src/lib/supabase/middleware.ts` redirects unauthenticated users to `/login` for these paths: `/project`, `/quiz`, `/quiz2`, `/scan`, `/settings`, `/subscription`, `/share`, `/flashcard`, `/sentence-quiz`, `/favorites`, `/grammar`, `/stats`.

**Consequence of violation**: Unauthenticated access to user data.

Source: `src/lib/supabase/middleware.ts` line 5.

### INV-11: Full sync safety guard

`HybridWordRepository.fullSync()` skips destructive local data replacement when remote returns 0 projects but local has existing data (line 108 of `src/lib/db/hybrid-repository.ts`).

**Consequence of violation**: A temporary Supabase outage or empty response could wipe all local user data.

Source: `src/lib/db/hybrid-repository.ts` lines 107-113.

### INV-12: Service role key server-side only

`SUPABASE_SERVICE_ROLE_KEY` is only used in server-side API routes. It must never appear in client-side code or be exposed to the browser. This key bypasses all RLS policies.

**Consequence of violation**: Complete database access for any attacker who obtains the key.

### INV-13: Scan example generation never blocks completion, but leaves diagnostics

`/api/extract` and `/api/scan-jobs/process` treat example sentence generation as best-effort work. A partial or total example-generation failure must not flip an otherwise successful scan to failed. When `scan-jobs/process` attempts example generation, it must persist an `exampleGeneration` summary in `scan_jobs.result`, and partial/total failure must add a warning code.

**Consequence of violation**: Scans become brittle during transient AI failures, or example-generation regressions become invisible in production.

---

## Candidate Invariants

These are likely true based on code patterns but not exhaustively verified across all call sites.

### CAND-01: API routes authenticate via cookie or Bearer token

API routes use `createRouteHandlerClient(request)` and then check for a `Bearer` token in the `Authorization` header (iOS path) or use cookie-based auth (web path). Both patterns appear in `src/app/api/extract/route.ts` and are likely consistent across routes.

### CAND-02: Japanese for user-facing errors, English for logs

User-facing error messages are in Japanese. Developer/log messages are in English. Observed in `src/app/api/extract/route.ts` and `src/lib/db/readonly-remote-repository.ts`.

### CAND-03: Webhook idempotency via `claim_webhook_event`

The KOMOJU webhook uses `claim_webhook_event` Supabase RPC to prevent double-processing. The `webhook_events` table stores processed event hashes.

### CAND-04: `@/` path alias resolves to `src/`

Configured in `tsconfig.json` paths: `"@/*": ["./src/*"]`. All imports should use this alias.

Source: `tsconfig.json` line 22.

### CAND-05: Client hooks never call Supabase directly for auth

Client components use `useAuth()` hook for all authentication and subscription state, never calling Supabase auth methods directly.

### CAND-06: localStorage keys prefixed consistently

localStorage keys use `scanvocab_` prefix (stats, scan tracking, sync) or `merken_` prefix (auth, subscription cache). SessionStorage keys use `scanvocab_` prefix. See full inventory in `docs/_discovery_notes.md` Appendix.

---

## Open Questions

These items need human verification.

1. **RLS coverage on tables added after migration 001** (Audited 2026-03-02):
   All tables have RLS enabled. Status:
   - `daily_scan_usage`: RLS enabled. SELECT only; INSERT/UPDATE via SECURITY DEFINER RPC.
   - `scan_jobs`: RLS enabled. UPDATE policy fixed to `service_role` only (migration `20260302090000`).
   - `otp_requests`: RLS enabled. Service-role-only access (fixed in migration `20260209000500`).
   - `user_activity_logs`: RLS enabled. SELECT + INSERT.
   - `collections` / `collection_projects`: RLS enabled. Full CRUD.
   - `web_push_subscriptions`: RLS enabled. Full CRUD.
   - `word_similar_cache`: RLS enabled. Full CRUD.
   - `api_cost_events`: RLS enabled. Service-role full access + authenticated SELECT own.
   - `feature_usage_daily`: RLS enabled. SELECT only; INSERT/UPDATE dropped intentionally (writes via SECURITY DEFINER RPC).
   - `ios_device_tokens`: RLS enabled. Full CRUD.
   - `webhook_events` / `subscription_sessions`: RLS enabled. Service-role only (migration `20260209000500`).

2. **Scan limit RPC atomicity**: Is `check_and_increment_scan` atomic? If two concurrent requests arrive, can they both pass the limit check?

3. **Dexie version migration reliability**: The Dexie schema is at version 6. When a user upgrades from an older version, does the auto-migration handle all intermediate versions reliably?
