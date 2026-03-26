# iOS: Bookshelf Removal & Vocabulary UI Redesign

**Branch:** `wip/bookshelf-removal-vocab-ui` (already checked out)
**iOS dir:** `ios-native/MerkenIOS/`

## Step 1: Remove Bookshelf Tab
- `App/RootTabView.swift`: Remove tab 1 "本棚" (BookshelfListView). Keep: ホーム(0), 進歩(3), 設定(4).
- Do NOT delete Bookshelf files.

## Step 2: Redesign Home
- `Features/Home/HomeView.swift`: Project list as main focus. Add "+" button.
- Keep minimal, use MerkenTheme colors.

## Step 3: Study Mode Section
- Add section in HomeView or ProjectDetailView with:
  - フラッシュカード → FlashcardView
  - 自己評価 → Quiz2View  
  - マッチ → MatchGameView
- Use existing navigation patterns.

## Step 4: Newest First Sort
- Sort projects by createdAt descending as default.

## Step 5: Scan Confirm Clarity
- `Features/Scan/ScanConfirmView.swift`: Show target notebook name when adding to existing.

## Rules
- Only commit locally. Do NOT push.
- Do NOT add Swift packages.
- Do NOT modify web files (src/).
- Commit each step separately.
- Japanese UI strings.
