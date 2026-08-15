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
STRIPE_WEBHOOK_SECRET=placeholder-webhook-secret
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
- **Error monitoring**: Sentry (`@sentry/nextjs`) — no-op unless a DSN is set. See `docs/ops/sentry-runbook.md`

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
| `src/lib/observability/` | Sentry init (server/edge/client) + shared event scrubbing |
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
// otherwise -> HybridWordRepository (Free users sync too; 50-wordbook cap enforced
//              server-side via RLS + enforce_free_project_limit trigger)
```

### Subscription Tiers

| Feature | Free | Pro (300 JPY/month) |
|---------|------|---------------------|
| Scanning | Not available (Pro-only, server-enforced) | Coin-based: 300 coins/month (JST calendar month, no rollover) when `COIN_SYSTEM_ENABLED=true`; unlimited when the flag is off |
| Coin costs | — | Scan: circled=2, all/eiken/idiom/custom=3, composite=sum, +1 per extra image, +2 morphology surcharge. Manual add: 1/word morphology (語源解析), success-gated & skipped (not blocked) when out of coins |
| Coin packs | — | Web-only Stripe one-time checkout (card + PayPay): 100/¥150, 300/¥400, 1000/¥1,200. Purchased coins never expire |
| Wordbooks (単語帳) | 50 (server-enforced) | Unlimited |
| Words per wordbook | Unlimited | Unlimited |
| Scan modes | — | all, circled, eiken, idiom, custom (ユーザ定義プロンプト・単独指定のみ) |
| Shared wordbook view/import | Yes (login required) | Yes |
| Shared wordbook publishing | No (Pro-only) | Yes |
| Shared 語法問題集 view | Yes (login required) | Yes |
| Shared 語法問題集 import / publishing | No (Pro-only) | Yes |
| Data storage | Cloud (Supabase) + IndexedDB cache (login required) | Cloud (Supabase) + IndexedDB cache |
| Cross-device sync | Yes (login required; capped at 50 wordbooks server-side) | Yes |

Coin system core: `src/lib/coins/` (rates, scan gate, manual-morphology gate, refund, packs, purchase providers) + `supabase/migrations/20260705120000_create_coin_system.sql`. Rates are duplicated in TS and SQL and pinned by `src/lib/coins/rates.test.ts` — change both together. Manual-add morphology consumes coins via the dedicated `consume_manual_morphology_coins` RPC (`20260713120000_manual_morphology_coin_cost.sql`); charging is success-gated (only after a displayable etymology is produced) and best-effort (Free users and out-of-coins Pro users simply get no morphology — the word is still saved).

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
3. Subscription + profile rows auto-created via database trigger (`on_auth_user_created` -> `handle_new_user()`). The former first-66 launch campaign is retired; new signups stay Free unless explicitly upgraded or granted test Pro. See `docs/ops-auto-pro-first-66-2026-04-04.md`.
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
8. **Scanning is Pro-only for every mode**: all scan entry points (`/api/extract`, `/api/scan-jobs`) must gate through `requiresProForModes` (always true)

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
4. **Free Plan**: scanning is Pro-only (rejected server-side via the `check_and_increment_scan` RPC's `p_require_pro` flag); free users build wordbooks by importing shared wordbooks or adding words manually. Free users get **cloud sync** (cross-device) when logged in — same `HybridWordRepository` as Pro. The Free limit is on **wordbook (project) count = 50** (`FREE_WORDBOOK_LIMIT`), not word count — words per wordbook are unlimited. It is enforced server-side (RLS write policies gate `active Pro OR free plan`; the `enforce_free_project_limit` DB trigger caps free users at 50 wordbooks so direct PostgREST calls cannot bypass the client UI). Former-Pro (cancelled) users stay read-only. Default official wordbooks are imported into Supabase server-side at signup (`/api/auth/signup-verify` → `persistDefaultOfficialWordbooksToDb`); the client hydrates them via full sync.
5. **SSR Compatibility**: Supabase browser client uses lazy initialization. `getDb()` throws on server side.
6. **Suspense Boundaries**: Pages using `useSearchParams()` wrapped in Suspense for Next.js 16
7. **Image Processing**: HEIC conversion and compression (max 2MB) to stay under Vercel's 4.5MB limit
8. **Favorites Mode**: Shows all favorite words across all projects, not just current project
9. **Voice Quiz (音読チャレンジ)**: `/voice-quiz/[projectId]`. Narrates a Japanese quiz prompt ("what's the English for X?"), then the user says the English answer aloud within a time limit — an oral recall test, not pronunciation practice, so the English word is never spoken before answering.
   - **Prompt text**: the carrier sentence does **not** depend on the word, so `src/lib/quiz/voice-quiz-prompt.ts` holds a fixed rotating set of templates and slots in `word.japanese`. No AI call, no DB column, no wait before the first question; the English spelling cannot leak because the prompt is built from the Japanese meaning alone (pinned by a test asserting templates contain no Latin letters).
   - **Attempts (試行回数)**: chosen on the start screen, 1–3. With 1, a single miss ends the question. With 2+, a miss triggers a spoken 「もう一回!」 (`VOICE_QUIZ_RETRY_TEMPLATES`) and re-listens until attempts run out. Success on any attempt counts as correct. A recognition-API failure never consumes a retry — it settles the question immediately since it isn't the user's fault.
   - **Batches (次の10問)**: one session is `?count=` words (default 10) taken from the head of the wordbook, ordered by `sortWordsByPriority` **once** at load. The result screen advances to the *next* batch rather than replaying the same one (`src/lib/quiz/voice-quiz-batch.ts`), keeping the chosen attempts/duration/direction. Re-sorting per batch would re-serve words already answered, so the order is fixed for the whole walk; when the wordbook runs out the button falls back to 「もう一度」.
   - **Audio**: the fixed parts of the narration (carrier sentence, 「もう一回!」, result/answer announcements) play pre-generated GCP TTS mp3s from `public/audio/voice-quiz/` (script: `src/lib/quiz/voice-quiz-audio.ts`, playback: `src/lib/quiz/voice-quiz-clips.ts`); the word and its meaning change per question, so those stay browser TTS (`src/lib/speech.ts` `speakAndWait` / `speakEnglish`). Japanese and English are always separate utterances — merging them makes the Japanese voice read English words as katakana. Clips are fetched on page mount and decoded through a Web Audio context that is **created and unlocked inside the start-button tap** (`primeVoiceQuizAudio`): in an installed PWA, an `Audio` element built per clip is refused outside a gesture, which silently turned the whole session synthetic. A clip that fails is only given up on when it is missing or undecodable — never for a timeout or a network blip, or one bad question makes the rest of the session synthetic too.
   - **Recognition**: the answer is captured with `MediaRecorder` and sent to `/api/voice-quiz/recognize`, which calls **GCP Cloud Speech-to-Text** (`src/lib/speech/cloud-speech-to-text.ts`, `GOOGLE_CLOUD_SPEECH_API_KEY`) instead of the browser's `SpeechRecognition` — needed for consistent accuracy and because `SpeechRecognition` does not work inside an installed iOS Safari PWA (`MediaRecorder` does). No speech within `TIMER_DURATION_MS` (6s) = disqualified (失格).
   - **Homophones (漢字違い)**: the quiz asks for a *spoken* meaning, but the recognizer returns kanji, so a correct answer can come back spelled differently (「恩赦」→「御社」, 「コケ」→「苔」). Three layers, cheapest first: the expected spellings go out as `speechContexts` phrases **with a boost** (a boost-less context barely biases GCP at all); `maxAlternatives` lets a lower-ranked-but-correct spelling be picked up; and if no spelling matches, the route looks up hiragana readings (`src/lib/speech/japanese-reading.ts`) and returns a 表記→読み map that `isJapaneseAnswerCorrect` compares alongside the spellings. The reading lookup is an AI call, so it only fires on answers that would otherwise be marked wrong — never on a correct one — and a failed lookup silently falls back to spelling-only judging.
   - See `docs/research/voice-quiz-gcp-feasibility.md` for the GCP-only feasibility research.

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

### 3. Custom extraction prompt (カスタム抽出モード) -- Done
- ScanModeMode: `custom`. ユーザが「どの単語を抽出するか」を自由記述で指定できる
- 書いたプロンプトは `custom_scan_modes` テーブルに名前付きで保存（1ユーザ20個まで）
- 出力フォーマット（JSON契約・品詞タグ・訳ルール）は `src/lib/ai/prompts/custom.ts` が常に付与し、ユーザ指示では上書きできない
- プロンプトはサーバー側で解決（保存済みモードIDはクライアントを信用しない）。バックグラウンドスキャンでは `scan_jobs.custom_prompt` にコピーして固定する
- 他モードとの併用は不可（`isValidModeCombination`）

### 4. Grammar learning feature (語法問題集) -- Done
- Vintage型の問題集 (空欄補充・英語4択・解説つき)。問題の作成は ChatGPT 連携 (`/api/chatgpt/grammar-*`) と手動追加のみで、サーバー側でのAI生成は行わない
- Routes: `/grammar/**`, `/api/grammar/**` (books, questions, progress, favorite, share, public)
- Tables: `grammar_books` / `grammar_questions` ほか (`supabase/migrations/2026072*_*grammar*.sql`)。RLSは本人限定のままで、他人の公開分は service-role のAPIルート経由でのみ読む
- 共有: `share_id` によるリンク共有に加えて、`is_public` を立てると共有ページ (`/shared` の「語法」) の一覧に載る。公開・取り込みはPro限定、閲覧はログインのみ

### 5. Realtime word battle (リアルタイム単語対戦) -- Done
- 早押し4択のリアルタイム1対1対戦。**Pro限定・コイン消費なし**。フレンド対戦（6桁招待コード）とランダムマッチの両方に対応
- Routes: `/battle`（ロビー）, `/battle/[roomId]`（対戦画面）, `/api/battle/**`（rooms, join, match, start）
- Tables: `battle_rooms` / `battle_questions` / `battle_question_keys` / `battle_answers` / `battle_queue` (`supabase/migrations/20260814100000_create_word_battles.sql`)
- **出題は両者の単語帳をマージ**して生成（`src/lib/battle/questions.ts`、交互に取って偏りを防ぐ）。両者はまったく同じ問題を同じ順で解く。単語が足りなければ問題数を切り詰める（重複出題はしない）
- **正解キーは `battle_question_keys` に隔離**。RLSを有効にしたうえでポリシーを一切張らないため `authenticated` からは読めず、`SECURITY DEFINER` の RPC だけが参照する。ここにSELECTポリシーを足すと早押しが自明にチートできるので**絶対に追加しない**。決着後に `battle_questions.revealed_*` へ書き戻して開示する
- **判定はすべてサーバー権威**。`submit_battle_answer` がルーム行をロックして採点するので「先に正解した方」の順序はDBが決める。締切も `started_at + round_duration_ms` をサーバー側で再検証するため、遅延パケットがラウンドを奪えない
- 1ラウンド1人1回だけ回答可能（誤答＝そのラウンド失権）。両者が外すとラウンド終了。減点はしない
- ラウンド進行・時間切れ処理は両クライアントが競って RPC を呼ぶが、`advance_battle_round` / `resolve_battle_round_timeout` は冪等かつサーバー側で条件を再検証する
- 同期は Supabase Realtime の `postgres_changes`（`battle_rooms` / `battle_questions`）。イベント欠落に備えて4秒間隔の再取得もかけている。回答送信だけは Vercel を経由せず**ブラウザから直接 RPC** を叩いてラウンドトリップを1回減らしている（早押しのため）
- Next.js の Route Handler は常駐できないので、サーバー側タイマーは持たず「締切時刻を持ってクライアントが叩く・サーバーが検証する」方式を取っている
- UIは `src/components/battle/` に分割（`BattleScreen` = 固定ヘッダ付きの共通シェル、`BattleScoreboard` / `BattleRoundTimer` / `BattleQuestionCard` / `BattleChoiceList` / `BattleResultView` / `BattleWaitingView` など）。ページ (`/battle`, `/battle/[roomId]`) は状態遷移とデータ取得だけを持ち、描画はこれらに委ねる
- 対戦画面 (`/battle/[roomId]`) はボトムナビ非表示（`PersistentAppShell` の `HIDE_BOTTOM_NAV_PATHS` に `/battle/`）。ロビー (`/battle`) はタブ移動できるようナビを出す
