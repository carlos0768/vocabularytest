# Command Reference

All commands should be run from the project root directory (`/Users/haradakarurosukei/Desktop/Working/englishvo`).

---

## Development

### `npm run dev`

- **What it does**: Starts the Next.js development server on `localhost:3000`
- **Prerequisites**: Environment variables in `.env.local` (at minimum `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for auth to work)
- **Danger level**: Safe -- read-only, no side effects
- **Notes**: Hot reloads on file changes. IndexedDB data persists across restarts.

### `npm run build`

- **What it does**: Creates a production build of the Next.js application
- **Prerequisites**: Environment variables set. TypeScript must compile without errors.
- **Danger level**: Safe -- writes only to `.next/` directory
- **Notes**: If Supabase env vars are missing, the Supabase client returns a mock during build (SSR safe). Build will still succeed.

### `npm start`

- **What it does**: Starts the production server (serves the `.next/` build output)
- **Prerequisites**: `npm run build` must have been run first
- **Danger level**: Safe

---

## Quality Checks

### `npm run lint`

- **What it does**: Runs two checks in sequence:
  1. `npm run security:sql` -- SQL injection guard (`scripts/check-sql-injection-guard.mjs`)
  2. `eslint` -- Standard ESLint checks
- **Prerequisites**: None
- **Danger level**: Safe -- read-only analysis
- **Notes**: This is a broad legacy lint command. For Web prelaunch verification, use `npm run lint:web` or `npm run verify`.

### `npm run lint:web`

- **What it does**: Runs ESLint for the Web app prelaunch surface: `src/`, `shared/`, Next/PostCSS/ESLint config, and security guard scripts.
- **Prerequisites**: None
- **Danger level**: Safe -- read-only analysis
- **Notes**: Excludes separate or generated areas such as `mobile/`, `ios-native/`, `cloud-run-scan/`, `動画素材/`, `.next/`, `node_modules/`, build/dist/coverage/out, and legacy/experimental directories.

### `npm run verify`

- **What it does**: Runs the minimum prelaunch verification sequence:
  1. `npm run lint:web`
  2. `npm run security:all`
  3. `npm test`
  4. `npm run test:security`
  5. `npm run build`
- **Prerequisites**: Environment variables needed by `npm run build`
- **Danger level**: Safe -- writes only build output under `.next/`
- **Notes**: This is the Web app prelaunch gate. It does not run the separate Cloud Run scan service tests; use `npm run test:cloud-run-scan` for that package.

### `npm test`

- **What it does**: Runs `npm run test:web`
- **Prerequisites**: None (tests mock external dependencies)
- **Danger level**: Safe -- no external API calls, no database writes
- **Notes**: This remains a curated fixed list, not full auto-discovery. Full discovery currently includes stale excluded tests documented in `docs/maintenance/TASKS.md`.

### `npm run test:web`

- **What it does**: Runs curated Web/shared unit tests using Node.js built-in test runner with `tsx`
- **Prerequisites**: None (tests mock external dependencies)
- **Danger level**: Safe -- no external API calls, no database writes
- **Test files** (curated fixed list in `package.json`):
  - `src/lib/api/internal-worker.test.ts`
  - `src/lib/stripe/client.test.ts`
  - `src/lib/appstore/config.test.ts`
  - `src/lib/appstore/verify.test.ts`
  - `src/lib/appstore/notifications.test.ts`
  - `src/lib/subscription/status.test.ts`
  - `src/lib/subscription/display.test.ts`
  - `src/lib/subscription/reconcile-status.test.ts`
  - `src/lib/subscription/billing-activation.test.ts`
  - `src/lib/db/remote-repository.test.ts`
  - `src/lib/db/hybrid-repository.test.ts`
  - `src/lib/projects/load-helpers.test.ts`
  - `src/lib/stats/calendar.test.ts`
  - `src/lib/ai/extract-circled-words.test.ts`
  - `src/lib/ai/extract-highlighted-words.test.ts`
  - `src/lib/ai/extract-eiken-words.test.ts`
  - `src/lib/ai/extract-wrong-answers.test.ts`
  - `src/lib/ai/generate-example-sentences.test.ts`
  - `src/lib/lexicon/master-first-scan.test.ts`
  - `src/lib/lexicon/resolver.test.ts`
  - `src/lib/lexicon/word-resolution-jobs.test.ts`
  - `src/lib/words/backfill-japanese.test.ts`
  - `src/lib/schemas/ai-response.test.ts`
  - `src/app/api/extract/route.provider.test.ts`
  - `src/app/api/scan-jobs/process/route.extractor.test.ts`
  - `src/app/api/words/create/route.test.ts`
  - `src/app/api/subscription/appstore/verify/route.test.ts`
  - `src/app/api/subscription/appstore/notifications/route.test.ts`
  - `shared/source-labels.test.ts`
  - `src/app/api/share-import/route.test.ts`
  - `src/app/api/shared-projects/me/route.test.ts`
  - `src/app/api/shared-projects/metrics/route.test.ts`
  - `src/app/api/shared-projects/public/route.test.ts`
  - `src/app/api/shared-projects/route.test.ts`
  - `src/app/shared/shared-page-utils.test.ts`
  - `src/lib/ai/gemini-model.test.ts`
  - `src/lib/ai/prompts.translation-context.test.ts`
  - `src/lib/ai/providers/cloud-run-timing.test.ts`
  - `src/lib/api-cost/pricing.test.ts`
  - `src/lib/komoju/client.test.ts`
  - `src/lib/lexicon/cleanup.test.ts`
  - `src/lib/lexicon/enrichment-jobs.test.ts`
  - `src/lib/similarity/local-similar-words.test.ts`
  - `src/lib/similarity/similar-cache.test.ts`
  - `src/lib/spaced-repetition.test.ts`
- **Notes**: New normal Web/shared test files must be manually added to this list after confirming they are safe and passing. Security guard tests belong in `npm run test:security`, and Cloud Run scan service tests belong in `npm run test:cloud-run-scan`.

---

## Security

### `npm run test:security`

- **What it does**: Runs all security tests in sequence:
  1. `npm run test:security:sql` -- SQL injection guard test suite
  2. `npm run test:security:secrets` -- Secrets guard test suite
  3. `npm run test:security:routes` -- API route security tests (`*.security.test.ts`)
- **Prerequisites**: None
- **Danger level**: Safe
- **Notes**: Included in `npm run verify`.

### `npm run test:security:sql`

- **What it does**: Runs tests for the SQL injection guard script itself
- **Command**: `node --test scripts/check-sql-injection-guard.test.mjs`
- **Danger level**: Safe

### `npm run test:security:secrets`

- **What it does**: Runs tests for the secrets guard script
- **Command**: `node --test scripts/check-secrets-guard.test.mjs`
- **Danger level**: Safe

### `npm run test:security:routes`

- **What it does**: Runs API route security tests (parameter injection, auth bypass checks)
- **Command**: `tsx --test src/app/api/**/*.security.test.ts`
- **Danger level**: Safe

### `npm run security:all`

- **What it does**: Runs the complete security suite:
  1. `npm run security:sql` -- SQL injection guard
  2. `npm run security:secrets` -- Secrets guard
  3. `npm run security:deps` -- npm audit for dependency vulnerabilities
- **Danger level**: Safe

### `npm run security:sql`

- **What it does**: Scans source files for raw SQL construction patterns that could be injection vectors
- **Command**: `node scripts/check-sql-injection-guard.mjs`
- **Danger level**: Safe
- **Notes**: Allowlist is at `security/sql-allowlist.json`. Only add entries with a dated expiration.

### `npm run security:secrets`

- **What it does**: Scans source files for hardcoded secrets or API keys
- **Command**: `node scripts/check-secrets-guard.mjs`
- **Danger level**: Safe

### `npm run security:observe`

- **What it does**: Logs security events to an observation file
- **Danger level**: Safe

### `npm run security:observe:ci`

- **What it does**: Runs the security observation script in CI mode
- **Command**: `node scripts/security-observe.mjs --ci`
- **Danger level**: Safe

### `npm run security:observe:summary`

- **What it does**: Generates a summary of security observation results
- **Command**: `node scripts/security-observe-summary.mjs`
- **Danger level**: Safe

---

## Separate Packages

### `npm run test:cloud-run-scan`

- **What it does**: Runs the Cloud Run scan service test suite from the separate `cloud-run-scan/` package
- **Command**: `cd cloud-run-scan && npm test`
- **Prerequisites**: `cloud-run-scan/node_modules` must be installed
- **Danger level**: Safe -- tests use mocked provider behavior and do not call external APIs
- **Notes**: This is intentionally not part of root `npm run verify`, which is the Web app prelaunch gate.

---

## QA / E2E

### `npm run qa:stripe:webhook-e2e`

- **What it does**: Runs end-to-end test for the Stripe webhook flow
- **Command**: `tsx scripts/qa-stripe-webhook-e2e.ts`
- **Prerequisites**: Valid `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` environment variables
- **Danger level**: **Use with caution** -- this hits the real Stripe API. Use test/sandbox API keys only. Never run with production keys unless intentionally testing production.
- **Notes**: This creates real Stripe Checkout sessions and triggers webhook events.

---

## Recommended Verification Sequence

For a typical code change, run these commands in order:

```bash
npm run lint:web      # Web app lint gate
npm test              # Unit tests
npm run test:security # Security guard and route tests
npm run build         # Production build verification
```

For pre-deploy verification:

```bash
npm run verify
```
