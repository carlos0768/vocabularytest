# iOS 単語帳ページ大改修 - 実装指示書

## ブランチ: `wip/ios-vocabulary-page-overhaul`
## 対象: `ios-native/MerkenIOS/` のみ (Swiftコード)

---

## タスク1: バグ修正 (最優先)

### 問題
既存の単語帳詳細ページからスキャンして単語を追加しようとすると、既存単語帳に追加されずに新しい単語帳が作成されてしまう。

### 調査ポイント
1. **`ScanCoordinatorView`** が `targetProjectId: project.id` を受け取っている (ProjectDetailView.swift L174あたり)
2. **`ScanCoordinatorViewModel`** の `init` で `targetProjectId` を保持
3. **`processSelectedImages`** で `submission.targetProjectId` がサーバーに送信される
4. **サーバー側 `scan-jobs/create`** の `route.ts`:
   - `validatedTargetProjectId` は `saveMode === 'server_cloud' && targetProjectId` の場合のみ設定される
   - iOS非Proユーザーは `saveMode = 'client_local'` → **`target_project_id` が null になる!**
   - これが根本原因の可能性が高い
5. **`scan-jobs-compat.ts`**: DBに `target_project_id` カラムがない場合、fallbackでカラムが削除される

### 修正方法
**サーバー側** (`src/app/api/scan-jobs/create/route.ts`):
```typescript
// 現在のコード (バグ):
let validatedTargetProjectId: string | null = null;
if (saveMode === 'server_cloud' && targetProjectId) {

// 修正後:
let validatedTargetProjectId: string | null = null;
if (targetProjectId) {
  // saveMode に関わらず targetProjectId を検証・保存する
```

`validatedTargetProjectId` の検証ブロックから `saveMode === 'server_cloud'` 条件を外す。`client_local` でも `target_project_id` をDBに保存することで、クライアント側の `importClientLocalScanJob` が `context.localTargetProjectId` を正しく取得できる。

**注意**: `PendingScanImportContext` の `localTargetProjectId` は iOS側 (`ScanCoordinatorViewModel.processSelectedImages`) で `scanDraft.targetProjectId` から設定されるので、iOS側は変更不要の可能性が高い。ただし念のため `localTargetProjectId` が正しくセットされているか確認すること。

---

## タスク2: UI変更 - ProjectDetailView.swift

### 2a. 習得/学習中/未学習ウィジェット削除
- `projectStatsSection` を **完全に削除**
- `masteryCard` 関数も削除
- `filteredWordListStatus`, `showingFilteredWordList` の State変数も削除 (もう使わない)
- `filteredWordListSheet` も削除

### 2b. contentPagerSection を廃止して新レイアウトに
現在の `contentPagerSection` (TabViewでwordsとlearning modesをスワイプ切替) を廃止し、以下の **縦一列レイアウト** に置き換える:

#### 新しい `projectBodyCard` の中身:
```
[単語一覧ボタン]     — タップで WordListView を fullScreenCover で表示
[追加ボタン]         — タップで scanModeSheet 表示 (既存のスキャン追加フロー)
─────────────────
学習モード
[フラッシュカード]   — 既存の flashcardDestination = project
[自己評価]           — 既存の quiz2Destination = project  
[マッチ]             — 既存の showMatchGame = true (4語以上)
```

#### 削除する学習モード:
- **4択クイズ** (`showingQuiz`, `QuizView` への navigationDestination) → 完全削除
- **タイムアタック** (`showTimeAttack`, `TimeAttackView` への navigationDestination) → 完全削除
- **クイックレスポンス** (`quickResponseDestination`, `QuickResponseView` への navigationDestination) → 完全削除
- **TinderSort** (`showTinderSort`, `TinderSortView` への navigationDestination) → 完全削除

#### UIデザイン指針:
- 「単語一覧」ボタン: `list.bullet` アイコン、通常スタイル (現在の `wordActionCard` と同じ)
- 「追加」ボタン: `plus.circle` アイコン、プライマリスタイル (青背景、白文字)
- 学習モードのカード: 現在の `learningModeCard` スタイルを流用
- **ページドットインジケーター削除** (`contentPage` State変数も不要)

### 2c. 不要になるState変数・関数のクリーンアップ
削除対象:
- `showingQuiz` 
- `quickResponseDestination`
- `showTinderSort`
- `showTimeAttack`
- `contentPage`
- `filteredWordListStatus`
- `showingFilteredWordList`
- `contentPageHeight` computed property
- `contentPagerSection` 
- `wordsSection` (新しいボタンセクションに置き換え)
- `learningModesSection` (新しいセクションに置き換え)
- 削除した学習モードの `navigationDestination` と `fullScreenCover`

保持するもの:
- `showingWordList` (単語一覧の表示)
- `flashcardDestination` (フラッシュカード)
- `quiz2Destination` (自己評価)
- `showMatchGame` (マッチ)
- `showingScan`, `showingScanModeSheet` (スキャン追加)
- `editorMode` (手動追加)
- looseLeafWordCard, fullScreenWordView (単語プレビュー) → **これも削除**。単語プレビューは不要になる
- `previewIndex` → 削除

---

## タスク3: WordListView の入力順ソートと区切り線

### 3a. ソートオプション追加
`WordListView.swift` に「入力順」ソートオプションを追加する。

現在のフィルター (`WordListFilter`) に加えて、ソート機能を追加:

```swift
private enum WordSortOrder: String, CaseIterable {
    case createdAsc = "入力順"     // createdAt ascending (oldest first)
    case createdDesc = "新しい順"   // createdAt descending (newest first)  
    case alphabetical = "ABC順"     // english alphabetical
}
```

UIにソート選択を追加 (Picker or segmented control、statusChips の近くに)。

### 3b. 追加タイミング別の太線区切り
「入力順」ソート選択時、**追加タイミングが異なる単語群を太線で区切る**。

判定ロジック:
- 単語の `createdAt` をタイムスタンプで比較
- 同じスキャンバッチで追加された単語は `createdAt` がほぼ同時刻（数秒以内）
- **5分以上の差がある単語間に太線区切りを入れる**

```swift
// 区切り判定: 前の単語との createdAt の差が 5分以上なら区切り
let threshold: TimeInterval = 5 * 60 // 5 minutes
if index > 0 {
    let prev = sortedWords[index - 1]
    let current = sortedWords[index]
    if abs(current.createdAt.timeIntervalSince(prev.createdAt)) > threshold {
        // 太線区切りを表示
    }
}
```

太線のスタイル:
```swift
Rectangle()
    .fill(MerkenTheme.border)
    .frame(height: 3)
    .padding(.vertical, 8)
```

---

## 実装上の注意

1. **Swiftコードのみ変更**。Web側 (`src/`) のバグ修正は別途対応する
2. **ビルドエラーを出さない** — 削除する機能の参照を全て消すこと
3. **既存のスタイル (MerkenTheme, SolidCard, IconBadge) を使う**
4. ファイルを新規作成する場合は `ios-native/MerkenIOS/Features/Project/` 内に配置
5. `Word.createdAt` は既にモデルに存在する (DomainModels.swift)

## ファイル一覧
- `ios-native/MerkenIOS/Features/Project/ProjectDetailView.swift` — メイン変更対象
- `ios-native/MerkenIOS/Features/Project/WordListView.swift` — ソート・区切り追加
- `ios-native/MerkenIOS/Features/Project/ProjectDetailViewModel.swift` — 変更不要の可能性
- `src/app/api/scan-jobs/create/route.ts` — バグ修正 (server-side)
