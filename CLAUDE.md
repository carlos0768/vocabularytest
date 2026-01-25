# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ScanVocab is a vocabulary learning web app where users photograph handwritten notes or printed materials, and OpenAI API extracts English words with Japanese translations and generates quiz distractors automatically.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Environment Setup

Copy `.env.example` to `.env.local` and set:
```bash
# OpenAI API Key
OPENAI_API_KEY=sk-your-api-key

# Supabase (for Pro tier cloud sync)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# KOMOJU Payment (for subscription)
KOMOJU_SECRET_KEY=your-komoju-secret-key
KOMOJU_WEBHOOK_SECRET=your-webhook-secret

# App URL (for OAuth callbacks)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Local Database**: Dexie.js (IndexedDB wrapper) - Free tier
- **Cloud Database**: Supabase (PostgreSQL) - Pro tier
- **Authentication**: Supabase Auth (Email/Password)
- **Payment**: KOMOJU (PayPay monthly subscription)
- **AI**: OpenAI API (gpt-4o) with vision for OCR + translation + distractor generation
- **Validation**: Zod for API response validation

## Architecture

### Directory Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── api/
│   │   ├── extract/        # POST /api/extract - OpenAI image analysis
│   │   └── subscription/   # KOMOJU subscription endpoints
│   │       ├── create/     # Create checkout session
│   │       ├── cancel/     # Cancel subscription
│   │       └── webhook/    # Handle KOMOJU webhooks
│   ├── auth/callback/      # Supabase auth callback handler
│   ├── login/              # Login page
│   ├── signup/             # Signup page
│   ├── settings/           # User settings & subscription management
│   ├── subscription/       # Plan selection & upgrade
│   │   ├── success/        # Post-payment success
│   │   └── cancel/         # Cancellation confirmation
│   ├── project/[id]/       # Project detail & word list
│   ├── quiz/[projectId]/   # Quiz mode (4-choice)
│   └── scan/confirm/       # Edit extracted words before saving
├── components/
│   ├── ui/                 # Button, Card, ProgressSteps
│   ├── project/            # ProjectCard, ScanButton
│   └── quiz/               # QuizOption
├── hooks/
│   ├── use-auth.ts         # Auth state & subscription hook
│   ├── use-projects.ts     # Project CRUD operations
│   └── use-words.ts        # Word CRUD operations
├── lib/
│   ├── ai/                 # OpenAI integration, prompts
│   ├── db/
│   │   ├── dexie.ts        # IndexedDB setup
│   │   ├── local-repository.ts   # LocalWordRepository (IndexedDB)
│   │   ├── remote-repository.ts  # RemoteWordRepository (Supabase)
│   │   └── index.ts        # Repository factory
│   ├── komoju/
│   │   ├── config.ts       # Plan configuration (¥500/month Pro)
│   │   └── client.ts       # KOMOJU API client
│   ├── supabase/
│   │   ├── client.ts       # Browser-side client (singleton)
│   │   ├── server.ts       # Server-side client (request-scoped)
│   │   └── index.ts        # Exports
│   ├── schemas/            # Zod validation schemas
│   └── utils.ts            # cn(), shuffleArray, scan limit tracking
├── types/                  # TypeScript interfaces
└── middleware.ts           # Auth protection for routes
supabase/
└── migrations/
    └── 001_initial_schema.sql  # Database schema with RLS
```

### Repository Pattern
Data storage abstracted via `WordRepository` interface (`src/lib/db/index.ts`):
- `LocalWordRepository` - Dexie.js/IndexedDB (Free tier)
- `RemoteWordRepository` - Supabase PostgreSQL (Pro tier)

Factory function `getRepository(subscriptionStatus)` switches implementations:
```typescript
// Free users → LocalWordRepository (IndexedDB)
// Pro users (active subscription) → RemoteWordRepository (Supabase)
const repository = getRepository(subscription.status);
```

### Subscription Tiers

| Feature | Free | Pro (¥500/month) |
|---------|------|------------------|
| Scans per day | 3 | Unlimited |
| Data storage | Local (IndexedDB) | Cloud (Supabase) |
| Cross-device sync | No | Yes |
| Data persistence | Browser only | Cloud backup |

### Data Flow
1. User uploads image → `/api/extract` → OpenAI gpt-4o vision
2. Response validated with Zod schema (`src/lib/schemas/ai-response.ts`)
3. Words stored temporarily in sessionStorage → `/scan/confirm` for editing
4. On save: Project + Words created via repository (Local or Remote)
5. Quiz pulls words, shuffles options, updates word status on answer

### Authentication Flow
1. User signs up → Supabase creates user → Email confirmation sent
2. User confirms email → Redirects to `/auth/callback` → Sets session
3. Free subscription record created automatically via database trigger
4. User upgrades → KOMOJU hosted payment page → Webhook updates subscription

### Payment Flow (KOMOJU)
1. User clicks upgrade → `/api/subscription/create` → Creates KOMOJU session
2. User redirected to KOMOJU hosted page (PayPay, credit card, etc.)
3. Payment complete → KOMOJU webhook → `/api/subscription/webhook`
4. Webhook handler updates `subscriptions` table → User becomes Pro

### Key Files
- `src/lib/ai/prompts.ts` - System prompt for word extraction
- `src/lib/db/local-repository.ts` - IndexedDB CRUD operations
- `src/lib/db/remote-repository.ts` - Supabase CRUD operations
- `src/lib/komoju/client.ts` - KOMOJU API integration
- `src/hooks/use-auth.ts` - Authentication & subscription state
- `src/lib/utils.ts` - Daily scan limit tracking (localStorage)
- `src/types/index.ts` - All TypeScript interfaces

## Database Schema (Supabase)

```sql
-- Subscriptions (linked to auth.users)
subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  status text,           -- 'free', 'active', 'cancelled', 'past_due'
  plan text,             -- 'free', 'pro'
  komoju_subscription_id text,
  komoju_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz
)

-- Projects (vocabulary books)
projects (
  id uuid PRIMARY KEY,
  user_id uuid,
  title text,
  created_at timestamptz
)

-- Words (with distractors for quiz)
words (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  english text,
  japanese text,
  distractors text[],    -- Array of 3 wrong options
  status text            -- 'new', 'review', 'mastered'
)
```

Row Level Security (RLS) ensures users can only access their own data.

## Implementation Notes

1. **AI Response Handling**: Always validate with Zod - AI output can be malformed
2. **Progress UX**: Show step-by-step progress during AI processing to prevent user drop-off
3. **Quiz Logic**:
   - Both correct and wrong answers show "次へ" button - user taps to proceed
   - Correct → green highlight, Wrong → red highlight with correct answer shown
   - Status progression: new → review → mastered (regresses on wrong answer)
   - Daily stats recorded: todayCount, correctCount, streakDays
4. **Free Plan**: 3 scans/day tracked in localStorage (reset daily)
5. **SSR Compatibility**: Supabase clients use lazy initialization to avoid build-time errors
6. **Suspense Boundaries**: Pages using `useSearchParams()` wrapped in Suspense for Next.js 16
7. **Image Processing**: HEIC conversion and compression (max 2MB) to stay under Vercel's 4.5MB limit
8. **Favorites Mode**: Shows all favorite words across all projects, not just current project

## Testing KOMOJU Webhooks Locally

Use ngrok to expose local server:
```bash
ngrok http 3000
# Configure webhook URL in KOMOJU dashboard: https://xxx.ngrok.io/api/subscription/webhook
```

## Deployment Checklist

1. Set all environment variables in hosting platform
2. Run Supabase migrations
3. Configure KOMOJU webhook URL to production domain
4. Enable email confirmation in Supabase Auth settings

## Future Features (TODO)

以下は将来実装予定の機能です。別セッションでも認識できるよう記録しています。

### 1. 丸をつけた単語だけを抽出する機能 ✅ 完了
- **概要**: ユーザーが手書きで丸をつけた単語のみをOCRで認識・抽出する
- **実装**: ScanModeModalで「丸をつけた単語のみ」モードを選択可能
- **ステータス**: 完了

### 2. 英検の級を絞って単語を抽出する機能 ✅ 完了
- **概要**: 英検5級〜1級の範囲を指定して、その級に該当する単語のみを抽出
- **実装**: ScanModeModalでEIKENレベル（5級〜1級）を選択してフィルタリング可能
- **ステータス**: 完了

### 3. 文法抽出機能（AI比較検証）
- **概要**: 画像から文法項目を抽出する機能。単語機能とは別の学習モード
- **AI比較検証**: Claude / Gemini / OpenAI の3つで精度を比較したい
- **実装ポイント**:
  - 文法専用のデータモデル設計
  - 新しいUI/UX設計が必要（単語とは別の表示形式）
  - 複数AIプロバイダーの統合（切り替え可能に）
  - 文法クイズ形式の検討
- **優先度**: 低（時間がかかる大規模機能）
- **ステータス**: 未着手
- **備考**: UI/UXの変更が大きいため、設計フェーズから慎重に進める必要あり
