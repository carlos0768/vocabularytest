# Task: 統計画面の強化

## 目標
統計画面 (`/stats`) に詳細な学習分析機能を追加する。

## 実装内容

### 1. 既存統計の拡張
ファイル: `src/app/stats/page.tsx`

**現在の表示:**
- アクティビティヒートマップ (4週間)
- 今日の学習 (回答数、正答率)
- 単語統計 (習得率)
- 概要カード

**追加要素:**

#### 学習推移グラフ
- 過去30日間の日次学習量 (折れ線グラフ)
- 正答率の推移 (週次平均)
- Chart.js または Recharts を使用

#### 苦手単語ランキング
- 最も間違えた単語トップ10
- 誤答回数表示
- タップで単語詳細へ

#### プロジェクト別統計
- 各プロジェクトの習得率
- プロジェクトごとの単語数・学習進捗
- 円グラフまたは棒グラフ

#### 学習時間帯分析
- どの時間帯に学習しているか (ヒートマップ)
- 最も学習効率が良い時間帯

### 2. 新規コンポーネント

#### `src/components/stats/LearningChart.tsx`
- 30日間の学習推移グラフ

#### `src/components/stats/WeakWordsRanking.tsx`
- 苦手単語ランキングリスト

#### `src/components/stats/ProjectBreakdown.tsx`
- プロジェクト別統計

#### `src/components/stats/StudyTimeHeatmap.tsx`
- 時間帯別学習ヒートマップ

### 3. データ集計ロジック
ファイル: `src/lib/stats.ts` (拡張)

新規関数:
- `getLearningTrend(days: number)` - 学習推移
- `getWeakWordsRanking(limit: number)` - 苦手ランキング
- `getProjectStats()` - プロジェクト別統計
- `getStudyTimeDistribution()` - 時間帯分析

### 4. データ永続化
LocalStorageに統計データを保存:
- キー: `merken_stats`
- 日次学習記録 (date, quizCount, correctCount)
- 誤答履歴 (wordId, wrongCount, lastWrongAt)

## 参考ファイル
- `docs/UIUX_REDESIGN.md` の「統計画面の強化」セクション
- `src/app/stats/page.tsx` - 既存の統計画面
- `src/lib/stats.ts` - 既存の統計ロジック

## 依存インストール
```bash
npm install recharts
# または
npm install chart.js react-chartjs-2
```

## テスト
```bash
npx tsc --noEmit
npm run dev
```

## 完了後
```bash
git add -A
git commit -m "feat: enhance stats page with detailed analytics and charts"
git push -u origin feature/stats-enhance
```

## 通知コマンド（完了時に実行）
```bash
openclaw gateway wake --text "Done: Stats enhancement implemented in vt-stats-enhance" --mode now
```
