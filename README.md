<p align="center">
  <img src="public/icon-512.png" width="120" height="120" alt="MERKEN logo" />
</p>

<h1 align="center">MERKEN</h1>

<p align="center">
  <strong>手入力ゼロで単語帳を作成</strong><br />
  ノートやプリントを撮影するだけで、AIが英単語を抽出・翻訳・クイズ化
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai" alt="OpenAI" />
</p>

---

## Overview

MERKEN is a vocabulary learning PWA designed for Japanese students studying English. Users photograph handwritten notes or printed materials, and GPT-4o with vision extracts English words with Japanese translations and generates quiz distractors automatically.

### Key Features

| Feature | Description |
|---------|-------------|
| **OCR Scan** | Photograph notes/textbooks &rarr; AI extracts words with translations |
| **4-Choice Quiz** | Spaced repetition quiz with auto-generated distractors |
| **Flashcards** | Swipe-based card review (Pro) |
| **Sentence Quiz** | AI-generated example sentences with vector similarity search (Pro) |
| **Dictation** | Listen-and-type exercises with text-to-speech (Pro) |
| **Smart Scan Modes** | Circled words only, highlighted words, EIKEN level filter, idiom extraction |
| **Background Processing** | Pro users can scan in the background while continuing to study |
| **Offline Support** | PWA with Service Worker &mdash; works offline with local IndexedDB storage |
| **Cross-device Sync** | Pro users get real-time cloud sync via Supabase |
| **Share & Import** | Share word lists via link (Pro) |

## Architecture

```
src/
├── app/                    # Next.js 16 App Router
│   ├── api/
│   │   ├── extract/        # GPT-4o vision OCR + translation
│   │   ├── sentence-quiz/  # Example sentence generation with pgvector
│   │   ├── scan-jobs/      # Background scan job management
│   │   └── subscription/   # KOMOJU payment integration
│   ├── quiz/[projectId]/   # 4-choice quiz with spaced repetition
│   ├── flashcard/          # Swipe card review
│   ├── dictation/          # Listen-and-type exercises
│   └── project/[id]/       # Project detail (study, words, stats)
├── components/
│   ├── ui/                 # Design system (AppShell, Icon, Button, etc.)
│   ├── home/               # Dashboard widgets
│   ├── project/            # ProjectBookTile, ProjectCard
│   └── quiz/               # QuizOption
├── hooks/                  # Custom React hooks (use-auth, use-projects, etc.)
├── lib/
│   ├── ai/                 # OpenAI prompts & response parsing
│   ├── db/                 # Repository pattern (Local/Remote/Hybrid)
│   ├── supabase/           # Supabase client (browser + server)
│   ├── komoju/             # KOMOJU payment client
│   └── spaced-repetition/  # SM-2 algorithm implementation
└── types/                  # TypeScript interfaces
```

### Data Layer

The app uses a **Repository Pattern** to abstract storage:

```
Free users  →  LocalWordRepository   (IndexedDB via Dexie.js)
Pro users   →  HybridWordRepository  (IndexedDB + Supabase sync)
```

Both implementations share the same `WordRepository` interface, so the UI layer is storage-agnostic.

### Design System

- **Primary color**: `#137fec`
- **Font**: [Lexend](https://fonts.google.com/specimen/Lexend) (Google Fonts)
- **Icons**: [Material Symbols Outlined](https://fonts.google.com/icons) via CDN
- **Layout**: `AppShell` with Sidebar (desktop) / BottomNav (mobile)
- **Buttons**: Duolingo-style 3D effect (`border-b-4` + `active:border-b-2`)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Local DB | Dexie.js (IndexedDB wrapper) |
| Cloud DB | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (Email/Password) |
| AI | OpenAI GPT-4o (vision + text) |
| Payment | KOMOJU (PayPay, credit card, convenience store) |
| Validation | Zod |
| PWA | Service Worker + Web App Manifest |

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Supabase project (for Pro features)
- OpenAI API key

### Installation

```bash
git clone https://github.com/carlos0768/vocabularytest.git
cd vocabularytest
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Required variables:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# KOMOJU Payment
KOMOJU_SECRET_KEY=your-secret
KOMOJU_WEBHOOK_SECRET=your-webhook-secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Database Setup

Run all Supabase migrations:

```bash
npx supabase db push
```

### Development

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
```

## Subscription Tiers

| | Free | Pro (500 yen/month) |
|---|---|---|
| Scans | Unlimited* | Unlimited |
| Word limit | 200 words | Unlimited |
| Storage | Local (IndexedDB) | Cloud (Supabase) |
| Cross-device sync | - | Yes |
| Flashcards | - | Yes |
| Sentence quiz | - | Yes |
| Dictation | - | Yes |
| Smart scan modes | - | Yes |
| Background scan | - | Yes |
| Share word lists | - | Yes |

## Deployment

Deployed on **Vercel**. Ensure all environment variables are set and Supabase migrations are applied.

```bash
npm run build   # Verify build succeeds locally first
```

KOMOJU webhook URL must point to your production domain:
```
https://your-domain.com/api/subscription/webhook
```

## License

Private repository. All rights reserved.
