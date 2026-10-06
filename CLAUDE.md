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
| Official wordbook (公式単語帳) view/import | Yes (list is public; full word list + import require login) | Yes |
| Shared wordbook publishing | No (Pro-only) | Yes |
| Shared 語法問題集 view | Yes (login required) | Yes |
| Shared 語法問題集 import / publishing | No (Pro-only) | Yes |
| リアルタイム対戦 | 1日3回まで (`FREE_DAILY_BATTLE_LIMIT`, JST暦日) | 無制限 |
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
5. **OAuth (Google / Apple) signups**: the onboarding profile (ユーザー名 / ユーザーID / 英検級) collected on `/signup` is carried through the provider redirect in a cookie and persisted by `/auth/callback`. That cookie is absent for 「Googleで続ける」 on `/login` (the account is created on the spot) and can be lost on the way back (PWA / in-app browser / expiry), so the callback also reads the profile row and sends anyone without a name + handle to `/onboarding?next=…` (`needsOnboardingProfile`, `src/lib/auth/onboarding-profile.ts`) before they enter the app. That page reuses the signup steps (`SignupStepUi`, `useHandlePicker`), prefills from the `/signup` sessionStorage stash or the provider's profile name, and saves through `POST /api/onboarding/profile` (which only fills empty fields and seeds the default wordbooks for the chosen level). The EIKEN level is optional (未定), so it is never a reason to ask again.

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
   - **解き方 (`src/lib/quiz/quiz-mode-preference.ts`)**: 四択 (`normal`) / 記述 (`typing`) / 音読 (`voice`) / 空所補充 (`cloze`) の4つ。**選択画面 (`QuizModeChooser`) はその日 (JSTの暦日) 最初のクイズでだけ出す**。選ぶと localStorage の `merken_quiz_mode` に形式、`merken_quiz_mode_chosen_on` に選んだ日を保存し、同じ日のうちはその形式で選択画面を出さずに始める (`readTodaysQuizMode`、音読なら `/voice-quiz`、空所補充なら `/cloze-quiz` へ `replace`)。日付が変わったら覚えた形式は選択画面の初期選択に使うだけに戻る。途中で変えたいときは右上の切り替えから選び直せ、それが今日の形式になる。四択と記述は同じ `/quiz/[projectId]` 画面で切り替わり (`answerFormat`)、音読と空所補充は別ページ (`/voice-quiz/[projectId]`, `/cloze-quiz/[projectId]`)。音読へ移る側は `?format=` で戻り先の形式を渡し、戻った直後にもう一度訊かれないようにする。中断復帰用の sessionStorage にも `answerFormat` を保存する
   - 記述で出すかは**選ばれた解き方だけ**で決まる。単語の状態 (`vocabularyType === 'active'` / `status === 'active'`) から記述に切り替えてはいけない —— 四択を選んだのに一部の語だけ入力欄になる、が元の不具合
   - **出題する語も解き方で分かれる** (`src/lib/quiz/answer-format-words.ts`)。記述は Active (A) の語だけ、四択は Passive (P) の語だけ。**語彙モード未設定 (null) は Passive あつかい** —— スキャンの既定が Passive で、公式・共有単語帳の取り込みは未設定で入るので、未設定を外すと大半の単語帳がどちらの解き方でも空になる。絞り込みは `generateQuestions` / `startQuizWithDistractors` の中の1箇所だけに置く。語順クイズ (`isWordOrderEligible`) は active を除外するので、結果として四択側にしか出ない
   - 解き方を変えると出題する語ごと入れ替わるので、途中で切り替えたら**最初から組み直す** (`startQuizForFormat`)。続きから続けようがない。1語も無いときは空の出題画面ではなく専用の案内を出す
   - **空所補充 (`/cloze-quiz/[projectId]`, `src/lib/cloze/`)**: 英検大問1形式。**AIを呼ばない**（コイン消費なし・ログイン必須）。出題文は Tatoeba の英日対訳を取り込んだ共通マスター `cloze_sentences`（`scripts/import-tatoeba-cloze.ts` で投入、`tokens` の GIN で活用形ごと引く）、誤答は `lexicon_entries` から**同じ品詞・CEFR ±1**の語を空欄と同じ活用形にそろえて選ぶ。訳が重なる語（同義語）は誤答にしない。空欄が過去形とも過去分詞とも読める文では、両方の形で綴りが同じ語しか誤答にしない（took/taken の食い違い防止）。熟語・句動詞・機能語は対象外。出題語は四択と同じ Passive (P)。**Tatoeba の文は CC BY 2.0 FR なので、毎問の作者・ライセンス・文IDの表示を消してはいけない**
   - **中断復帰 (sessionStorage からの復元) でも出題プール (`allWords`) は読み直す**。復元で入るのは復元した問題の語 (最大20語) だけなので、そのままだと「次へ」や解き方の切り替えで組み直しても同じ20語しか出ない (語数の多いバインダー横断の出題で「同じ問題ばかり」になった不具合)。復元時は `loadWords({ poolOnly: true })` で `allWords` だけ埋め直し、復元した出題・問題数には触らず、語が読めなくても画面遷移しない
   - **習得レベル (`src/lib/words/mastery-level.ts`, `words.mastery_level`)**: 習得 (`status === 'mastered'`) は終点ではない。習得した語がクイズで正解するたびに `Word.masteryLevel` が 1 ずつ上がる (習得直後 = Lv.0 → Lv.1 → Lv.2 → … 上限なし)。間違えると 1 段戻り、Lv.0 で間違えたら従来どおり定着中へ。status と一緒に進めるのは `getProgressAfterQuality` / `getProgressAfterAnswer` (`src/lib/spaced-repetition.ts`) で、四択・記述・音読・空所補充・即答・フラッシュカード・quiz2 は全部これを通す (`getStatusAfterAnswer` 単体でレベルを置き去りにしない)。語義ごとの出題 (translation target) はレベルを進めない。レベルは習得のときだけ意味があり、読むときは必ず `getMasteryLevel()` を通す (一覧のタップで段階を選び直したら書き込み側で 0 に戻す)
   - **言い換え (`paraphrase`, `docs/paraphrase-quiz.md`)**: 4 つめの解き方。英単語を見て同じ意味の英単語を 4 択で選ぶ (plummet → drop、play a trick on → deceive)。材料は **AI ではなくオープンデータ** (Open English WordNet CC BY 4.0 / Moby Thesaurus パブリックドメイン / gwordlist CC BY 3.0 / Princeton WordNet の語義タグ数 / Japanese WordNet) から `scripts/paraphrase/build_dataset.py` が事前生成した `src/lib/paraphrase/dataset.json` (コミットする。重みを変えたら作り直す)。辞書はサーバーにだけ置き (`src/lib/paraphrase/server.ts`)、クライアントは `/api/paraphrase/lookup` に単語帳の語を投げて材料 (正解候補 3 語・誤答 6 語) だけ受け取る (`fetchParaphraseMaterials`)。**語義は単語帳の日本語訳で選ぶ** (`matchJapaneseSense`: 辞書は語義ごとに日本語 WordNet の訳語を持ち、`japanese` / `translations` と突き合わせて合う語義だけの候補を返す。mundane = 平凡な → everyday)。出題する語は**語彙モードと無関係で「辞書に同義語があるか」だけ**で決まる (`matchesAnswerFormat(word, 'paraphrase', { isParaphraseEligible })`)。問題は `MultipleChoiceQuizQuestion` に `type: 'paraphrase'` を付けただけなので、回答・採点・SM-2・途中保存は四択と同じ経路。出題文は英語をそのまま見せ (前置詞を伏せない)、**答えるまで訳は見せない**。英語の見出し語が無い単語帳 (古典語) では札を隠す。帰属表示は `dataset.json` の `sources` と API 応答に載せる。**単語詳細 (`WordDetailView` / `DesktopWordDetailModal`) にも同じ辞書の同義語を「言い換え」として出す** (`useParaphraseSynonyms`、語源のバックフィルと同じく表示時に引き、単語行には保存しない)
   - **四択の誤答生成 (`src/lib/ai/generate-quiz-content.ts`, `BATCH_DISTRACTOR_PROMPT`)**: 誤答が「出題語の正しい訳」になってはいけない (正解が2つある問題になる)。これはプロンプトの**絶対ルール**で、語形の似た単語から作る方針より優先する。守らせ方は3層: (1) プロンプトは禁止パターン (多義語の別義・品詞違いの用法・類義語や表記違い・正解を含む訳・派生語の訳) を列挙し、誤答ごとに「出題語をその訳に訳しても正しくないか」の自己検査を要求する、(2) 入力の各行に `knownTranslations` (word_translations の正解以外の語義) を「出題語の他の訳（誤答禁止）」として載せる (クライアントは `collectKnownTranslations`、スキャン後の prefill は `buildQuizPrefillSeedWords` が渡す)、(3) 生成後に `selectSafeDistractors` (`src/lib/quiz/distractor-safety.ts`。選択肢の報告でクライアントからも使うので、AI プロバイダを読む `generate-quiz-content.ts` ではなくここに置き、そちらからは再エクスポートだけ) が正解・既知の訳と語義単位で一致・包含する候補と、`distractorSources` (誤答ごとの元の英単語) が出題語そのもの・派生語の候補を落とす。落ちる分を見込んで候補は `DISTRACTOR_CANDIDATE_COUNT` (4) 個頼み、採用は 3 個。クイズ側 (`quiz-state.ts`) の同語義フィルタは保存済みの訳しか見られないので、辞書に無い語義はここで止めるしかない
   - **選択肢の報告 (`QuizOptionReportPanel`, `/api/quiz/report-option`)**: 四択で答えを確認したあと「選択肢がおかしい？」から誤答 (正解以外) を1つ選んで報告できる (言い換えは辞書由来なので対象外)。サーバーは Gemini に判定させ (`src/lib/quiz/option-report.server.ts`、verdict は `correct_translation` / `too_similar` / `other_problem` / `ok`)、`ok` 以外なら `buildReplacedDistractors` が `words.distractors` からその選択肢を外して判定の差し替え候補に置き換える。候補は誤答生成と同じ検査 (正解・既知の訳との一致/包含、元の英単語が出題語や派生語でないか) を通し、全部落ちたら外すだけ。同じ誤答が `lexicon_senses.distractors` (全ユーザー共通) にもあればそちらも直す。単語行の読み書きはユーザーのクライアント (RLS) で行い本人の単語しか直せない。記録は `quiz_option_reports` (`20261006120000_create_quiz_option_reports.sql`、service role だけが書く)。利用回数は `quiz_option_report` (Free 20回/日、Pro 無制限)。クライアントは返ってきた誤答を `questions` / `allWords` / IndexedDB に反映する
   - **Lv.1 以降は語彙モードを Passive → Active → Passive … と交互に付け替える** (`getVocabularyTypeForMasteryLevel`)。四択は Passive・記述は Active だけを出すので、同じ語が「選ぶ」と「書く」を行き来して出題のされ方が変わる。Lv.0 では切り替えない (ユーザが選んだモードのまま)。古典語は記述に出さないので回さない。`/project/[id]` の一覧の3マスは習得なら全部塗ったまま、レベルごとに色を変え (`MASTERY_LEVEL_FILLS` を一巡して繰り返す)、ラベルは「習得」ではなく「Lv.N」。出題順は習得同士ならレベルの低い語が先 (`compareWordsByPriority`)
3b. **目標ページ (`/goal`, `src/app/goal/page.tsx`)**: Pro の下部バー2番目のタブ（旧「単語」`/words` の位置。`/words` 自体は残っているがナビからは外した）。1024px 以上 (PC・横向き iPad) では下部バーが消えるので、デスクトップヘッダー (`src/components/desktop/DesktopChrome.tsx` の `PRO_TABS`) にも同じ位置に置く。両者の並びはそろえること。目標は**「どの単語帳を（複数選択可）・いつまでに」を単語帳の選択で指定**し、端末の localStorage に持つ（`src/lib/goal/study-goal.ts` の `StudyGoal.projectIds`、1日の復習上限と同じ扱いで端末間には同期しない。旧形式の単数 `projectId` は読み込み時に配列へ移行する）。載せるのは 残り日数バナー / 月間カレンダー（月曜はじめ・今日・目標日・学習した日）/ **今日の10問**（目標の単語帳だけから `/quiz/all?learn=1&count=10`、絞り込みは `src/lib/quiz/review-project-filter.ts` 経由で sessionStorage に渡す）/ **今日復習しておきたい単語**（SM-2 の復習期限、全単語帳横断 `/quiz/all?review=1`）。後者2つは別物で混ぜない — 復習リンクへ飛ぶ前に絞り込みを明示的に解除する。ホームのショートカットグリッドからは「今日の復習」「保存済み単語」タイルを外した（デスクトップ版 `DesktopHome` は据え置き）
4. **語彙モード (Active / Passive)**: `Word.vocabularyType` は `'active' | 'passive' | null`。呼び方は**「Active (A)」「Passive (P)」で統一**する (`getVocabularyTypeLabel`)。以前は画面ごとに「Active/Passive」「アクティブ/パッシブ」「発信/受信」が混在していた。スキャンの既定は `passive` (`DEFAULT_SCANNED_VOCABULARY_TYPE`)。`WordStatus` の `'active'` (SM-2の定着中) とは**別物**なので混同しないこと
5. **Free Plan**: scanning is Pro-only (rejected server-side via the `check_and_increment_scan` RPC's `p_require_pro` flag); free users build wordbooks by importing shared wordbooks or adding words manually. Free users get **cloud sync** (cross-device) when logged in — same `HybridWordRepository` as Pro. The Free limit is on **wordbook (project) count = 50** (`FREE_WORDBOOK_LIMIT`), not word count — words per wordbook are unlimited. It is enforced server-side (RLS write policies gate `active Pro OR free plan`; the `enforce_free_project_limit` DB trigger caps free users at 50 wordbooks so direct PostgREST calls cannot bypass the client UI). Former-Pro (cancelled) users stay read-only. Default official wordbooks are imported into Supabase server-side at signup (`/api/auth/signup-verify` → `persistDefaultOfficialWordbooksToDb`); the client hydrates them via full sync. After signup, every active official wordbook is browsable from the shared page's 「公式」 tab (`/shared?tab=official` → `/official/[slug]`) and can be imported at any time — the copy carries `imported_from_official_slug`, the same column the signup seed dedupes on. See `docs/official-wordbook-editor.md`.
6. **SSR Compatibility**: Supabase browser client uses lazy initialization. `getDb()` throws on server side.
7. **Suspense Boundaries**: Pages using `useSearchParams()` wrapped in Suspense for Next.js 16
8. **Image Processing**: HEIC conversion and compression (max 2MB) to stay under Vercel's 4.5MB limit
9. **Favorites Mode**: Shows all favorite words across all projects, not just current project
10. **Voice Quiz (音読チャレンジ)**: `/voice-quiz/[projectId]`. Narrates a Japanese quiz prompt ("what's the English for X?"), then the user says the English answer aloud within a time limit — an oral recall test, not pronunciation practice, so the English word is never spoken before answering.
   - **Prompt text**: the carrier sentence does **not** depend on the word, so `src/lib/quiz/voice-quiz-prompt.ts` holds a fixed rotating set of templates and slots in `word.japanese`. No AI call, no DB column, no wait before the first question; the English spelling cannot leak because the prompt is built from the Japanese meaning alone (pinned by a test asserting templates contain no Latin letters).
   - **Attempts (試行回数)**: chosen on the start screen, 1–3. With 1, a single miss ends the question. With 2+, a miss triggers a spoken 「もう一回!」 (`VOICE_QUIZ_RETRY_TEMPLATES`) and re-listens until attempts run out. Success on any attempt counts as correct. A recognition-API failure never consumes a retry — it settles the question immediately since it isn't the user's fault.
   - **Batches (次の10問)**: one session is `?count=` words (default 10) taken from the head of the wordbook, ordered by `sortWordsByPriority` **once** at load. The result screen advances to the *next* batch rather than replaying the same one (`src/lib/quiz/voice-quiz-batch.ts`), keeping the chosen attempts/duration/direction. Re-sorting per batch would re-serve words already answered, so the order is fixed for the whole walk; when the wordbook runs out the button falls back to 「もう一度」.
   - **Audio**: the fixed parts of the narration (carrier sentence, 「もう一回!」, result/answer announcements) play pre-generated GCP TTS mp3s from `public/audio/voice-quiz/` (script: `src/lib/quiz/voice-quiz-audio.ts`, playback: `src/lib/quiz/voice-quiz-clips.ts`); the word and its meaning change per question, so those stay browser TTS (`src/lib/speech.ts` `speakAndWait` / `speakEnglish`). Japanese and English are always separate utterances — merging them makes the Japanese voice read English words as katakana. Clips are fetched on page mount and decoded through a Web Audio context that is **created and unlocked inside the start-button tap** (`primeVoiceQuizAudio`): in an installed PWA, an `Audio` element built per clip is refused outside a gesture, which silently turned the whole session synthetic. A clip that fails is only given up on when it is missing or undecodable — never for a timeout or a network blip, or one bad question makes the rest of the session synthetic too.
   - **Recognition**: the answer is captured with `MediaRecorder` and sent to `/api/voice-quiz/recognize`, which calls **GCP Cloud Speech-to-Text** (`src/lib/speech/cloud-speech-to-text.ts`, `GOOGLE_CLOUD_SPEECH_API_KEY`) instead of the browser's `SpeechRecognition` — needed for consistent accuracy and because `SpeechRecognition` does not work inside an installed iOS Safari PWA (`MediaRecorder` does). No speech within `TIMER_DURATION_MS` (6s) = disqualified (失格).
   - **Homophones (漢字違い)**: the quiz asks for a *spoken* meaning, but the recognizer returns kanji, so a correct answer can come back spelled differently (「恩赦」→「御社」, 「コケ」→「苔」). Three layers, cheapest first: the expected spellings go out as `speechContexts` phrases **with a boost** (a boost-less context barely biases GCP at all); `maxAlternatives` lets a lower-ranked-but-correct spelling be picked up; and if no spelling matches, the route looks up hiragana readings (`src/lib/speech/japanese-reading.ts`) and returns a 表記→読み map that `isJapaneseAnswerCorrect` compares alongside the spellings. The reading lookup is an AI call, so it only fires on answers that would otherwise be marked wrong — never on a correct one — and a failed lookup silently falls back to spelling-only judging.
   - See `docs/research/voice-quiz-gcp-feasibility.md` for the GCP-only feasibility research.

11. **Offline app shell (`public/sw-offline-shell.js`)**: offline, the real UI opens for every wordbook, not the plain `/offline.html` viewer. While a signed-in user is online, the service worker fetches one document per route in `OFFLINE_SHELL_ROUTES` (dynamic routes with the sentinel `merken-offline-shell-param` in place of the id) plus every build chunk it needs; offline it serves that document with the sentinel replaced by the requested id. A shell document is only published once all of its chunks are cached, so it can never strand the PWA. Pages listed there must stay `'use client'` and render from IndexedDB — the id must not change what the server renders.
   - **The same shell answers online launches too (instant launch)**: a navigation to a shell route is served from `SHELL_CACHE` before the network (`shouldServeShellInstantly`), and the worker checks the live build id in the background — a newer build marks the shell stale so launches go to the network until it is refilled. Every document served this way carries a boot guard in `<head>` that, on a `/_next/static` load failure or no hydration within 15s (`window.__merkenBooted`, set by `ServiceWorkerRegistration`), drops the shell and reloads from the network, and turns instant launch off for 24h. Sign-out deletes the shell. Don't remove `__merkenBooted` or the guard injection.
   - See `docs/OFFLINE-MODE-DESIGN.md`.

12. **音声で追加 (`VoiceWordModal`, `/api/words/voice-input`)**: 単語帳の「＋」メニュー・空の単語帳・デスクトップの追加メニューに「音声で追加」、新規作成シートに「音声で作成」（旧「ChatGPTで作成」の位置）。マイクを押して録音開始、もう一度押して終了（GCP同期認識の上限1分に合わせ55秒で自動終了）。録音・送信は音読クイズと同じ `MediaRecorder` → GCP Speech-to-Text（iOS PWA対応、iOSは生PCMに変換）。
   - 書き起こしは区切りの無い1本の文字列なので、見出し語への区切りだけAIに訊く (`src/lib/speech/dictated-words.ts`)。**AIの出力は書き起こしに連続して現れる語の並びだけ残す**ので、AIが綴りを直したり語を足したりしても一覧には入らない。AI失敗時は空白区切りに落とす。GCPの単語タイムスタンプは無音を語に吸収しがちで「間」での区切りには使えない
   - 一覧で直してから「追加」すると、手入力と同じ `addEnrichedManualWord`（enrich-manual で訳・発音などを補完）を3並列で通る。訳を補完できない語は保存しない。語源解析の設定は手入力と共有
   - 英語で認識するので**古典の単語帳では出さない**。利用回数は `word_voice_input`（Free 10回/日、Pro無制限）
   - 「音声で作成」は単語帳を作ってから `saveVoiceAddIntent` で遷移先の音声追加モーダルを開く（空の単語帳の手入力と同じ仕組み）

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

### 6. Classical Japanese support (古典対応) -- Done
- 古文単語帳をスキャンすると古典語（古文単語）を自動抽出する。**専用のスキャンモードは無い**。既存の全モード（`all` / `circled` / `eiken` / `idiom` / `custom`）のプロンプトに共通フラグメント（`src/lib/ai/prompts/classical.ts`）を差し込んで自動判定させる。抽出条件は「明らかに古典語と思われる語彙が単語帳形式で載っていること」だけで、丸囲み・英検級などモード固有の条件は古典語には適用しない
- そのため `ExtractMode` / `EXTRACT_MODES` / コインレート / `scan_modes` の CHECK 制約 / UIのモード一覧は**一切変更していない**
- **ヒント制**: ここでの「ヒント」＝画像に載っている訳。多義語の②③も落とさず全部 `translations` に入れる。英語向けの「同義語はまとめる」縮約（`JAPANESE_TRANSLATION_STRUCTURE_RULES`）は古典語には適用しない。古文単語帳の①②③はすべて暗記対象だから
- **共通辞書**: `classical_entries` / `classical_senses`（`20260909120000_create_classical_lexicon.sql`）。英語側の `lexicon_entries` / `lexicon_senses` と同じ全ユーザー共通マスタ。いちど貯まった見出し語のヒントは誰のスキャンでも流用される（`src/lib/classical/apply.ts`）。画像に語義が一部しか写っていなくても完全な語義セットが得られる
- 語義のマージは**保存済み優先の和集合**。既存語義は上書きせず、画像にしか無かった語義だけを末尾に足す。滲んだ写真で共有辞書が劣化しないため
- **学習データは既存の `words` / `word_translations` のまま**。見出し語は `words.english`、訳は `word_translations`、`words.classical_entry_id` で共通辞書を指す。クイズ・SM-2・同期・お気に入り・共有はそのまま動く。`is_classical` 列は作らず、`classical_entry_id` の有無が印
- 英語専用の後処理（語源解析・例文・発音・英作文・誤答生成・英語lexicon解決）はすべて `isClassicalWord()` で除外する（INV-19）
- 4択クイズの誤答は `quiz-state.ts` の既存フォールバック（同じ単語帳の他の語の訳を集める）で成立するのでクイズ側の変更は不要
- **単語帳には種別がある**（`projects.kind` = `english` / `classical`）。作成時に選び、あとから変更できない。保存時に種別に合わない語は**黙って除外**し、件数だけトーストで知らせる（`filterWordsForProjectKind`）。サーバー側でも `/api/words/create` と `scan-jobs/process` で同じ判定を行う
- **1枚の画像に英語と古典語が両方あれば英語を優先**し、古典語は捨てる（`preferEnglishOverClassical`）。プロンプトでも同じ優先順位を指示しているが、AI出力は信用せずサーバー側でも当てる
- **古典語に混入した英語例文は保存前に落とす**（`stripEnglishExampleFromClassicalWord`）。マスター(`lexicon_entries`)由来の例文が prefill される経路が残っているため、表示で隠すのではなく書き込み前に断つ
- 手動追加で古典語（ラテン文字を含まない見出し語）を入れると、英語の補完経路（翻訳AI・発音記号・品詞分類・例文生成）には一切入らず、共通辞書だけを引く

### 5. Realtime word battle (リアルタイム単語対戦) -- Done
- 早押し4択のリアルタイム1対1対戦。**コイン消費なし**。Proは無制限、**Freeは1日3回まで**（`FREE_DAILY_BATTLE_LIMIT`）。フレンド対戦（6桁招待コード）・ランダムマッチ・グループ内マッチ（`mode='group'`）に対応
- **無料枠の1回＝実際に始まった対戦1部屋**。ロビーで待っただけ・マッチングを取り消しただけでは減らない。入り口（部屋作成・招待コード参加・マッチング・ボット戦・再戦）では `requireBattleEntryUser` が残数を**見るだけ**で、実際に減らすのは `startBattle` が部屋を掴んだ後（`consumeBattleEntry`、参加者ぶん）。記録は `battle_free_entries` の (user_id, room_id) 主キーなので、両クライアントが `/start` を叩いても二重には減らない。出題生成に失敗して部屋を 'ready' に戻すときは `releaseBattleEntries` で取り消す。日の境界は**JSTの暦日**（`battle_day_key`）——コインの月境界と同じ理由
- 枠切れのまま対戦が始まろうとした部屋（入り口チェックをすり抜けた競合）は 'ready' に戻さず**部屋ごと cancelled にする**。戻すとホストのクライアントが `/start` を叩き続けて止まらない
- **進行中の対戦の読み書きは枠と無関係**。部屋の取得・回答・退出は `requireBattleUser`（ログインのみ）で通す。対戦の途中で枠が尽きて画面が読めなくなってはいけない
- 上限値は `src/lib/battle/free-allowance.ts` と SQL の RPC に二重にあり、`free-allowance.test.ts` が「`v_limit` を持ついちばん新しいマイグレーション」と突き合わせている。変えるときは TS と、上限を差し替える**新しいマイグレーション**の両方（適用ずみのマイグレーションは書き換えない。現行は `20260924120000_free_daily_battle_limit_three.sql`）
- Routes: `/battle`（ロビー）, `/battle/[roomId]`（対戦画面）, `/groups/[groupId]/battle`（グループ内マッチ）, `/api/battle/**`（rooms, join, match, start）
- Tables: `battle_rooms` / `battle_questions` / `battle_question_keys` / `battle_answers` / `battle_queue` (`supabase/migrations/20260814100000_create_word_battles.sql`)
- **出題は出題者（ホスト）の単語帳だけ**から生成（`src/lib/battle/questions.ts`）。ゲストの単語帳は参加時に記録するが問題には使わない。ホストはフレンド対戦なら部屋を作った側、ランダムマッチなら先にキューで待っていた側（`pair_battle_match`）で、問題数・制限時間もホストの設定が採用される。両者はまったく同じ問題を同じ順で解く。単語が足りなければ問題数を切り詰める（重複出題はしない）
- **グループ内対戦（`battle_rooms.group_id` あり）だけは例外で、出題元は「グループに追加された単語帳」**（`study_group_projects` の全冊を1つのプールに束ねる / `loadGroupBattleSourceWords`）。誰の本かは問わず、同じ見出し語が複数冊にあっても1回しか出題しない。個人の単語帳を使わないので `battle_rooms.host_project_id` / `battle_queue.project_id` はグループ時のみ NULL 可（`20260815110000_group_battle_uses_group_wordbooks.sql`）。単語帳が0冊のグループはマッチング自体を始めさせない
- **正解キーは `battle_question_keys` に隔離**。RLSを有効にしたうえでポリシーを一切張らないため `authenticated` からは読めず、`SECURITY DEFINER` の RPC だけが参照する。ここにSELECTポリシーを足すと早押しが自明にチートできるので**絶対に追加しない**。決着後に `battle_questions.revealed_*` へ書き戻して開示する
- **判定はすべてサーバー権威**。`submit_battle_answer` がルーム行をロックして採点するので「先に正解した方」の順序はDBが決める。締切も `started_at + round_duration_ms` をサーバー側で再検証するため、遅延パケットがラウンドを奪えない
- 1ラウンド1人1回だけ回答可能（誤答＝そのラウンド失権）。両者が外すとラウンド終了。減点はしない
- ラウンド進行・時間切れ処理は両クライアントが競って RPC を呼ぶが、`advance_battle_round` / `resolve_battle_round_timeout` は冪等かつサーバー側で条件を再検証する
- **この2つの RPC の発火は `src/lib/battle/round-action-scheduler.ts` が持ち、`useEffect` の中に `setTimeout` を置いてはいけない**。ルーム状態は Realtime と4秒ポーリングで頻繁に再取得され、そのたびに新しいオブジェクトが生成されるので、effect の cleanup が正解表示の待ち時間（`BATTLE_ROUND_REVEAL_MS`）を消してしまい、1問目を解いた時点で対戦が固まる。ラウンドが解決した後は誰も操作できず再送する主体がいないため、送信失敗時のリトライもスケジューラ側で持つ
- 同期は Supabase Realtime の `postgres_changes`（`battle_rooms` / `battle_questions`）。イベント欠落に備えて4秒間隔の再取得もかけている。回答送信だけは Vercel を経由せず**ブラウザから直接 RPC** を叩いてラウンドトリップを1回減らしている（早押しのため）
- Next.js の Route Handler は常駐できないので、サーバー側タイマーは持たず「締切時刻を持ってクライアントが叩く・サーバーが検証する」方式を取っている
- **人が集まらないときはボットが相手をする**（`src/lib/battle/bot.ts` + `20260916120000_battle_bot_opponent.sql`）。ランダムマッチ／グループ内マッチで15秒待つとロビーに誘導が出て（`BATTLE_BOT_OFFER_AFTER_MS`）、40秒で自動的にボット戦へ移る（`BATTLE_BOT_AUTO_AFTER_MS`）。待たずに始めるボタンもある。強さは かんたん / ふつう / つよい の3段階で、変わるのは**正答率と押す速さだけ**（どんなに強くても `BATTLE_BOT_MIN_BUZZ_MS` より速くは押さない）
- ボット戦の部屋は `battle_rooms.guest_is_bot`。**`mode` は 'random' / 'group' のまま**で 'bot' モードは作っていない（出題元がどちらかは今までどおり `group_id` で決まる）。ゲスト席は `guest_user_id = NULL` のままで、画面に出す参加者は `bot_name` / `bot_level` からサーバーが組み立てる（`BATTLE_BOT_USER_ID`）
- **ボットの手は出題と同時に全ラウンドぶん決めて `battle_bot_plans` に隠す**。`battle_question_keys` と同じくRLS有効・ポリシー無しなので `authenticated` からは読めない。ここにSELECTポリシーを足すと「何秒後に正解するか」が事前に分かってしまうので**絶対に追加しない**
- 対戦中にボットを動かすのは `apply_battle_bot_turn` だけ。人間の回答（`submit_battle_answer`）・時間切れ（`resolve_battle_round_timeout`）・クライアントの定期tick（`settle_battle_bot_turn`、`BATTLE_BOT_TICK_INTERVAL_MS`）のどの経路から入っても、押す時刻は「出題開始 + `buzz_at_ms`」をサーバーが再計算して判定する。tick を止めてもボットの回答は飛ばせない（人間が押した瞬間に、判定より先にボットの番が清算される）
- **ボットが勝っても `winner_user_id` は NULL**（auth.users に居ないので勝者IDを持てない）。勝敗は `outcome` の席で判定する（`getBattleResultForViewer`）。ラウンドを取ったのがボットかどうかも `battle_questions.answered_by_bot` を見る —— `answered_by` だけ見ると時間切れに化ける
- 放置されたボット部屋は「マッチングを開始」時と新しいボット戦を作るときに畳む（`cancelOpenBotRooms`）。残すと `findActiveRoomForUser` が拾って、人と対戦したい人が古いボット戦へ引き戻される
- **ボット対戦の列が無いDBでも人間同士の対戦は動く**。migration より先にコードがデプロイされると、bot列入りの SELECT が `42703` で落ちて**対戦ルームの取得が全経路で失敗**する（2026-06-24 の schema cache 障害と同じ形）。`hasBotColumns()` が一度だけ確かめ、揃っていなければ `ROOM_COLUMNS_BASE` / `QUESTION_COLUMNS_BASE`（bot列抜き）で読み、止めるのはボット戦の入口だけにする。migration 適用後は自動で復帰する。**確認は「実際に SELECT する列そのもの」を全部**（`battle_rooms` の3列・`battle_questions` の1列・`battle_bot_plans` の存在）でやること —— 代表1列だけ見ると、途中までしか適用されていないDBを「使える」と誤判定して対戦ルームの取得ごと落ちる。**fallback 側の列リストに bot列を足してもいけない**（どちらも `server-schema-compat.test.ts` が固定している）
