# Steps 1-5: Bookshelf Removal & Vocabulary Page UI Redesign

**Branch:** `wip/bookshelf-removal-vocab-ui` (ALREADY checked out. Do NOT switch branches.)
**Repo:** `C:\Users\carlo\.openclaw\workspace\vocabularytest`

## Context
This is a ScanVocab (Merken) app — a vocabulary learning app for Japanese students. The app currently has a "bookshelf" (本棚) concept via `collections` that organizes vocabulary notebooks. We are removing the bookshelf page and consolidating everything into the vocabulary notebook (単語帳) page.

## Step 1: Remove bookshelf page routing & navigation
- Remove or disable the `/collections` route and its sub-routes (`/collections/new`, `/collections/[id]`)
- Remove any navigation links/buttons that point to `/collections` from:
  - Bottom navigation bar (`src/components/ui/bottom-nav.tsx`)
  - Sidebar (`src/components/ui/Sidebar.tsx`)
  - Any other navigation component
- Do NOT delete the collection component files yet (they may be referenced). Just remove the routes from navigation.
- If there are redirects from collections, redirect them to `/` (home).

## Step 2: Redesign vocabulary page top UI
- In the home page (`src/app/page.tsx`), replace the current top section (which may have bookshelf/学習帳/復習ウィジェット sections) with:
  - A clean vocabulary notebook list (単語帳一覧)
  - An "add" button (追加ボタン) for creating new notebooks
- Keep the design minimal and clean. Follow the app's existing design system (CSS variables like `--color-primary`, `--color-surface`, etc.)
- The vocabulary list should show project tiles/cards (reuse `ProjectBookTile` component if available)

## Step 3: Add study mode section (学習モードセクション)
- Add a new section to the vocabulary page with study mode options:
  - フラッシュカード (Flashcards)
  - 自己評価 (Self-assessment)
  - マッチ (Match)
- These should be clickable cards/buttons that navigate to the appropriate quiz routes
- Look at existing quiz routes (`/quiz2/[projectId]`, etc.) for navigation patterns
- Place this section below the vocabulary list or in a logical position
- Style consistently with the app's design system

## Step 4: Add "newly added" sort to vocabulary list
- Add a sort option to the vocabulary notebook list that sorts by creation date (newest first)
- This should be the default sort
- Use the existing `createdAt` field on projects

## Step 5: Improve add-timing UI
- When a user adds words via scan, improve the UI flow:
  - Make the transition from scan → confirm → save smoother
  - Ensure the user clearly sees which notebook words are being added to
- This is a UX polish step. Focus on clarity and minimal friction.

## Rules
- Do NOT push. Only commit locally.
- Do NOT add new npm packages.
- Do NOT modify files unrelated to these steps.
- Keep changes minimal and focused.
- Commit each step separately with a clear message.
- Use Japanese text for UI strings (this is a Japanese app).
