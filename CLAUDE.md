# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. For detailed documentation, see:
- `docs/architecture.md` -- System architecture and data flows
- `docs/boundaries.md` -- What can be modified and what must not be touched
- `docs/invariants.md` -- Rules that must never be violated
- `docs/runbooks.md` -- Step-by-step procedures for common tasks
- `docs/commands.md` -- Command reference with safety ratings

## Project Overview

MERKEN (package name: `wordsnap`) is an AI-powered vocabulary learning PWA for Japanese English learners. Users photograph handwritten notes or printed materials, Gemini 2.5 Flash extracts English words with Japanese translations, and GPT-4o-mini generates quiz distractors and example sentences. Production domain: `https://www.merken.jp`.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint + SQL injection guard
npm test         # Unit tests (Node.js built-in test runner + tsx)
npm run security:all  # Full security suite (SQL + secrets + deps audit)
```

See `docs/commands.md` for full command reference.

## Environment Setup

Copy `.env.example` to `.env.local` and set:
```bash
# AI APIs
GOOGLE_AI_API_KEY=your-gemini-api-key       # Primary: image OCR extraction
OPENAI_API_KEY=sk-your-api-key              # Secondary: quiz gen, embeddings, sentence quiz

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Server-side only, bypasses RLS

# Stripe Payment (for subscription)
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
STRIPE_PRICE_ID=price_your-price-id

# Email OTP
RESEND_API_KEY=your-resend-api-key

# App URL (for OAuth callbacks)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Additional optional env vars documented in `docs/_discovery_notes.md` section 11 (Apple IAP, Cloud Run, push notifications, feature flags).

## Tech Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- **Local Database**: Dexie.js (IndexedDB wrapper) - Free tier
- **Cloud Database**: Supabase (PostgreSQL + Auth + Storage) - Pro tier
- **Authentication**: Supabase Auth with custom OTP flow via Resend
- **Payment (Web)**: Stripe (credit card, 300 JPY/month)
- **Payment (iOS)**: Apple IAP via `@apple/app-store-server-library`
- **AI - OCR**: Google Gemini 2.5 Flash (`src/lib/ai/config.ts`)
- **AI - Quiz/Sentences**: OpenAI GPT-4o-mini (`src/lib/ai/config.ts`)
- **AI - Embeddings**: OpenAI text-embedding-3-small
- **Validation**: Zod for API response validation
- **Animations**: Framer Motion

## Architecture

### Key Directory Map

| Directory | Responsibility |
|-----------|---------------|
| `src/app/` | Next.js App Router pages and API routes |
| `src/app/api/extract/` | Image OCR + word extraction (core scan flow) |
| `src/app/api/subscription/` | KOMOJU + AppStore subscription + webhooks |
| `src/components/` | React components split by feature domain |
| `src/hooks/` | Custom React hooks (state management layer) |
| `src/lib/ai/` | AI integrations: config, prompts, provider abstraction |
| `src/lib/db/` | Repository layer: local, remote, hybrid, readonly, sync queue |
| `src/lib/stripe/` | Stripe payment client (server-side only) |
| `src/lib/supabase/` | Supabase clients: browser singleton, server, middleware |
| `src/lib/subscription/` | Subscription status computation, billing activation |
| `src/lib/schemas/` | Zod validation schemas for AI responses |
| `src/types/` | Re-exports from `shared/types/` + web-specific types |
| `shared/types/` | **Source of truth** for domain types (Word, Project, Subscription) |
| `shared/db/` | DB row to domain object mappers |
| `supabase/migrations/` | ~43 SQL migration files |
| `scripts/` | Security check scripts (SQL injection, secrets, deps audit) |

Full directory map: `docs/architecture.md`

### Repository Pattern

Data storage abstracted via `WordRepository` interface. Factory in `src/lib/db/index.ts`:

```typescript
getRepository(subscriptionStatus, wasPro)
// 'active'  -> HybridWordRepository (IndexedDB + Supabase sync)
// wasPro    -> ReadonlyRemoteRepository (Supabase read-only, writes throw)
// otherwise -> LocalWordRepository (IndexedDB only)
```

### Subscription Tiers

| Feature | Free | Pro (300 JPY/month) |
|---------|------|---------------------|
| Scans per day | 3 (server-enforced) | Unlimited |
| Words total | Unlimited | Unlimited |
| Scan modes | `all` only | all, circled, highlighted, eiken, idiom, wrong |
| Data storage | IndexedDB (browser-local) | Cloud (Supabase) + IndexedDB cache |
| Cross-device sync | No | Yes |

### Data Flow
1. User uploads image -> `/api/extract` -> Gemini 2.5 Flash (or Cloud Run proxy)
2. Response validated with Zod schema (`src/lib/schemas/ai-response.ts`)
3. Words stored in sessionStorage -> `/scan/confirm` for user editing
4. On save: Project + Words created via repository (Local or Hybrid)
5. Background: GPT-4o-mini generates distractors + example sentences
6. Quiz pulls words, shuffles options, updates word status with SM-2 spaced repetition

### Authentication Flow
1. User signs up -> OTP email sent via Resend (`/api/auth/send-otp`)
2. User verifies OTP -> Account created, session set
3. Subscription + profile rows auto-created via database trigger (`on_auth_user_created` -> `handle_new_user()`). Launch campaign (2026-04-04+): first 66 eligible signups get permanent test Pro in-DB; see `docs/ops-auto-pro-first-66-2026-04-04.md`.
4. User upgrades -> KOMOJU payment page -> Webhook activates Pro

### Payment Flow (Stripe)
1. User clicks upgrade -> `/api/subscription/create` -> Creates Stripe Checkout Session
2. User redirected to Stripe hosted Checkout page
3. Payment complete -> Stripe webhook -> `/api/subscription/webhook`
4. Stripe signature verified via `constructEvent()` -> Idempotency check via `claim_webhook_event` RPC
5. `activateBillingFromSession()` updates `subscriptions` table

## Critical Safety Rules

These rules must never be violated. See `docs/invariants.md` for full list.

1. **Never use `SUPABASE_SERVICE_ROLE_KEY` in client-side code** -- it bypasses all RLS
2. **Never modify applied migration files** -- create a new migration instead
3. **Always validate AI responses with Zod** -- AI output is unreliable
4. **Always enable RLS on new tables** with user-scoped policies
5. **Never break the `fullSync()` safety guard** in `src/lib/db/hybrid-repository.ts` (skip sync when remote is empty but local has data)
6. **`pro_source='none'` must resolve to `'cancelled'`** in subscription status logic
7. **Stripe webhook signature must be verified before any processing**
8. **Pro-only modes must be gated by `requiresPro` flag** in `/api/extract`

## Danger Zones

Areas where small changes cause cascading failures. See `docs/boundaries.md` for full details.

- `src/app/api/subscription/webhook/route.ts` -- Payment activation path. Uses service role key.
- `src/lib/subscription/status.ts` -- Called in 4+ locations. Affects all Pro/Free gating.
- `src/lib/db/hybrid-repository.ts:fullSync()` -- Can delete all local data.
- `src/hooks/use-auth.ts` -- Global singleton state. All components share one instance.
- `src/app/api/extract/route.ts` -- Server-side scan limit enforcement.
- `src/app/api/scan-jobs/process/route.ts:processJobById()` -- Core iOS scan processing. Called directly in-process via `after()`, **not** via HTTP self-fetch. Do not reintroduce self-fetch pattern.

## Implementation Notes

1. **AI Response Handling**: Always validate with Zod - AI output can be malformed
2. **Progress UX**: Show step-by-step progress during AI processing to prevent user drop-off
3. **Quiz Logic**:
   - Both correct and wrong answers show "Next" button - user taps to proceed
   - Correct -> green highlight, Wrong -> red highlight with correct answer shown
   - SM-2 spaced repetition: tracks easeFactor, intervalDays, repetition, nextReviewAt
   - Daily stats recorded: todayCount, correctCount, streakDays
4. **Free Plan**: 3 scans/day tracked server-side via `check_and_increment_scan` RPC; also tracked client-side in localStorage
5. **SSR Compatibility**: Supabase browser client uses lazy initialization. `getDb()` throws on server side.
6. **Suspense Boundaries**: Pages using `useSearchParams()` wrapped in Suspense for Next.js 16
7. **Image Processing**: HEIC conversion and compression (max 2MB) to stay under Vercel's 4.5MB limit
8. **Favorites Mode**: Shows all favorite words across all projects, not just current project

## Testing

Tests use Node.js built-in test runner with `tsx`. Test files are co-located with source (`.test.ts` suffix).

```bash
npm test                    # Unit tests (fixed file list in package.json)
npm run test:security       # SQL injection + secrets + route security tests
npm run security:all        # Full security suite
```

New test files must be manually added to the `test` script in `package.json` -- they are not auto-discovered.

## Testing Stripe Webhooks Locally

Use Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/subscription/webhook
# Use the webhook signing secret printed by the CLI as STRIPE_WEBHOOK_SECRET
```

## Deployment Checklist

1. Set all required environment variables in hosting platform
2. Run Supabase migrations
3. Configure Stripe webhook URL to production domain
4. Verify `npm run lint && npm test && npm run build` passes

## Future Features (TODO)

### 1. Circled word extraction -- Done
- ScanModeModal mode: `circled`

### 2. EIKEN level filtering -- Done
- ScanModeModal mode: `eiken` with level selection (5-1)

### 3. Grammar learning feature -- Not implemented
- Routes (`/grammar/`, `/api/grammar/`) do not currently exist in the codebase
- `vercel.json` references `src/app/api/grammar/route.ts` (stale config)
- AI config has grammar extraction settings in `src/lib/ai/config.ts`
- Feature was planned but routes were removed or never created
