# UI リデザイン 引き継ぎ資料

> **対象読者**: バックエンド接続担当エンジニア  
> **作成日**: 2026-05-02  
> **ブランチ**: `claude/ui-redesign-*`（worktree: `.codex/worktrees/a8f6/`）

---

## 概要

本ブランチでは、既存のバックエンドロジックを一切変更せず、**UIをデザインシステム（DS）に合わせて全ページ刷新**した。  
あなたの仕事は、このモックUIを実際のデータ・認証に接続して本番動作させること。

以下に、**あなたが触る必要のある箇所**と**絶対に触ってはいけない箇所**をまとめる。

---

## 1. 一時的に無効化したもの（必ず戻す）

### 1-1. 認証ガード（最重要）

**ファイル**: `src/lib/supabase/middleware.ts`

```ts
// 現在（モック用）
const protectedPaths: string[] = [];

// 本番に戻す
const protectedPaths = [
  '/project', '/quiz', '/quiz2', '/scan', '/settings',
  '/subscription', '/flashcard', '/sentence-quiz',
  '/favorites', '/grammar', '/stats'
];
```

UIポーティング中にすべての認証チェックをオフにした。本番接続時には必ず元のリストに戻すこと。

---

### 1-2. `ensureProjectAccess()` の guest パス（quiz / flashcard）

**ファイル**: `src/app/quiz/[projectId]/page.tsx`  
**ファイル**: `src/app/flashcard/[projectId]/page.tsx`

両ファイル内の `ensureProjectAccess()` 関数の末尾に以下の変更がある：

```ts
// 現在（モック用）— 未認証ユーザーに全プロジェクトへのアクセスを許可
return true;

// 本番に戻す — 認証なしは拒否
return false;
```

これは「未ログイン状態でモックデータ（p1 等）を表示できるようにする」ための一時措置。  
本番接続後は `return false` に戻し、ログインリダイレクトが正しく動くことを確認すること。

---

### 1-3. 空単語リストのフォールバック（quiz / flashcard）

**ファイル**: `src/app/quiz/[projectId]/page.tsx`  
**ファイル**: `src/app/flashcard/[projectId]/page.tsx`

```ts
// 現在（モック用）— 単語が0件でもローディング解除で止まる
if (sourceWords.length === 0) { setLoading(false); return; }

// 本番に戻す — プロジェクトページに戻す
if (sourceWords.length === 0) { backToProject(); return; }
```

IndexedDB/Supabase から実際の単語が取れるようになったら `backToProject()` に戻す。

---

## 2. モックデータの差し替え（ページ別）

現在ページ内に `MOCK_*` 定数でハードコードされたデータがある。  
各ページごとに実際の hook / repository に繋ぎ直す必要がある。

### 2-1. ホームページ (`src/app/page.tsx`)

| モック定数 | 実際のデータソース |
|---|---|
| `MOCK_STATS` (streak, todayCount 等) | `useDailyStats()` hook |
| `MOCK_PROJECTS` (単語帳リスト) | `useProjects()` hook / `repository.getProjects()` |
| `MOCK_MASTERY` (習得/学習中/未学習) | `repository.getMasteryStats()` or computed from words |

---

### 2-2. 単語帳詳細ページ (`src/app/project/[id]/page.tsx`)

| モック定数 | 実際のデータソース |
|---|---|
| `MOCK_PROJECT` | `repository.getProject(id)` |
| `MOCK_WORDS` | `repository.getWords(id)` |

クイズ・カードボタンは `Link href={/quiz/${projectId}}` / `Link href={/flashcard/${projectId}}` で既に正しい URL を指している。データ接続後はそのまま動くはず。

---

### 2-3. 単語帳一覧 (`src/app/projects/page.tsx`)

| モック定数 | 実際のデータソース |
|---|---|
| `MOCK_PROJECTS` | `useProjects()` hook |

---

### 2-4. お気に入り (`src/app/favorites/page.tsx`)

| モック定数 | 実際のデータソース |
|---|---|
| `MOCK_FAVORITES` | `repository.getFavoriteWords()` (全プロジェクト横断) |

---

### 2-5. 統計ページ (`src/app/stats/page.tsx`)

| モック定数 | 実際のデータソース |
|---|---|
| `MOCK_STATS` | `useDailyStats()` + SM-2 集計 |

---

### 2-6. 設定ページ (`src/app/settings/page.tsx`)

| モック定数 | 実際のデータソース |
|---|---|
| `MOCK_USER` (name, email, plan) | `useAuth()` → `user` + `useSubscription()` |

---

### 2-7. 共有ページ (`src/app/shared/page.tsx`, `src/app/share/[shareId]/page.tsx`)

共有機能は既存 API が存在する。`SharedPageClient.tsx` に既存フックが部分的に残っているため、モックを外して既存の `useSharedProject()` 系に戻す。

---

### 2-8. サブスクリプションページ (`src/app/subscription/page.tsx`)

| モック定数 | 実際のデータソース |
|---|---|
| `MOCK_PLAN` | `useSubscription()` → `status`, `isPro` |
| プランアップグレードボタン | 既存の `/api/subscription/create` への POST |

---

## 3. 変更していないもの（触らなくてよい）

以下はUIリデザインで**一切変更していない**ため、そのまま使える：

- `src/lib/db/` — リポジトリ層全体（LocalWordRepository, HybridWordRepository 等）
- `src/hooks/` — 既存フック（`useAuth`, `useProjects`, `useWords`, `useDailyStats` 等）
- `src/app/api/` — API ルート全体（extract, subscription, auth, scan-jobs 等）
- `src/lib/ai/` — AI 設定
- `src/lib/supabase/` — Supabase クライアント（middleware.ts の protectedPaths 以外）
- `supabase/migrations/` — DB マイグレーション
- `shared/types/` — ドメイン型定義

---

## 4. ボトムナビ (`src/components/ui/bottom-nav.tsx`)

DSに合わせて完全リライトした。タブ構成：

| タブ | パス | 備考 |
|---|---|---|
| ホーム | `/` | |
| 単語帳 | `/projects` | matchPaths: `/projects`, `/project`, `/collections`, `/favorites` |
| スキャン（中央） | — | `ScanCaptureModal` を開く |
| 共有 | `/shared` | |
| アカウント | `/settings` | matchPaths: `/settings`, `/subscription`, `/stats`, `/correction`, `/parser` |

`ScanCaptureModal` は既存のスキャン起動フロー（カメラ・写真ライブラリ選択）をそのまま使っているため、接続不要。写真ライブラリは複数枚選択に対応し、カメラ撮影は1回につき1枚を扱う。

---

## 5. 接続作業の推奨順序

1. `middleware.ts` の `protectedPaths` を元に戻す
2. ホームページ（`page.tsx`）のモックを `useProjects()` + `useDailyStats()` に差し替え
3. `project/[id]/page.tsx` を `repository.getProject()` + `repository.getWords()` に差し替え
4. `ensureProjectAccess()` の `return false` を戻す（quiz / flashcard）
5. 空単語リストの `backToProject()` を戻す（quiz / flashcard）
6. 残りページ（favorites, stats, settings, subscription, shared）を順次接続
7. E2E: ログイン → スキャン → 単語帳 → クイズ → フラッシュカード の動線を通す

---

## 6. 既知のAPI不足（別ドキュメント参照）

`docs/merken-web-redesign-api-gaps.md` に、DSが要求するが現在APIが存在しない機能の一覧がある（correction, parser, 苦手単語, word detail 拡張等）。今回のUI刷新で新たに加わるギャップはない。

---

## 7. ローカル開発

```bash
# このworktreeで開発サーバーを起動（port 3002、Turbopack無効）
npm run dev -- --port 3002 --no-turbopack

# または .claude/launch.json の設定を使う
# name: "next-dev-a8f6"
```

`.env.local` は `CLAUDE.md` の「Environment Setup」セクションを参照。
