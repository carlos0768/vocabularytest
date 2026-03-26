# Implementation Spec: 本棚ページ廃止 & 単語帳ページUI統合

## Overview
Abolish the bookshelf (本棚/collections) page and unify everything into the vocabulary notebook (単語帳/projects) page. This is a major UI restructuring.

## Branch: `wip/bookshelf-abolish-ui-unify`

---

## Step 0: BUG FIX (PRIORITY) — 既存単語帳への追加バグ

**Bug**: When adding scanned words to an existing vocabulary notebook, a new notebook is created instead of adding to the existing one.

**Investigation Points**:
- `src/app/page.tsx` line ~928-990: `handleScanButtonClick(addToExisting=true)` → sets `isAddingToExisting` state
- `src/app/page.tsx` line ~988: When `isAddingToExisting && currentProject`, it sets `sessionStorage.setItem('scanvocab_existing_project_id', currentProject.id)`
- `src/app/scan/confirm/page.tsx` line ~97: Reads `sessionStorage.getItem('scanvocab_existing_project_id')`
- `src/app/scan/confirm/page.tsx` line ~405-415: The save logic correctly checks `isAddingToExisting && existingProjectId` and uses `targetProjectId = existingProjectId`

**Likely cause**: The `currentProject` might be null when `handleScanButtonClick(true)` is called, OR the `existingProjectId` sessionStorage value is being cleared/overwritten before the confirm page reads it, OR the project name modal flow bypasses the existing project path.

**Fix approach**: 
1. Trace the full flow from "add to existing" button click through to save
2. Ensure `scanvocab_existing_project_id` is properly set in sessionStorage before navigating to confirm page
3. Ensure the confirm page reads and uses it correctly
4. Check `handleProjectNameSubmit` - it might overwrite the existing project flow by creating a new project

---

## Step 1: Navigation — Remove 本棚 from nav

**Files to modify**:
- `src/components/ui/bottom-nav.tsx`: Remove the collections nav item `{ href: '/collections', icon: 'shelves', label: '本棚' }`
- `src/components/ui/Sidebar.tsx`: Remove the collections nav item from `navItems` array

**Keep** the `/projects` (単語帳) nav item. The bottom nav currently doesn't have `/projects` — it goes Home → 本棚 → 検索 → 統計 → 設定. Change to: Home → 単語帳 → 検索 → 統計 → 設定.

Update bottom-nav.tsx collections entry to point to `/projects`:
```
{ href: '/projects', icon: 'folder', label: '単語帳', matchPaths: ['/projects', '/project'] }
```

---

## Step 2: Projects page top UI redesign

**File**: `src/app/projects/page.tsx`

**Current top section**: Search bar + sort buttons (newest/words/lastUsed)

**New top section** (replace the current header area):

### 2a. Replace header with:
- **単語帳一覧** (list of notebooks) — keep the existing project grid below
- **追加ボタン** — a prominent "+" button that opens the scan flow (link to `/scan` or trigger scan mode selection)

### 2b. Add Learning Mode section below the header:
Add 3 learning mode cards below the two buttons but above the project list:
- **フラッシュカード** (Flash Cards) — links to flashcard for selected project
- **自己評価** (Self-Evaluation) — new mode or links to existing quiz
- **マッチ** (Match) — new matching game mode

Use the existing `StudyModeCard` component from `src/components/home/StudyModeCard.tsx` as reference for styling.

The learning mode cards should work with a "selected project" context. If no project is selected, prompt user to select one first.

---

## Step 3: Add "新しく入れた順" sort

**File**: `src/app/projects/page.tsx`

Add a new sort option to the existing sort buttons:
- Current sorts: `newest` (新しい順), `words` (単語が多い順), `lastUsed` (最近使った順)  
- Add: `recentlyAdded` (新しく入れた順) — sort by when words were most recently added to the project

This requires knowing when the last word was added to each project. Check if `lastUsedAt` or `updatedAt` on the project captures this, or if we need to query the most recent word's `createdAt`.

---

## Step 4: Word grouping by addition timing (太線区切り)

**Files**: `src/app/project/[id]/page.tsx` or `src/app/project/[id]/words/page.tsx` and `src/components/home/WordList.tsx`

When displaying words in a project detail view, group words by their `createdAt` timestamp. Words added in the same scan batch (same minute or within a few seconds) belong to one group. Different groups are separated by a **thick divider line**.

Implementation:
1. Sort words by `createdAt` ascending
2. Detect batch boundaries: if gap between consecutive words' `createdAt` is > 60 seconds, insert a divider
3. Render a thick border/divider (`border-t-2 border-[var(--color-border)]`) between groups

---

## Design Guidelines
- Follow existing design system (CSS variables, Tailwind classes)
- Mobile-first, responsive
- Use existing components (`Icon`, `AppShell`, `ProjectBookTile`, etc.)
- Do NOT add new npm packages
- Maintain existing functionality (don't break quiz, flashcard, etc.)

## Files NOT to modify
- `cloud-run-db-investigation/` — separate service
- `ios-native/` — iOS app (separate branch)
- `supabase/` — database migrations (unless needed for sorting)
