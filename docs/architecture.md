# Architecture

## System Overview

MERKEN (package name: `wordsnap`) is an AI-powered vocabulary learning PWA for Japanese English learners. Users photograph handwritten notes or printed materials. AI extracts English words with Japanese translations and generates quiz content. The app provides flashcards, 4-choice quizzes, sentence quizzes, and spaced repetition.

- **Production domain**: `https://www.merken.jp`
- **Hosting**: Vercel (Next.js)
- **Companion iOS app**: Separate codebase in `mobile/` directory (excluded from tsconfig)

---

## Tech Stack

| Layer | Technology | Version | Config Reference |
|-------|-----------|---------|-----------------|
| Framework | Next.js (App Router) | ^16.1.6 | `package.json` |
| Runtime | React | 19.2.3 | `package.json` |
| Language | TypeScript | ^5 | `tsconfig.json` |
| Styling | Tailwind CSS | v4 | `postcss.config.mjs` |
| Local DB | Dexie.js (IndexedDB) | ^4.2.1 | `src/lib/db/dexie.ts` |
| Cloud DB | Supabase (PostgreSQL + Auth + Storage) | ^2.91.0 | `src/lib/supabase/` |
| Supabase SSR | `@supabase/ssr` | ^0.8.0 | `src/lib/supabase/`, `middleware.ts` |
| AI - Image OCR | Google Gemini 2.5 Flash | `@google/genai` ^1.38.0 | `src/lib/ai/config.ts:L17` |
| AI - Quiz Gen | OpenAI GPT-4o-mini | `openai` ^6.16.0 | `src/lib/ai/config.ts:L18` |
| AI - Embeddings | OpenAI text-embedding-3-small | `openai` ^6.16.0 | `src/lib/embeddings/` |
| Payment (Web) | KOMOJU | Custom REST client | `src/lib/komoju/` |
| Payment (iOS) | Apple IAP | `@apple/app-store-server-library` ^2.0.0 | `src/app/api/subscription/appstore/` |
| Animations | Framer Motion | ^12.29.0 | — |
| Validation | Zod | ^4.3.6 | `src/lib/schemas/` |
| Push (Web) | web-push | ^3.6.7 | `src/lib/notifications/web-push.ts` |
| Push (iOS) | APNS via `apns2` | ^12.2.0 | `src/lib/notifications/apns.ts` |
| PDF support | pdfjs-dist | ^4.10.38 | — |

---

## Directory Responsibility Map

### Core Application (`src/`)

| Directory | Responsibility |
|-----------|---------------|
| `src/app/` | Next.js App Router pages and API routes |
| `src/app/api/extract/` | Image OCR and word extraction (core scan flow) |
| `src/app/api/scan-jobs/` | Async scan pipeline for iOS (create, process, list) |
| `src/app/api/subscription/` | KOMOJU + AppStore subscription management + webhooks |
| `src/app/api/auth/` | OTP-based auth flow (send-otp, verify-otp, signup-verify, reset-password) |
| `src/app/api/generate-quiz-distractors/` | GPT-4o-mini distractor + example sentence generation |
| `src/app/api/sentence-quiz/` | Sentence fill-in-blank and word-order quiz generation |
| `src/app/api/embeddings/` | Word vector embedding sync and rebuild |
| `src/app/api/quiz2/similar/` | Vector similarity lookup for Quiz2 |
| `src/app/api/dictation/grade/` | Dictation answer grading |
| `src/app/api/notifications/` | Push subscription registration (web + iOS) |
| `src/app/api/ops/api-costs/` | Admin-only AI cost dashboard |
| `src/app/api/generate-word-insights/` | GPT-4o-mini word insights (POS tags, related words) |
| `src/app/api/regenerate-distractors/` | Regenerate quiz distractors on demand |
| `src/app/api/generate-examples/` | AI example sentence generation |
| `src/app/api/activity/` | User activity logging |
| `src/app/api/translate/` | AI-powered translation |
| `src/app/api/search/semantic/` | Semantic search via embeddings |
| `src/app/api/similar-cache/rebuild/` | Rebuild similar word cache |
| `src/components/` | React components split by feature domain |
| `src/components/ui/` | Reusable UI primitives (Button, Icon, AppShell) |
| `src/components/home/` | Home page modals (ScanModeModal, ProcessingModal) |
| `src/hooks/` | Custom React hooks -- state management layer |
| `src/lib/ai/` | AI integration: prompts, config, provider abstraction |
| `src/lib/ai/providers/` | Provider implementations (Gemini, OpenAI, CloudRun) |
| `src/lib/db/` | Repository layer: local, remote, hybrid, readonly |
| `src/lib/komoju/` | KOMOJU payment client and config (server-side only) |
| `src/lib/supabase/` | Supabase clients: browser singleton, server, route handler, middleware |
| `src/lib/schemas/` | Zod validation schemas for AI responses |
| `src/lib/subscription/` | Subscription business logic: status computation, billing activation, reconciliation |
| `src/lib/embeddings/` | Vector embedding generation via OpenAI |
| `src/lib/notifications/` | Push notification sending (web-push + APNS) |
| `src/lib/stats/` | Activity calendar / heatmap computation |
| `src/lib/similarity/` | Similar word lookup for Quiz2 |
| `src/lib/api-cost/` | API cost tracking and recording |
| `src/lib/appstore/` | Apple IAP client, config, transaction verification |
| `src/lib/projects/` | Project loading helpers |
| `src/lib/resend/` | Resend email client for OTP |
| `src/lib/pwa/` | PWA service worker registration |
| `src/lib/marketing/` | Marketing page content |
| `src/types/` | TypeScript type re-exports from `shared/types/` + web-specific types |

### Shared Code (`shared/`)

| Directory | Responsibility |
|-----------|---------------|
| `shared/types/index.ts` | **Source of truth** for all domain types (Word, Project, Subscription, Quiz, etc.) |
| `shared/db/mappers.ts` | Supabase row to domain object mapping |

### Infrastructure

| Directory | Responsibility |
|-----------|---------------|
| `supabase/migrations/` | ~43 SQL migration files (applied sequentially) |
| `scripts/` | Security check scripts (SQL injection guard, secrets guard, deps audit) |
| `public/` | Static assets, PWA manifest (`manifest.json`), service worker (`sw.js`) |

### Excluded from tsconfig (separate projects)

| Directory | Purpose |
|-----------|---------|
| `mobile/` | Capacitor-based iOS app |
| `ios-native/` | Native Xcode project (MerkenIOS) |
| `cloud-run-scan/` | Cloud Run AI gateway service |
| `vocabularytest/`, `vocabularytest-clone/`, `stitch/` | Legacy/experimental |

---

## Data Flow: Image Scan to Saved Words (Web)

```
User selects image
  |
  v
ScanModeModal (src/components/home/ScanModeModal.tsx)
  - Selects mode: all/circled/highlighted/eiken/idiom/wrong
  |
  v
Image preprocessing (src/lib/image-utils.ts)
  - HEIC conversion via heic2any
  - Compression to max 2MB
  - Convert to base64 data URL
  |
  v
POST /api/extract (src/app/api/extract/route.ts)
  1. Auth check (cookie or Bearer token)
  2. Zod schema validation of request body
  3. check_and_increment_scan RPC (server-side limit enforcement)
  4. AI extraction (Gemini 2.5 Flash via direct API or Cloud Run proxy)
  5. Return JSON word list
  |
  v
sessionStorage (keys: scanvocab_extracted_words, scanvocab_project_name, etc.)
  |
  v
/scan/confirm (src/app/scan/confirm/page.tsx)
  - User reviews/edits word list
  - On save: getRepository(subscriptionStatus) -> creates project + words
  |
  v
Background prefill (async, non-blocking):
  - POST /api/generate-quiz-distractors (GPT-4o-mini: 3 distractors + example sentence)
  - Pro only: POST /api/embeddings/sync + POST /api/quiz2/similar/batch
  - Pro only: POST /api/generate-word-insights (POS tags, related words)
```

---

## Data Flow: iOS Async Scan

```
iOS app uploads image to Supabase Storage
  |
  v
POST /api/scan-jobs/create -> creates job record in scan_jobs table
  |
  v
POST /api/scan-jobs/process (service role)
  - Same extraction logic, saves directly to Supabase
  - Sends push notification (APNS or Web Push)
  |
  v
iOS app polls / receives notification, downloads completed job
```

---

## Repository Pattern

Data storage is abstracted via `WordRepository` interface (defined in `shared/types/index.ts`, factory in `src/lib/db/index.ts`).

| Repository | Storage Backend | Used By | Write Access |
|-----------|----------------|---------|-------------|
| `LocalWordRepository` | IndexedDB (Dexie) | Free users | Full |
| `HybridWordRepository` | IndexedDB + Supabase sync | Active Pro users | Full (writes to both) |
| `ReadonlyRemoteRepository` | Supabase (read-only) | Downgraded Pro users | **None** (throws error) |
| `RemoteWordRepository` | Supabase | Server-side / internal | Full |

Selection logic in `getRepository(subscriptionStatus, wasPro)`:
- `status === 'active'` -> `hybridRepository`
- `wasPro === true` (not active) -> `readonlyRemoteRepository`
- Otherwise -> `localRepository`

---

## Authentication

- **Signup**: Custom OTP flow via Resend email (`/api/auth/send-otp`, `/api/auth/verify-otp`), not Supabase magic links.
- **Session**: Supabase Auth manages sessions. Browser client stores session in localStorage (`sb-{projectRef}-auth-token`).
- **Middleware**: `src/lib/supabase/middleware.ts` protects routes listed in `protectedPaths` array. Redirects to `/login` if unauthenticated.
- **API auth**: Routes use `createRouteHandlerClient(request)` and check both cookie auth (web) and `Authorization: Bearer` header (iOS).

---

## Payment Architecture

### KOMOJU (Web)

```
User -> /subscription -> POST /api/subscription/create
  -> KOMOJU hosted payment page (PayPay, credit card)
  -> KOMOJU webhook -> POST /api/subscription/webhook
  -> HMAC verification -> claim_webhook_event RPC (idempotency)
  -> activateBillingFromSession() -> update subscriptions table
```

### Apple IAP (iOS)

```
iOS purchase -> app sends transactionId
  -> POST /api/subscription/appstore/verify
  -> @apple/app-store-server-library verifies with Apple
  -> Check IAP_PRO_PRODUCT_IDS whitelist
  -> Update subscriptions table (pro_source='appstore')
```

---

## Subscription Tiers

| Feature | Free | Pro (500 JPY/month) |
|---------|------|---------------------|
| Scans per day | 3 (server-enforced) | Unlimited |
| Words total | 100 (client-enforced only) | Unlimited |
| Scan modes | `all` only | All modes (circled, highlighted, eiken, idiom, wrong) |
| Data storage | IndexedDB (browser-local) | Supabase cloud + IndexedDB cache |
| Cross-device sync | No | Yes |
| Word embeddings/Quiz2 | No | Yes |
| Word insights | No | Yes |

---

## External Service Dependencies

| Service | Env Vars Required | Fallback if Missing |
|---------|-------------------|-------------------|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Middleware skips auth check; client throws |
| Supabase (admin) | `SUPABASE_SERVICE_ROLE_KEY` | Webhooks and admin routes fail |
| Google Gemini | `GOOGLE_AI_API_KEY` | Extraction fails (unless Cloud Run configured) |
| OpenAI | `OPENAI_API_KEY` | Quiz generation, embeddings, sentence quiz fail |
| KOMOJU | `KOMOJU_SECRET_KEY`, `KOMOJU_WEBHOOK_SECRET` | Payment flow fails |
| Apple IAP | 7 env vars (see `docs/_discovery_notes.md` section 11) | iOS IAP verification fails |
| Resend | `RESEND_API_KEY` | OTP email signup fails |
| Web Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications fail |
| Cloud Run (optional) | `CLOUD_RUN_URL`, `CLOUD_RUN_AUTH_TOKEN` | Falls back to direct API calls |

---

## Vercel Configuration

`vercel.json` sets extended function timeouts for AI-heavy routes:

| Route | Timeout |
|-------|---------|
| `src/app/api/extract/route.ts` | 60s |
| `src/app/api/sentence-quiz/route.ts` | 60s |
| `src/app/api/grammar/route.ts` | 60s (route does not currently exist -- stale config) |
| `src/app/api/regenerate-distractors/route.ts` | 30s |
| `src/app/api/generate-quiz-distractors/route.ts` | 30s |
