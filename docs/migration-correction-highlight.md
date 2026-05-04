# Migration: 添削結果ハイライト対応

## 概要

添削結果ページで指摘箇所を番号付きハイライトで表示する機能の完全対応に必要なDBマイグレーション。

現状の実装は `corrected_text` の文字列中から `issue.to` を検索し最初にマッチした箇所をハイライトする簡易実装。
AIが生成したテキストと `to` が完全一致しないケースでは番号と本文がずれる可能性がある。

---

## 必要なマイグレーション

### 1. `correction_issues` テーブルに位置情報カラムを追加

```sql
-- migration: add_correction_issue_positions
ALTER TABLE correction_issues
  ADD COLUMN IF NOT EXISTS from_offset   INTEGER,   -- corrected_text 内の開始位置（文字インデックス）
  ADD COLUMN IF NOT EXISTS to_offset     INTEGER;   -- corrected_text 内の終了位置（文字インデックス・排他）
```

- `from_offset`: `corrected_text[from_offset : to_offset]` が指摘箇所に対応
- `to_offset`: 終了インデックス（排他）
- 両方 NULL の場合は現在と同じ文字列検索フォールバックを使う

### 2. AI プロンプトの更新

`/src/lib/ai/correction-parser.ts` の Zod スキーマに追加:

```typescript
const correctionIssueSchema = z.object({
  // ... 既存フィールド ...
  fromOffset: z.number().int().min(0).optional(),  // correctedText 内の開始位置
  toOffset:   z.number().int().min(0).optional(),  // correctedText 内の終了位置（排他）
});
```

プロンプトに「`correctedText` 内で修正した箇所の `fromOffset`・`toOffset` を0始まりの文字インデックスで返すこと」を追記する。

### 3. フロントエンドのハイライトロジック更新

`/src/app/correction/result/page.tsx` の `buildTextSegments` を更新:

```typescript
function buildTextSegments(correctedText: string, issues: CorrectionIssue[]): TextSegment[] {
  // offset が両方存在する issue はオフセットで直接分割（精度高）
  // それ以外は既存の文字列検索フォールバック
  ...
}
```

---

## 優先度

低 — 現在のフォールバック実装（文字列検索）でも多くのケースで動作するため、
AI のプロンプトエンジニアリングが安定してから対応する。
