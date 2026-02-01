# Task: 今日の復習機能の実装

## 目標
SM-2アルゴリズムに基づき、今日復習すべき単語を表示・学習する機能を実装する。

## 実装内容

### 1. 復習単語の取得ロジック
ファイル: `src/lib/review.ts` (新規)

```typescript
interface ReviewWord {
  word: Word;
  projectId: string;
  projectName: string;
  daysOverdue: number;  // 何日遅れているか
}

// 今日の復習単語を全プロジェクトから収集
function getTodayReviewWords(): ReviewWord[]

// 復習が必要かチェック
function isReviewDue(word: Word): boolean
```

### 2. ホーム画面への表示
ファイル: `src/app/page.tsx`

**表示要素:**
- 📚 「今日の復習」セクション
- 「N単語が復習時期です」メッセージ
- 「復習を始める」ボタン
- 各単語の復習予定日・遅れ日数の表示

### 3. 復習クイズ画面
ファイル: `src/app/review/page.tsx` (新規)

**機能:**
- 今日の復習単語一覧を表示
- 各単語をタップするとクイズ開始
- 復習完了後、SM-2パラメータを更新
- 進捗バー（N個中M個完了）

### 4. SM-2更新統合
クイズ回答後のSM-2更新 (`src/lib/sm2.ts`):
- 正解 → easeFactor上昇、intervalDays延長
- 不正解 → easeFactor低下、intervalDays短縮
- `lastReviewedAt`, `nextReviewAt` を更新

### 5. 復習優先度ソート
- 遅れている日数が多い順
- 次に easeFactor が低い順（難しい単語優先）

## 参考ファイル
- `docs/UIUX_REDESIGN.md` の「ホーム画面の再設計」セクション
- `src/lib/sm2.ts` - SM-2アルゴリズム実装
- `src/lib/db.ts` - 単語データアクセス

## テスト
```bash
npx tsc --noEmit
npm run dev
```

## 完了後
```bash
git add -A
git commit -m "feat: add today\'s review feature with SM-2 integration"
git push -u origin feature/today-review
```

## 通知コマンド（完了時に実行）
```bash
openclaw gateway wake --text "Done: Today\'s review feature implemented in vt-today-review" --mode now
```
