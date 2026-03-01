# 単語関連情報機能 — エンジニア向け実装仕様書

## 概要

単語の詳細画面に「派生語」と「用法パターン」を表示する **上位プラン限定機能**（Proでは利用不可）。

### 例: "attach" の場合

**派生語:**
- attachment (名詞)
- attached (形容詞)
- unattached (形容詞)
- detach (動詞・反意語)

**用法パターン:**
- attach A to B （AをBに付ける）
- be attached to A （Aに愛着がある）
- attach importance to A （Aを重要視する）

---

## 1. データモデル

### 1-1. Word型に追加するフィールド (`shared/types/index.ts`)

```typescript
export interface Word {
  // ... existing fields ...

  // 派生語・用法 (Pro feature)
  derivations?: WordDerivation[];
  usagePatterns?: UsagePattern[];
}

export interface WordDerivation {
  word: string;          // e.g. "attachment"
  partOfSpeech: string;  // e.g. "noun", "adjective", "verb"
  meaning: string;       // e.g. "添付、愛着"
  relation: string;      // e.g. "noun form", "adjective form", "antonym"
}

export interface UsagePattern {
  pattern: string;       // e.g. "attach A to B"
  meaning: string;       // e.g. "AをBに付ける"
  example?: string;      // e.g. "Please attach the file to your email."
}
```

### 1-2. Supabaseテーブル変更不要

`derivations` と `usagePatterns` は `words` テーブルの既存 JSONB カラムに格納するか、Word の `derivations`/`usage_patterns` カラム（JSONB型）を新規追加する。

**推奨: 新規カラム追加**

```sql
ALTER TABLE words ADD COLUMN derivations JSONB DEFAULT NULL;
ALTER TABLE words ADD COLUMN usage_patterns JSONB DEFAULT NULL;
```

---

## 2. AI生成 — APIエンドポイント

### 2-1. 新規エンドポイント: `POST /api/word-relations`

**リクエスト:**
```json
{
  "wordIds": ["uuid1", "uuid2", ...],
  "projectId": "uuid"
}
```

**処理:**
1. `wordIds` で対象単語を取得
2. Pro会員かチェック（非Proなら403）
3. 既に `derivations` が入っている単語はスキップ
4. AI（Gemini推奨 — コスト安い）に以下のプロンプトでバッチ生成:

```
For each English word below, provide:
1. derivations: related word forms (noun, adjective, verb, adverb, antonym) with Japanese meanings
2. usage_patterns: common collocations and sentence patterns with Japanese meanings and an example sentence

Words: [word1, word2, word3, ...]

Respond in JSON format:
{
  "results": [
    {
      "word": "attach",
      "derivations": [
        {"word": "attachment", "partOfSpeech": "noun", "meaning": "添付、愛着", "relation": "noun form"},
        {"word": "attached", "partOfSpeech": "adjective", "meaning": "付属の、愛着のある", "relation": "adjective form"},
        {"word": "detach", "partOfSpeech": "verb", "meaning": "取り外す", "relation": "antonym"}
      ],
      "usagePatterns": [
        {"pattern": "attach A to B", "meaning": "AをBに付ける", "example": "Please attach the file to your email."},
        {"pattern": "be attached to A", "meaning": "Aに愛着がある", "example": "She is very attached to her hometown."},
        {"pattern": "attach importance to A", "meaning": "Aを重要視する", "example": "We attach great importance to education."}
      ]
    }
  ]
}
```

5. レスポンスをパースして各wordの `derivations`, `usage_patterns` カラムを更新
6. 更新した単語データを返す

**バッチサイズ:** 最大20語/リクエスト（AIトークン制限考慮）

### 2-2. スキャン時の自動生成（オプション・Phase 2）

Pro会員のスキャン時に、抽出と同時に派生語・用法も生成する。
`/api/scan-jobs/process/route.ts` にて、単語抽出後に `/api/word-relations` を内部呼び出し。

---

## 3. フロントエンド — 単語詳細UI

### 3-1. 表示場所

単語詳細画面（単語をタップした時のモーダル or 詳細ページ）に2つのセクションを追加:

**「派生語」セクション:**
```
📝 派生語
┌─────────────────────────────┐
│ attachment  [名詞]  添付、愛着  │
│ attached    [形容詞] 付属の    │
│ detach      [動詞]  取り外す   │
└─────────────────────────────┘
```

**「用法」セクション:**
```
💡 用法パターン
┌─────────────────────────────────────┐
│ attach A to B                        │
│ → AをBに付ける                       │
│ "Please attach the file to email."   │
├─────────────────────────────────────┤
│ be attached to A                     │
│ → Aに愛着がある                      │
│ "She is attached to her hometown."   │
└─────────────────────────────────────┘
```

### 3-2. Pro制限

- Free: セクション表示なし、または「🔒 Proで解放」のプレースホルダー表示
- Pro: データ未生成の場合「生成」ボタン表示 → API呼び出し → ローディング → 表示

### 3-3. ローディング

生成中はスケルトンUI表示。1単語あたり2-3秒程度。

---

## 4. ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `shared/types/index.ts` | `Word` に `derivations`, `usagePatterns` 追加。新type定義 |
| `shared/db/mappers.ts` | DB→型のマッピングに新カラム追加 |
| `src/app/api/word-relations/route.ts` | **新規作成** — AI生成エンドポイント |
| `src/lib/ai/prompts/` | 派生語・用法生成プロンプト追加 |
| `src/components/WordDetail.tsx` (該当コンポーネント) | 派生語・用法セクション追加 |
| Supabase migration | `derivations`, `usage_patterns` カラム追加 |

---

## 5. コスト見積もり

- Gemini 2.0 Flash: ~$0.01/20語バッチ
- 1ユーザー平均100語 → ~$0.05/ユーザー（初回生成のみ）
- 一度生成したら保存するので繰り返しコストなし

---

## 6. 優先順位

1. **Phase 1:** APIエンドポイント + DB変更 + 型定義
2. **Phase 2:** フロントUI（単語詳細画面）
3. **Phase 3:** スキャン時自動生成（Pro）
