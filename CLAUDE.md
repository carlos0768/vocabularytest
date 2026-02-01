# Task: ストリーク機能の実装

## 目標
連続学習日数（ストリーク）を記録・表示する機能を実装する。

## 実装内容

### 1. データモデル
ファイル: `src/lib/streak.ts` (新規)

```typescript
interface StreakData {
  currentStreak: number;      // 現在の連続日数
  longestStreak: number;      // 最長記録
  lastStudyDate: string;      // ISO 8601 (YYYY-MM-DD)
  streakHistory: {            // 過去30日分の記録
    date: string;
    studied: boolean;
  }[];
}
```

### 2. LocalStorage管理
- キー: `merken_streak`
- 初期値作成関数
- 毎日最初のクイズ回答時に `studied: true` を記録
- 日付が変わった時のストリーク計算ロジック:
  - 前日まで連続 → currentStreak + 1
  - 1日以上空いた → currentStreak = 1 (リセット)

### 3. ホーム画面への表示
ファイル: `src/app/page.tsx`

**表示要素:**
- 🔥 アイコン + 「連続学習 N日目!」
- 7日間のヒートマップ (小さなドットで可視化)
- 最長記録バッジ (currentStreak === longestStreak の時)

### 4. フレームワーク化
ファイル: `src/hooks/useStreak.ts`

カスタムフック:
- `useStreak()` - 現在のストリークデータ取得
- `recordStudy()` - 学習記録を保存
- `getStreakStatus()` - 今日の学習状態

### 5. 既存コードとの統合
クイズ完了時 (`src/app/quiz/[projectId]/page.tsx`):
- `recordStudy()` を呼び出して学習を記録

## 参考ファイル
- `docs/UIUX_REDESIGN.md` の「ホーム画面の再設計」セクション
- 既存のLocalStorage管理パターン

## テスト
```bash
npx tsc --noEmit
npm run dev
```

## 完了後
```bash
git add -A
git commit -m "feat: add streak functionality with daily study tracking"
git push -u origin feature/streak
```

## 通知コマンド（完了時に実行）
```bash
openclaw gateway wake --text "Done: Streak feature implemented in vt-streak" --mode now
```
