# Runbooks

Step-by-step procedures for common operations. Each runbook contains purpose, targets, commands, success criteria, prohibited actions, and cautions.

---

## 1. Adding a New Feature (Page + Component)

**Purpose**: Add a new user-facing page and associated components.

**Primary targets**:
- `src/app/{feature-name}/page.tsx` (new page)
- `src/components/{feature-name}/` (new components)
- `src/lib/supabase/middleware.ts` (if route needs auth protection)

**Steps**:
1. Create page file at `src/app/{feature-name}/page.tsx`
2. Create components in `src/components/{feature-name}/`
3. If the page requires authentication, add the path to `protectedPaths` array in `src/lib/supabase/middleware.ts` (line 5)
4. If the page uses `useSearchParams()`, wrap the content in a `<Suspense>` boundary (Next.js 16 requirement)
5. If the page needs data, use the `useAuth()` hook for auth state and `getRepository()` for data access
6. Run `npm run build` to verify no build errors
7. Run `npm run lint` to pass security checks
8. Test the page in browser at `http://localhost:3000/{feature-name}`

**Success criteria**:
- `npm run build` succeeds
- `npm run lint` succeeds
- Page renders correctly for both authenticated and unauthenticated states
- If protected, unauthenticated users are redirected to `/login`

**Prohibited actions**:
- Do not import Supabase client directly in components; use `useAuth()` hook
- Do not use `SUPABASE_SERVICE_ROLE_KEY` in client-side code
- Do not create a new Supabase browser client instance; use `createBrowserClient` from `src/lib/supabase`

**Cautions**:
- If the feature is Pro-only, check subscription status via `useAuth()` before rendering
- Use dynamic imports (`next/dynamic`) for heavy modals to reduce bundle size

---

## 2. Adding or Modifying an API Endpoint

**Purpose**: Create or modify a server-side API route.

**Primary targets**:
- `src/app/api/{endpoint}/route.ts`

**Steps**:
1. Create the route file at `src/app/api/{endpoint}/route.ts`
2. Add authentication check using `createRouteHandlerClient(request)` at the top of the handler
3. If the route must support iOS clients, also check for `Authorization: Bearer` header
4. Validate request body with Zod schema using `parseJsonWithSchema(request, schema, options)`
5. Use `requestSchema.strict()` to reject unexpected fields (prevents parameter injection)
6. If the route needs to bypass RLS (admin operations), use `SUPABASE_SERVICE_ROLE_KEY` via `createClient(url, key)` directly -- and document why in a code comment
7. If the route is AI-heavy, add a timeout override in `vercel.json` (`maxDuration: 30` or `60`)
8. Run `npm run lint` (includes SQL injection guard check)
9. Run `npm run build`

**Success criteria**:
- `npm run lint` succeeds (SQL injection guard passes)
- `npm run build` succeeds
- Route returns 401 for unauthenticated requests
- Route rejects malformed input with 400

**Prohibited actions**:
- Do not construct raw SQL strings with user input. Use Supabase query builder or parameterized queries only. The SQL injection guard (`scripts/check-sql-injection-guard.mjs`) will flag violations.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` in response bodies or logs
- Do not use the service role client unless the route specifically requires RLS bypass

**Cautions**:
- Vercel default function timeout is 10s. AI extraction routes need 60s. Add to `vercel.json` if needed.
- All user-facing error messages should be in Japanese. Log messages can be in English.

---

## 3. Database Schema Changes

**Purpose**: Modify the Supabase PostgreSQL schema.

**Primary targets**:
- `supabase/migrations/` (new migration file)
- `shared/types/index.ts` (if adding/changing columns)
- `shared/db/mappers.ts` (if adding/changing columns)
- `src/lib/db/dexie.ts` (if changes affect local IndexedDB schema)

**Steps**:
1. Create a new migration file: `supabase/migrations/YYYYMMDDHHMMSS_{description}.sql`
2. Write the SQL DDL statements
3. If creating a new table, **enable RLS** in the same migration:
   ```sql
   ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can access own data" ON {table_name}
     FOR ALL USING (auth.uid() = user_id);
   ```
4. If adding columns to existing tables, update `shared/types/index.ts` with new fields
5. If adding columns accessed via Supabase, update `shared/db/mappers.ts`
6. If adding fields to Word or Project that need local storage, update `src/lib/db/dexie.ts`:
   - Increment the Dexie version number
   - Add new index definitions if needed for queries
7. Apply the migration to your Supabase project
8. Run `npm run build` to verify TypeScript compilation

**Success criteria**:
- Migration applies without errors
- `npm run build` succeeds
- New tables have RLS enabled (verify with `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';`)
- TypeScript types match the new schema

**Prohibited actions**:
- **Never modify existing applied migration files.** Always create a new migration.
- Do not create tables without RLS unless they contain no user data
- Do not add columns with `NOT NULL` without a `DEFAULT` value (breaks existing rows)

**Cautions**:
- If updating the Dexie schema, existing users' IndexedDB will auto-migrate on next visit. Test with pre-existing local data.
- The database currently has ~43 migrations. Use the timestamp format (`YYYYMMDDHHMMSS_`) for new migrations.

---

## 4. Adding Tests

**Purpose**: Add unit tests for new or existing functionality.

**Primary targets**:
- Co-located test file: `src/lib/{module}/{file}.test.ts` or `src/app/api/{route}/route.test.ts`
- `package.json` scripts.test entry

**Steps**:
1. Create a test file next to the source file with `.test.ts` suffix
2. Use Node.js built-in test runner (`import test from 'node:test'`) and `assert` (`import assert from 'node:assert/strict'`)
3. Add the test file path to the `test` script in `package.json` (line 22) -- it uses a fixed file list
4. Run `npm test` to verify all tests pass
5. For security-specific API tests, use `.security.test.ts` suffix and add to `test:security:routes` pattern

**Success criteria**:
- `npm test` passes with all test files
- New test covers at least the primary success path and one failure path

**Prohibited actions**:
- Do not use Jest, Vitest, or other test frameworks. The project uses Node.js built-in test runner with `tsx`.
- Do not forget to add the test file to `package.json` `test` script -- it will not auto-discover

**Cautions**:
- The `test` script in `package.json` is a fixed, explicit list of test files. New tests are not discovered automatically.
- Security tests (`*.security.test.ts`) are separate and run via `npm run test:security:routes`.

---

## 5. Build Verification

**Purpose**: Verify the codebase compiles and passes all checks before deploying.

**Primary targets**: Entire codebase.

**Steps**:
1. `npm run lint` -- ESLint + SQL injection guard
2. `npm test` -- Unit tests
3. `npm run build` -- Production build
4. (Optional) `npm run security:all` -- Full security suite (SQL + secrets + deps audit)

**Success criteria**:
- All four commands exit with code 0
- No TypeScript errors
- No ESLint errors
- No SQL injection guard violations

**Prohibited actions**:
- Do not skip `npm run lint` -- it includes the SQL injection security check

**Cautions**:
- `npm run build` requires environment variables to be set (at minimum `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`). If missing, the Supabase client returns a mock during build.

---

## 6. Fixing a Bug

**Purpose**: Diagnose and fix a reported bug.

**Primary targets**: Varies by bug.

**Steps**:
1. Identify the affected area using the directory responsibility map in `docs/architecture.md`
2. Check `docs/boundaries.md` to verify the file is safe to modify and review any cautions
3. Check `docs/invariants.md` to verify the fix does not violate any invariants
4. Make the fix
5. If the fix touches subscription logic, run `npm test` (includes subscription status tests)
6. If the fix touches AI extraction, run `npm test` (includes extraction tests)
7. If the fix touches webhook logic, run `npm test` (includes webhook extractor tests)
8. Run `npm run lint`
9. Run `npm run build`

**Success criteria**:
- Bug is resolved
- `npm test` passes
- `npm run lint` passes
- `npm run build` passes
- No invariants violated

**Prohibited actions**:
- Do not modify subscription status logic without running the full test suite
- Do not modify webhook handlers without understanding the idempotency mechanism

---

## 7. Modifying AI Model Configuration

**Purpose**: Change AI models used for extraction or quiz generation.

**Primary targets**:
- `src/lib/ai/config.ts`

**Steps**:
1. Open `src/lib/ai/config.ts`
2. Change the model constant (`EXTRACTION_MODEL` or `QUESTION_GENERATION_MODEL`)
3. If changing provider (Gemini <-> OpenAI), update the `provider` field in the relevant `AI_CONFIG` entry
4. Verify the new model is compatible with the request format (e.g., Gemini supports image input, OpenAI does not support PDF)
5. Test with real image extraction on dev server
6. Run `npm run build`

**Success criteria**:
- Extraction returns valid word lists from real images
- Quiz generation produces valid distractors
- `npm run build` succeeds

**Prohibited actions**:
- Do not remove the Zod validation of AI responses -- AI output is inherently unreliable
- Do not set OpenAI as the extraction provider for PDF mode (OpenAI rejects PDF data URLs)

**Cautions**:
- When `CLOUD_RUN_URL` and `CLOUD_RUN_AUTH_TOKEN` are set, AI calls route through Cloud Run. The model name is still sent to Cloud Run, but the actual API call happens there. Verify Cloud Run supports the new model.
- Temperature and maxOutputTokens are per-mode in `AI_CONFIG`. The `circled` mode uses temperature 0.0 for deterministic output.

---

## 8. Handling a KOMOJU Webhook Incident

**Purpose**: Diagnose and resolve issues with KOMOJU payment webhooks.

**Primary targets**:
- `src/app/api/subscription/webhook/route.ts`
- `src/lib/subscription/billing-activation.ts`
- Supabase tables: `webhook_events`, `subscription_sessions`, `subscriptions`

**Steps**:
1. Check Vercel function logs for the webhook route
2. Verify the webhook secret is correctly set (`KOMOJU_WEBHOOK_SECRET`)
3. Check `webhook_events` table for the event hash to see if it was claimed
4. If double-processing occurred, check the `claim_webhook_event` RPC behavior
5. If activation failed, check the `subscription_sessions` table for the user's session record
6. Verify the `subscriptions` table state for the affected user
7. Reference `docs/ops-komoju-incident-2026-02-09.md` for prior incident patterns

**Success criteria**:
- User's subscription status is correct in the `subscriptions` table
- No duplicate activations

**Prohibited actions**:
- Do not manually update the `subscriptions` table without understanding `pro_source` implications (see INV-02 in `docs/invariants.md`)
- Do not disable webhook signature verification

**Cautions**:
- The webhook handler uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS. Any SQL query in this handler can access all user data.
- The `npm run qa:komoju:webhook-e2e` command hits the real KOMOJU API. Use test API keys only.
