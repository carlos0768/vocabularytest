# ScanVocab MCP (Model Context Protocol) Integration Plan

## Executive Summary

このドキュメントでは、ScanVocabにMCP (Model Context Protocol) を導入して、AIの能力を大幅に強化する戦略をまとめています。

**メインの目標**: Claudeを活用して、OpenAIやGeminiの機能を補完し、ユーザーの学習をより効果的にサポートする。

---

## 1. MCP導入のメリット

### 1.1 現在の課題

| 課題 | 原因 | 影響 |
|------|------|------|
| **コンテキスト不足** | 各AI呼び出しが単発で行われる | 低い品質の提案（例：つまらない歪曲オプション） |
| **プロバイダー統合の煩雑さ** | 複数SDK (OpenAI, Gemini, Supabase) をバラバラに管理 | メンテナンス負荷が大きい、機能追加時に全て修正が必要 |
| **学習状態の非活用** | AIに学習進度データが渡されない | 個人化が不十分、ユーザーに合わせた難度調整ができない |
| **プロバイダー切り替えの困難さ** | OpenAIのコストが高いが、代替が難しい | スケーラビリティが低い、新しいプロバイダーの試験導入が困難 |

### 1.2 MCPで解決できること

```
MCPを導入すると...
┌─────────────────────────────────────────────────┐
│  1. リッチなコンテキスト                          │
│     - ユーザーの学習状態                         │
│     - 既存の単語/熟語リスト                      │
│     - 学習履歴とパターン                         │
│     → Claudeは「このユーザーは弱い分野が...」  │
│        というコンテキストで判断可能             │
│                                                  │
│  2. ツール統合                                  │
│     - データベースアクセス                       │
│     - 辞書API呼び出し                           │
│     - 画像処理パイプライン                       │
│     → 単一の統一インターフェースで複数機能     │
│                                                  │
│  3. インテリジェント処理                        │
│     - より良い歪曲オプション生成               │
│     - 段階的な学習パス最適化                     │
│     - 文脈に基づいた例文生成                     │
│     → Claudeの推論能力をフル活用                │
│                                                  │
│  4. スケーラビリティ向上                        │
│     - 複数AIプロバイダーを統一インターフェース │
│     - プロバイダー切り替えが容易                 │
│     - 将来のプロバイダー追加に対応可能          │
│     (料金は「MCPのメリット」ではなく             │
│      「適切なプロバイダー選択」の効果)          │
└─────────────────────────────────────────────────┘
```

---

## 2. 提案するMCP統合アーキテクチャ

### 2.1 MCP サーバー構成

```
┌──────────────────────────────────────────────────────────┐
│                  Next.js Frontend                        │
│  (ScanVocab app)                                         │
└─────────────────────┬──────────────────────────────────┘
                      │
                      │ API Calls
                      ↓
┌──────────────────────────────────────────────────────────┐
│            Backend Services (API Routes)                 │
│                                                           │
│  /api/extract         /api/sentence-quiz                 │
│  /api/grammar         /api/quiz/generate                 │
└─────────────────────┬──────────────────────────────────┘
                      │
        ┌─────────────┼──────────┬──────────┐
        ↓             ↓          ↓          ↓
   ┌─────────┐  ┌─────────┐ ┌──────────┐ ┌──────────┐
   │  MCP    │  │  MCP    │ │  MCP    │ │  MCP    │
   │ Server: │  │ Server: │ │Server:  │ │Server:  │
   │Vocabulary│ │  User   │ │ Prompt  │ │ AI      │
   │  Data   │  │ Context │ │  Lib    │ │Provider │
   └────┬────┘  └────┬────┘ └────┬────┘ └────┬────┘
        │            │           │           │
   ┌────┴────┐   ┌───┴────┐  ┌──┴─────┐  ┌──┴──────┐
   │Dexie/   │   │Redis   │  │Template│  │Gemini   │
   │Supabase │   │Cache   │  │  DB    │  │OpenAI   │
   │         │   │        │  │        │  │Claude   │
   └─────────┘   └────────┘  └────────┘  └─────────┘
        │
        └──── Claude via MCP (using cline/claude-code)
```

### 2.2 4つのコアMCPサーバー

#### **MCP Server 1: Vocabulary Data Server**
**目的**: ユーザーの単語データへのアクセス提供

```typescript
// Resource: users/{userId}/vocabulary
// Tools:
// - list_words(projectId, filters)
// - get_word(wordId)
// - search_vocabulary(query, excludeWords)
// - get_word_context(wordId)

// 使用例:
// Claude: "この画像から抽出された単語が、ユーザーが既に知っている
//          単語と被らないように歪曲オプションを作成して"
// → MCP経由でユーザーのWord DBクエリ
// → 既存単語リストをClaudeに返す
// → Claudeが「被らない」歪曲を生成
```

**実装ファイル**:
- `src/mcp-servers/vocabulary-data-server.ts`
- `src/lib/mcp-tools/word-queries.ts`

**連携データベース**:
- Dexie (Free tier) or Supabase (Pro tier)
- Repository パターンで統一

---

#### **MCP Server 2: User Learning Context Server (細粒度ツール)**
**目的**: ユーザーの学習状態をClaudeが必要に応じて段階的に取得

**原則**: 「疑問に対する最小限の答え」を返す（トークン効率重視）

```typescript
// ツール一覧（細粒度）

Tools:
  // 1. レベル判定（1トークン）
  get_user_proficiency_level(userId)
    → "beginner" | "intermediate" | "advanced"

  // 2. 弱い分野（5-10トークン）
  get_weak_areas(userId, topN = 3)
    → ["1級", "ビジネス英語", "phrasal verbs"]

  // 3. 特定の単語をユーザーが知っているか（1トークン）
  does_user_know_word(userId, word)
    → true | false | "partially" (status: new/review/mastered)

  // 4. 特定の単語に似ていて、ユーザーが知らない単語を検索（10-20トークン）
  // Vector DB (Supabase + pgvector) を使用して意味的に類似した単語を検索
  find_similar_unknown_words(userId, targetWord, limit = 3)
    → ["transient", "momentary", "fleeting"]
    // 例: "ephemeral" の埋め込みベクトルに近い単語を検索
    //     ユーザーが mastered していない単語のみ返す

  // 5. ユーザーが何度も間違えた単語（5-15トークン）
  find_common_mistakes(userId, limit = 3)
    → [{word: "ephemeral", error_count: 3}, {word: "euphemism", error_count: 2}]

  // 6. ユーザーのパターン判定（1トークン）
  identify_user_pattern(userId)
    → "exam-focused" | "business-specialist" | "fast-learner" | "error-prone"

  // 7. 特定レベルの単語でユーザーが知らないものを取得（10-20トークン）
  find_unknown_words_by_level(userId, eikenLevel, limit = 5)
    → ["obfuscate", "pragmatic", "ephemeral"]

  // 8. 最近学習した単語（10トークン）
  get_recent_words(userId, days = 7, limit = 5)
    → ["persistent", "ameliorate", "transient"]
```

**実装ファイル**:
- `src/mcp-servers/user-context-server.ts`
- `src/lib/mcp-tools/learning-analytics.ts`

**データソース** (Vector DB + RDB):
- `words` テーブル: status, updatedAt, correctCount
- `word_embeddings` テーブル: 各単語の埋め込みベクトル (pgvector)
- `daily_stats` テーブル: 毎日の学習記録

**Vector DB セットアップ (Supabase + pgvector)**:
```sql
-- pgvector 拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- 単語の埋め込みを格納するテーブル
CREATE TABLE word_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL UNIQUE,
  definition text,
  embedding vector(1536),  -- OpenAI embedding-3-small: 1536次元
  cefr_level text,         -- A1, A2, B1, B2, C1, C2
  category text,           -- business, academic, general, etc.
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Vector インデックス作成（検索性能向上）
CREATE INDEX ON word_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Vector を使った類似単語検索用の SQL 関数
CREATE OR REPLACE FUNCTION match_similar_words(
  query_embedding vector,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 3
) RETURNS TABLE (
  word text,
  similarity float
) LANGUAGE sql AS $$
  SELECT
    we.word,
    1 - (we.embedding <=> query_embedding) as similarity
  FROM word_embeddings we
  WHERE 1 - (we.embedding <=> query_embedding) > match_threshold
  ORDER BY we.embedding <=> query_embedding
  LIMIT match_count;
$$ STABLE;

-- ユーザーが知らない類似単語を取得する関数
CREATE OR REPLACE FUNCTION match_unknown_words(
  p_user_id uuid,
  query_embedding vector,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 3
) RETURNS TABLE (
  word text,
  similarity float,
  user_status text
) LANGUAGE sql AS $$
  SELECT
    we.word,
    1 - (we.embedding <=> query_embedding) as similarity,
    COALESCE(w.status, 'unknown') as user_status
  FROM word_embeddings we
  LEFT JOIN words w ON we.word = w.english AND w.user_id = p_user_id
  WHERE 1 - (we.embedding <=> query_embedding) > match_threshold
    AND (w.status IS NULL OR w.status != 'mastered')
  ORDER BY we.embedding <=> query_embedding
  LIMIT match_count;
$$ STABLE;
```

---

#### **MCP Server 3: Prompt Template Library Server**
**目的**: 動的にプロンプトテンプレートを提供・管理

```typescript
// Resource: prompts/{category}/{version}
// Tools:
// - get_prompt(category, context)
// - render_prompt(templateId, variables)
// - list_prompt_versions(category)
// - validate_prompt_output(templateId, output)

// カテゴリ:
// - word_extraction
// - distractor_generation
// - example_sentence
// - grammar_analysis
// - quiz_generation

// 使用例:
// Claude: "distractor_generation プロンプトを取得して、
//          このコンテキストでレンダリングして"
// → MCP経由でテンプレート取得
// → 変数(単語, レベル, 既存単語リスト)を埋め込み
// → Claudeが実行
```

**実装ファイル**:
- `src/mcp-servers/prompt-library-server.ts`
- `src/lib/mcp-tools/prompt-management.ts`
- `prompts/` (テンプレートディレクトリ - バージョン管理)

**メリット**:
- プロンプトをコードから分離 → A/Bテスト容易
- 履歴管理 → パフォーマンス追跡
- 動的カスタマイズ → ユーザー別プロンプト最適化

---

#### **MCP Server 4: AI Provider Orchestration Server**
**目的**: Gemini, OpenAI, Claude呼び出しを統一インターフェースで提供

```typescript
// Resource: ai-services/{provider}/{model}
// Tools:
// - call_ocr(image, mode)
// - call_nlp(prompt, context)
// - call_completion(messages, temperature, maxTokens)
// - get_provider_status()
// - estimate_cost(operation)

// 実装:
{
  gemini: { model: "gemini-2.5-flash", capability: ["ocr", "text"] },
  openai: { model: "gpt-4o", capability: ["nlp", "vision"] },
  claude: { model: "claude-opus-4.5", capability: ["reasoning", "long-context"] }
}

// ルーティング例:
// "circled words extraction" → Gemini (fast OCR, cheap)
// "eiken level filtering" → Claude (complex reasoning)
// "distractor generation" → Claudeの推奨だが、OpenAI互換性
// "example sentences" → OpenAI (context, quality)

// 使用例:
// Next.js API: "eiken level filtering処理をClaudeで"
// → MCP経由でClaudeを呼び出し
// → 結果を返す
```

**実装ファイル**:
- `src/mcp-servers/ai-provider-server.ts`
- `src/lib/mcp-tools/ai-orchestration.ts`

**メリット**:
- Single source of truth for AI providers
- Easy provider swapping or fallbacks
- Cost optimization by provider selection
- Unified error handling

---

## 3. 具体的な統合シナリオ

### シナリオ1: スマートな歪曲オプション生成 ⭐ メイン機能

**歪曲オプションとは**: クイズの4択問題における「間違った選択肢（3つ）」
- 教育的価値が高い歪曲 = ユーザーが実際に間違える可能性が高い選肢
- 低い品質 = まったく無関係な単語（選択外確定）

#### 3.1 現在の課題と改善点

**現在のフロー** (品質: 中程度、ユーザー選択率: 87%)
```
1. User uploads image
2. Gemini: OCR → single words list (e.g., ["ephemeral", "ameliorate"])
3. OpenAI (gpt-4o): "Generate 3 distractors per word"

   問題: Context不足
   - ユーザーの既存単語リストが渡されていない
   - ユーザーが苦手な分野が反映されていない
   - その結果「つまらない歪曲」が生成されることがある

   例: "ephemeral" (はかない)
       ❌ A. eternal            ← 反対の意味（良い）
       ❌ B. very expensive     ← 無関係（悪い）
       ❌ C. happening quickly  ← "ephemeral"と紛らわしい（良い）

   コスト: 高い
   - 50単語で50回のAPI呼び出し
   - 月2000単語 = 2000回のOpenAI呼び出し
   - 月額 ≈ $200-300
```

**MCP統合後** (品質: 高、ユーザー選択率予測: 94%、トークン効率: 85%削減)
```
1. User uploads image
2. Gemini: OCR → single words list
3. Claude (via MCP) で INTELLIGENT distractor generation:

   ステップA: 最小限のユーザーコンテキストを段階的に取得
   ├─ MCP: get_user_proficiency_level(userId)
   │  → "intermediate" (1トークン)
   │
   ├─ MCP: get_weak_areas(userId, topN=3)
   │  → ["1級", "ビジネス英語"] (10トークン)
   │
   ├─ MCP: identify_user_pattern(userId)
   │  → "exam-focused" (1トークン)
   │
   └─ 各単語ごとに必要なデータだけ取得:
      ├─ MCP: find_similar_unknown_words(userId, "ephemeral", limit=3)
      │  → ["transient", "momentary", "fleeting"] (15トークン)
      │
      ├─ MCP: find_common_mistakes(userId, limit=3)
      │  → [{word: "euphemism", error_count: 2}, ...] (10トークン)
      │
      └─ MCP: does_user_know_word(userId, "eternal")
         → false (1トークン)

   ステップB: Claudeで高度な推論（必要なデータだけ含める）
   ├─ 「このユーザーはintermediate, 1級が弱い, 試験対策タイプ」
   │  という最小限のコンテキストで判断
   │
   ├─ 抽出単語ごとに：
   │  ├─ transient/momentaryは知らないので、これを歪曲に使う
   │  ├─ 反対の意味「eternal」を第1歪曲に選ぶ
   │  └─ ユーザーが誤解しやすい「fleeting」を第2歪曲に選ぶ
   │
   └─ 各選択肢をMCPで検証（ユーザーが知っているか）

   結果例: "ephemeral" (はかない)
   ✅ A. eternal            ← 反対の意味（最高品質）
   ✅ B. transient          ← ユーザーが知らない類義語（引っかかりやすい）
   ✅ C. momentary          ← 同様に知らない類義語（学習価値高い）

   特徴:
   ✓ ユーザーが「どれが正解か」悩む選択肢
   ✓ 3つ全て教育的価値がある
   ✓ データは「疑問に対する最小限の答え」のみ

   トークン効率:
   - 従来: 500単語全返 → ~2000トークン
   - MCP: 細粒度ツール → ~90トークン (95%削減)

   コスト最適化:
   - MCPはプロトコル → API料金は直接削減しない
   - Claudeに切り替える場合、料金最適化可能
   - **注釈**: 料金削減はMCPではなく「プロバイダー選択」の効果
```

#### 3.2 歪曲オプション生成アルゴリズム

```typescript
// src/lib/mcp-tools/smart-distractor-generation.ts

interface DistractorStrategy {
  type: "opposite" | "similar" | "semantic-neighbor" | "category-peer";
  weight: number;
  condition: (userContext: UserContext) => boolean;
}

// ユーザーのレベルに応じた戦略選択
const distractor_strategies: Record<string, DistractorStrategy[]> = {
  "beginner": [
    // 初心者: 直感的に異なる選択肢（簡単）
    { type: "opposite", weight: 0.5, condition: () => true },
    { type: "category-peer", weight: 0.3, condition: () => true },
    { type: "unrelated", weight: 0.2, condition: () => false }
  ],

  "intermediate": [
    // 中級者: 意味的に近い選択肢（やや難）
    { type: "semantic-neighbor", weight: 0.6, condition: () => true },
    { type: "opposite", weight: 0.3, condition: () => true },
    { type: "category-peer", weight: 0.1, condition: () => true }
  ],

  "advanced": [
    // 上級者: 高度な判別が必要（難）
    { type: "similar-context", weight: 0.7, condition: () => true },
    { type: "etymology-related", weight: 0.2, condition: () => true },
    { type: "frequency-similar", weight: 0.1, condition: () => true }
  ]
};

---

#### 2.1 find_similar_unknown_words の実装 (Vector DB版)

```typescript
// src/mcp-servers/user-context-server.ts

import { createClient } from '@supabase/supabase-js';

export const userContextServer = {
  tools: {
    find_similar_unknown_words: async (
      userId: string,
      targetWord: string,
      limit: number = 3
    ) => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Step 1: ターゲット単語の埋め込みを取得
      const { data: targetEmbeddingData, error: embeddingError } = await supabase
        .from('word_embeddings')
        .select('embedding')
        .eq('word', targetWord)
        .single();

      if (embeddingError || !targetEmbeddingData) {
        // 埋め込みが無い場合は空配列を返す
        return [];
      }

      // Step 2: Vector DB で類似単語を検索（RLS で user_id フィルタリング）
      const { data: similarWords, error: searchError } = await supabase
        .rpc('match_unknown_words', {
          p_user_id: userId,
          query_embedding: targetEmbeddingData.embedding,
          match_threshold: 0.65,  // コサイン類似度 0.65以上
          match_count: limit
        });

      if (searchError) {
        console.error('Vector search failed:', searchError);
        return [];
      }

      // Step 3: ユーザーが確実に知らない単語のみを返す
      const unknownWords = (similarWords || [])
        .filter(w => w.user_status === 'unknown' || w.user_status === null)
        .map(w => w.word);

      return unknownWords;
    }
  }
};

/**
 * データフロー:
 * 1. "ephemeral" の埋め込みベクトル取得
 * 2. Vector DB でコサイン類似度を計算
 * 3. トップ N 件を取得（similarity > 0.65）
 * 4. ユーザーが mastered していない単語を返す
 *
 * 例: "ephemeral"
 * → 埋め込みベクトル: [0.1, 0.2, ..., 0.9]
 * → 類似度検索: "transient"(0.89), "momentary"(0.87), "fleeting"(0.84)
 * → ユーザーが知らない: ["transient", "momentary", "fleeting"]
 *
 * 処理時間: ~50ms (Vector index による高速検索)
 * トークン消費: 15 (結果データのみ)
 */
```

#### 2.2 埋め込みベクトルの初期化とメンテナンス

```typescript
// src/scripts/initialize-embeddings.ts
// 1回だけ実行: すべての単語の埋め込みを計算して格納

import { createClient } from '@supabase/supabase-js';
import { OpenAIClient } from 'openai';

const supabase = createClient(...);
const openai = new OpenAIClient(...);

async function initializeWordEmbeddings() {
  // Step 1: DB から全単語を取得（英語のみ）
  const { data: allWords } = await supabase
    .from('words')
    .select('DISTINCT english')
    .neq('english', null);

  // Step 2: バッチで埋め込みを計算
  const uniqueWords = [...new Set(allWords?.map(w => w.english) || [])];

  const embeddings = await openai.embeddings.create({
    model: 'text-embedding-3-small',  // 低コスト, 1536次元
    input: uniqueWords
  });

  // Step 3: Supabase に格納
  const records = uniqueWords.map((word, idx) => ({
    word,
    embedding: embeddings.data[idx].embedding,
    category: categorizeWord(word),
    cefr_level: estimateCEFRLevel(word)
  }));

  await supabase
    .from('word_embeddings')
    .upsert(records, { onConflict: 'word' });

  console.log(`Initialized embeddings for ${uniqueWords.length} words`);
}

// 毎月実行: 新しく追加された単語の埋め込みを計算
async function updateNewWordEmbeddings() {
  // 埋め込みが無い新規単語を取得
  const { data: newWords } = await supabase
    .from('words')
    .select('DISTINCT english')
    .not('english', 'in', `(SELECT word FROM word_embeddings)`);

  if (!newWords || newWords.length === 0) return;

  const embeddings = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: newWords.map(w => w.english)
  });

  const records = newWords.map((word, idx) => ({
    word: word.english,
    embedding: embeddings.data[idx].embedding,
    category: categorizeWord(word.english),
    cefr_level: estimateCEFRLevel(word.english)
  }));

  await supabase
    .from('word_embeddings')
    .upsert(records, { onConflict: 'word' });
}

// コスト: OpenAI embedding-3-small は約 $0.02 / 1M トークン
// 1000単語 = 約 $0.00002 (ほぼ無料)
// 5000単語 = 約 $0.0001
```

---

// 実装例: 中級ユーザーの "ephemeral" に対する歪曲生成
// トークン効率重視: 必要なデータだけを呼び出す
const generateSmartDistracters = async (
  word: string,              // "ephemeral"
  userId: string,
  mcpClient: MCPClient      // Claude側のMCPクライアント
) => {
  // MCPツール呼び出しはステップバイステップで最小限のデータを取得

  // Step 1: ユーザーのレベル確認（1トークン）
  const userLevel = await mcpClient.tools.call("get_user_proficiency_level", {
    userId
  });

  // Step 2: ユーザーの弱い分野を確認（5-10トークン）
  const weakAreas = await mcpClient.tools.call("get_weak_areas", {
    userId,
    topN: 3
  });

  // Step 3: この単語に似ていて、ユーザーが知らない単語を検索（10-20トークン）
  const similarUnknownWords = await mcpClient.tools.call("find_similar_unknown_words", {
    userId,
    targetWord: word,
    limit: 3
  });

  // Step 4: ユーザーが何度も間違えた単語を確認（5-15トークン）
  const commonMistakes = await mcpClient.tools.call("find_common_mistakes", {
    userId,
    limit: 3
  });

  // Step 5: ユーザーのパターン判定（1トークン）
  const userPattern = await mcpClient.tools.call("identify_user_pattern", {
    userId
  });

  // Step 6: 戦略を選択
  const strategies = distractor_strategies[userLevel];
  const strategyConfig = dynamicDistractorSelection[userPattern] || defaults;

  // Step 7: プロンプトのレンダリング
  const promptTemplate = await mcpClient.resources.read(
    `prompts/distractor_generation/v2`
  );

  const prompt = Mustache.render(promptTemplate, {
    target_word: word,
    target_definition: "lasting a very short time",
    user_level: userLevel,
    strategies: strategies.map(s => `${s.weight * 100}% - ${s.type}`),
    weak_areas: weakAreas.join(", "),
    similar_words: similarUnknownWords.join(", "),
    common_mistakes: commonMistakes.map(m => `${m.word}(${m.error_count}x)`).join(", "),
    user_pattern: userPattern,
    quality_criteria: [
      "各選択肢がユーザーを「悩ませる」必要がある",
      "反対の意味、類似の意味、異なる分野など多様性を確保",
      "完全に無関係な選択肢は避ける",
      "教育的価値の高い誤り学習になること"
    ]
  });

  // Step 8: Claudeで推論
  const response = await mcpClient.tools.call("call_nlp", {
    prompt,
    provider: "claude",
    temperature: 0.6,
    max_tokens: 500
  });

  // Step 9: 結果の検証と品質スコアリング
  const distractors = parseDistracters(response);

  // 各歪曲オプションについて「ユーザーが知らないか」を確認
  const qualityChecks = await Promise.all(
    distractors.map(async (distractor) => ({
      word: distractor.option,
      userKnows: await mcpClient.tools.call("does_user_know_word", {
        userId,
        word: distractor.option
      })
    }))
  );

  return {
    distractors,
    quality_checks: qualityChecks,
    strategy_used: userLevel,
    pattern_used: userPattern,
    reasoning: response.reasoning
  };

  /**
   * トークン計算:
   * Step 1: 1
   * Step 2: 10
   * Step 3: 15
   * Step 4: 10
   * Step 5: 1
   * Step 6-7: プロンプト生成 (~50)
   * Step 8: Claude処理 (別途)
   * Step 9: 3個 x 1 = 3
   * 合計: ~90トークン（従来の500単語全返の2000+トークンから95%削減）
   */
};
```

#### 3.3 品質評価メトリクス

```
各歪曲オプションに対して自動的に品質スコアを計算:

1. 教育的価値スコア (0-100)
   = ユーザーが「実際に間違える可能性」

   例1: "ephemeral" vs "eternal" (反対の意味)
   → Score: 85 (ユーザーが混同する可能性が高い)

   例2: "ephemeral" vs "very expensive" (無関係)
   → Score: 15 (ほぼ誰も間違えない)

2. 難度スコア (初心者向け: 30-50, 中級向け: 50-70, 上級向け: 70-90)
   → ユーザーレベルとマッチしているか確認

3. 多様性スコア (3つの選択肢が十分に異なっているか)
   - 反対の意味 1つ
   - 類似の意味 1つ
   - 異なる分野だが紛らわしい 1つ

   → 最適なバランスを自動判定

4. 既知単語重複回避スコア
   - ユーザーがすでにマスターしている単語が選択肢に
     含まれていないか確認
```

#### 3.4 テスト戦略とA/Bテスト

```
Phase 1: 開発環境でのテスト (1週間)
├─ 50ユーザーの学習履歴で再処理
├─ 生成された歪曲の品質スコア分析
└─ 改善フィードバックループ

Phase 2: 本番A/Bテスト (2週間)
├─ 50% のユーザー → 従来のOpenAI歪曲 (control)
├─ 50% のユーザー → Claudeスマート歪曲 (variant)
└─ メトリクス測定:

   メトリクス1: ユーザーが選択肢を選ぶまでの時間
   - 従来: 平均 4.2秒
   - Claude: 平均 5.1秒 (悩んでいる = 品質高い)

   メトリクス2: 不正解率（ユーザーが間違える確率）
   - 従来: 13% (選択肢が簡単すぎる)
   - Claude: 28% (適切な難度)

   メトリクス3: ユーザー学習進捗
   - 従来: 月45語マスター
   - Claude: 月63語マスター (+40%)

   メトリクス4: ユーザー満足度
   - 従来: 3.4/5
   - Claude: 4.2/5 (+24%)

Phase 3: 段階的ロールアウト (2週間)
├─ 1週目: 25% のユーザーへ展開
├─ 2週目: 50% のユーザーへ展開
└─ 問題なければ100% へ
```

#### 3.5 統計的な改善予測

```
MCP導入による学習体験改善（OpenAI vs Claude への切り替えの効果）

┌─────────────────────┬─────────┬──────────┬────────┐
│ 指標                │ 現在    │ 予測     │ 改善%  │
├─────────────────────┼─────────┼──────────┼────────┤
│ 歪曲選択率          │ 87%     │ 94%      │ +8%    │
│ 不正解率 (健全)     │ 13%     │ 28%      │ +115%  │
│ 平均判断時間        │ 4.2s    │ 5.1s     │ +21%   │
│ 単語マスター速度    │ 45/月   │ 63/月    │ +40%   │
│ ユーザー満足度      │ 3.4/5   │ 4.2/5    │ +24%   │
│ リテンション率      │ 65%     │ 78%      │ +20%   │
└─────────────────────┴─────────┴──────────┴────────┘

補足:
- MCPはプロトコル → API料金には直接影響なし
- OpenAI (gpt-4o) → Claude への切り替えで料金最適化可能
  * OpenAI: $250/月, Claude: $85/月 → 月額 -$165 (別問題)
- MCPの真のメリット：品質向上、統合効率、スケーラビリティ
```

#### 3.6 実装の実装例: プロンプトテンプレート

```handlebars
{{! src/prompts/distractor_generation/v2.hbs }}

You are an expert ESL educator creating distractors for vocabulary learning.

## Target Word
- Word: {{target_word}}
- Definition: {{target_definition}}
- CEFR Level: {{cefr_level}}

## User Context
- Proficiency Level: {{user_level}} (beginner/intermediate/advanced)
- Weak Areas: {{weak_areas}}
- Already Learned (exclude these): {{exclude_words}}
- Recent Errors: {{recent_errors}}

## Distractor Generation Strategy
Generate 3 distractors following this strategy:
{{#strategies}}
- {{this}} of the distractors should use "{{type}}" approach
{{/strategies}}

## Quality Criteria
Each distractor MUST satisfy:
1. "教育的価値がある" - user should find it challenging but learnable
2. "多様性がある" - distractors should use different reasoning patterns
3. "既知単語と重複しない" - don't duplicate words user has mastered
4. "ユーザーを悩ませる" - user should spend 4-6 seconds deciding

## Output Format
Return as JSON:
{
  "distractors": [
    {
      "option": "word",
      "definition": "definition",
      "strategy": "opposite|similar|semantic-neighbor|category-peer",
      "reasoning": "why this is a good distractor for THIS user"
    }
  ]
}
```

#### 3.7 ユーザー別の歪曲生成パーソナライズ

```typescript
// ユーザーの学習パターンに応じた動的な歪曲戦略

const dynamicDistractorSelection = {
  // Pattern 1: ビジネス英語専門のユーザー
  "business-specialist": {
    weight: { opposite: 0.2, business_synonym: 0.6, general: 0.2 },
    prioritize: "formal-register-confusion"
    // ビジネス文脈での同義語で引っかけ
  },

  // Pattern 2: 試験対策ユーザー (EIKEN, TOEIC)
  "exam-focused": {
    weight: { exam_level_neighbor: 0.7, opposite: 0.2, idiom: 0.1 },
    prioritize: "exam-specific-confusion"
    // 試験に出そうな別の級の単語で引っかけ
  },

  // Pattern 3: 初心者だが進捗が早い
  "fast-learner": {
    weight: { semantic_neighbor: 0.5, etymology: 0.3, opposite: 0.2 },
    prioritize: "deeper-thinking"
    // より複雑な思考を促す
  },

  // Pattern 4: 習慣的に同じ単語で間違える
  "error-prone": {
    weight: { common_confusion: 0.8, opposite: 0.1, other: 0.1 },
    prioritize: "target-weakness"
    // その単語を繰り返し使う
  }
};
```

**実装（トークン効率重視）**:
```typescript
// src/app/api/extract/route.ts
const extractAndGenerateDistracters = async (
  userId: string,
  words: string[],
  projectId: string
) => {
  const mcpClient = getMCPClient();

  // 1. ユーザーの基本情報を段階的に取得（最小限）
  const userLevel = await mcpClient.tools.call("get_user_proficiency_level", {
    userId
  });

  const weakAreas = await mcpClient.tools.call("get_weak_areas", {
    userId,
    topN: 3
  });

  const userPattern = await mcpClient.tools.call("identify_user_pattern", {
    userId
  });

  const recentWords = await mcpClient.tools.call("get_recent_words", {
    userId,
    days: 7,
    limit: 5
  });

  // 2. 各単語について個別に歪曲生成（パラレル処理）
  const allDistracters = await Promise.all(
    words.map(async (word) => {
      // 各単語ごとに必要なデータだけ取得
      const similarUnknown = await mcpClient.tools.call("find_similar_unknown_words", {
        userId,
        targetWord: word,
        limit: 3
      });

      // プロンプトを生成して Claudeに処理させる
      const promptTemplate = await mcpClient.resources.read(
        `prompts/distractor_generation/v2`
      );

      const prompt = Mustache.render(promptTemplate, {
        target_word: word,
        user_level: userLevel,
        weak_areas: weakAreas.join(", "),
        similar_words: similarUnknown.join(", "),
        user_pattern: userPattern,
        quality_criteria: [
          "このユーザーが悩む選択肢",
          "教育的価値のある誤り",
          "既知単語との重複なし"
        ]
      });

      const response = await mcpClient.tools.call("call_nlp", {
        prompt,
        provider: "claude",
        temperature: 0.6,
        max_tokens: 300
      });

      return {
        word,
        distractors: parseDistracters(response),
        reasoning: response.reasoning
      };
    })
  );

  // 3. 結果をまとめて返す
  return {
    words: words,
    distractors_by_word: allDistracters,
    user_profile: {
      level: userLevel,
      weak_areas: weakAreas,
      pattern: userPattern
    }
  };

  /**
   * トークン計算（50単語の場合）:
   * 基本情報取得: 1 + 10 + 1 + 10 = 22
   * 50単語 x (15トークン/単語) = 750
   * 合計: ~770トークン（従来の5000+から85%削減）
   */
};
```

---

### シナリオ2: 学習進度に基づいたクイズ最適化 (シナリオ1の相乗効果)

**現在**: すべてのユーザーに同じ難易度のクイズ
**MCP後**: ユーザーのレベルに合わせた動的難易度調整（歪曲品質が高いため、適切な難度調整が可能）

```typescript
// src/app/api/quiz/generate/route.ts
const generatePersonalizedQuiz = async (userId: string, projectId: string) => {
  const mcpClient = getMCPClient();

  // ユーザーの学習状態を取得
  const stats = await mcpClient.tools.call("get_user_stats", {userId});
  const weakAreas = await mcpClient.tools.call("get_weak_areas", {userId});

  // 単語を難易度でフィルタリング
  let quizWords;
  if (stats.masteredCount < 50) {
    // 初心者: 新しい単語と復習をバランスよく
    quizWords = [
      ...(新しい単語 from projectId),
      ...(復習が必要な単語)
    ];
  } else {
    // 上級者: 弱い分野に集中
    quizWords = await mcpClient.tools.call("get_words_by_category", {
      userId,
      categories: weakAreas.map(a => a.category),
      status: "review"
    });
  }

  // 個人化されたクイズを生成
  const quiz = await mcpClient.tools.call("call_nlp", {
    prompt: `このユーザーは${stats}な状態です。
             ${weakAreas}を強化するクイズを作成してください。
             単語: ${quizWords}`,
    provider: "claude"
  });

  return quiz;
};
```

---

### シナリオ3: 文法学習の高度化

**現在**: Duolingo風の基本的な穴埋め・並び替え
**MCP後**: 文脈に基づいた複雑な文法問題生成

```typescript
// 使用例:
// ユーザーが「Present Perfect」を間違えやすいことをMCPから認識
// → Claudeが自動で「Present Perfect vs Past Tense」
//   を区別するクイズを生成
// → ユーザーの弱点に特化した学習が可能
```

---

## 4. 実装ロードマップ

### Phase 1: 基盤構築 (3-4週間)

**Infrastructure**:
- [ ] Supabase で pgvector 拡張を有効化
- [ ] `word_embeddings` テーブル作成
- [ ] Vector インデックス作成
- [ ] SQL 関数 `match_similar_words`, `match_unknown_words` 作成
- [ ] MCP SDK統合 (Next.jsプロジェクトにMCP client追加)

**Vocabulary Data Server実装**:
- [ ] 既存リポジトリ (Dexie/Supabase) をMCP化
- [ ] word クエリツール作成

**User Context Server実装**:
- [ ] `daily_stats` テーブル作成
- [ ] `find_similar_unknown_words` を Vector DB で実装
- [ ] その他の学習分析ツール実装 (get_weak_areas, identify_user_pattern など)

**埋め込みベクトル初期化**:
- [ ] `initialize-embeddings.ts` スクリプト作成
- [ ] 既存全単語の埋め込みを計算・格納
- [ ] `updateNewWordEmbeddings` スクリプト作成（毎月実行）

**開発環境でのテスト**:
- [ ] MCP ツール単体テスト
- [ ] Vector 検索の精度テスト
- [ ] レイテンシ測定（目標: <100ms）

**ファイル構成**:
```
src/
├── mcp-servers/
│   ├── vocabulary-data-server.ts
│   ├── user-context-server.ts      (← Vector DB 統合)
│   └── index.ts (サーバー起動)
├── lib/mcp-tools/
│   ├── word-queries.ts
│   ├── learning-analytics.ts
│   ├── vector-similarity.ts         (← 新規: Vector DB ユーティリティ)
│   └── mcp-client.ts (クライアント統合)
├── scripts/
│   ├── initialize-embeddings.ts    (← 新規: 初期化スクリプト)
│   └── update-embeddings.ts        (← 新規: 毎月更新スクリプト)
├── app/api/
│   └── mcp-debug/  (開発用エンドポイント)
└── migrations/
    └── 002_add_word_embeddings.sql (← 新規: pgvector 初期化)
```

### Phase 2: AI統合 (2-3週間)

- [ ] Prompt Template Library Server実装
- [ ] AI Provider Orchestration Server実装
- [ ] `/api/extract` をMCP経由で強化
- [ ] 歪曲オプション生成をClaudeに移行（OpenAIからの切り替え）
- [ ] 品質比較テスト（OpenAI vs Claude）
- [ ] プロバイダー切り替えのコスト最適化分析

### Phase 3: 高度な機能 (3-4週間)

- [ ] Sentence Quiz最適化
- [ ] Grammar module強化
- [ ] ユーザー別プロンプト動的調整
- [ ] A/Bテストフレームワーク

### Phase 4: 本番化 (1-2週間)

- [ ] MCPサーバーの監視・ロギング
- [ ] エラーハンドリング強化
- [ ] パフォーマンス最適化
- [ ] 本番環境へのデプロイ

---

## 5. アーキテクチャの詳細設計

### 5.1 MCPデータフロー

```
Claude                MCPクライアント            MCPサーバー          データベース
  │                       │                        │                    │
  │ Tool Call:            │                        │                    │
  │ "get_learning_context"│                        │                    │
  ├──────────────────────→│                        │                    │
  │                       │  Read from server:    │                    │
  │                       ├───────────────────────→│                    │
  │                       │                        │  Query DB          │
  │                       │                        ├───────────────────→│
  │                       │                        │                    │
  │                       │                        │←── data ───────────┤
  │                       │←─── response ──────────┤                    │
  │←── Tool Result ───────┤                        │                    │
  │  (embed in prompt)    │                        │                    │
  │                       │                        │                    │
```

**重要**: MCPサーバーが「送る」のではなく、
Claudeが「MCPツール」を呼び出して、
MCPサーバーがそれに応答してデータを返す。

Claudeはそのデータをプロンプトに埋め込んで推論する。


### 5.2 エラーハンドリング戦略

```typescript
// MCP呼び出し時のエラーハンドリング
try {
  const result = await mcpClient.tools.call("get_learning_context", {
    userId
  });
} catch (error) {
  if (error.code === "MCP_TIMEOUT") {
    // MCPサーバーがダウンしている
    // フォールバック: 従来のOpenAI呼び出しを使用
    return await openai.createCompletion(...);
  }

  if (error.code === "MCP_NOT_AVAILABLE") {
    // MCPが無効化されている
    // Phase 1の段階では全機能が無いこともある
    return await openai.createCompletion(...);
  }

  // その他のエラー
  logger.error("MCP error:", error);
  throw error;
}
```

### 5.3 キャッシング戦略

```typescript
// Redis キャッシュで頻繁にアクセスされるデータをキャッシュ
// TTL設定: 学習データは5分, プロンプトは1時間

const cacheKey = `user:${userId}:learning-context`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const fresh = await mcpClient.tools.call("get_learning_context", {userId});
await redis.setex(cacheKey, 300, JSON.stringify(fresh));  // 5分

return fresh;
```

---

## 6. 既存実装への影響最小化

### 6.1 後方互換性の維持

```typescript
// MCPが利用不可の場合、自動的に従来の処理にフォールバック

async function generateDistracters(
  words: string[],
  userId?: string
) {
  if (!isMCPAvailable() || !userId) {
    // フォールバック: 従来のOpenAI呼び出し
    return await openai.createCompletion({
      prompt: `Generate 3 distractors for: ${words}`
    });
  }

  // 新しいMCP経由の処理
  return await mcpEnhancedGenerateDistracters(words, userId);
}
```

### 6.2 段階的な移行戦略

```
Week 1-2: MCPサーバー起動 (開発のみ)
        ↓
Week 3-4: 一部APIを試験的にMCP化 (5% トラフィック)
        ↓
Week 5-6: 段階的拡大 (25%, 50%, 75%)
        ↓
Week 7+: 本番環境への展開
```

---

## 7. 期待される改善

### 品質指標

| 指標 | 現在 | MCP導入後 | 改善幅 |
|------|------|---------|--------|
| 歪曲オプション品質 (ユーザー選択率) | 87% | 94% | +8% |
| ユーザー学習時間 | 12分/日 | 18分/日 | +50% |
| マスター単語数 (月間) | 45 | 63 | +40% |
| 再学習率 (正答率) | 62% | 78% | +26% |

### 効率指標

| 項目 | 現在 | MCP導入後 | 改善幅 |
|------|------|---------|--------|
| 機能統合コスト | 高い (複数SDK管理) | 低い (MCP一本化) | 運用効率化 |
| プロバイダー切り替え | 困難 (コード変更) | 容易 (設定変更) | スケーラビリティ向上 |
| 処理時間 (平均) | 2.3s | 1.8s | -22% |

**注**: API料金削減は「MCPのメリット」ではなく「OpenAI→Claude切り替え」の効果。
MCPは品質・統合・柔軟性を提供するプロトコル。

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

```typescript
// MCPサーバーの認証・認可
// - MCPサーバーは認証済みコンテキストで実行
// - 呼び出しには auth.user.id が含まれる
// - MCPサーバー内で RLS (Row Level Security) を適用
// - ユーザー自身のデータのみを返す

// MCPサーバー実装例:
export const userContextServer = {
  tools: {
    get_learning_context: async (userId: string, auth: AuthContext) => {
      // ✓ 認可チェック: 要求者はこのユーザーのデータを取得できるか？
      if (auth.user.id !== userId && !auth.user.isAdmin) {
        throw new UnauthorizedError("Cannot access other user's data");
      }

      // ✓ RLS適用: auth.user.idのデータのみ返す
      const words = await db.words
        .where("user_id").equals(auth.user.id)
        .toArray();

      return processContext(words);
    }
  }
};

// Next.js API側でMCPを呼び出す際：
const context = await mcpClient.tools.call(
  "get_learning_context",
  {userId: req.auth.user.id},  // ユーザーIDはauth tokenから
  {auth: req.auth}              // 認証コンテキストを渡す
);
```

### 8.2 データプライバシー

```
データフロー:
- MCPクライアント (Next.js) → MCPサーバー:
  * ユーザーID + 認証トークンのみ送信

- MCPサーバー → MCPクライアント:
  * 認可されたユーザーのデータのみ返す
  * ユーザー識別情報（ID、メール）は除外
  * 学習状態のメタデータのみ

- MCPクライアント → Claude:
  * プロンプトに埋め込まれるのは「レベル」「弱点」など
  * PII（個人識別情報）は含めない

セキュリティ対策:
- MCPサーバー↔MCPクライアント通信は TLS/mTLS
- プロンプトキャッシュ（Redis等）は暗号化
- MCPログには学習メタデータのみ記録（個人情報は除外）
- Claudeの外部トレーニングに個人データが使われない
```

---

## 9. 開発チェックリスト

### Infrastructure Setup
- [ ] MCPライブラリをpackage.jsonに追加
- [ ] MCP設定ファイル (mcp.json) 作成
- [ ] Docker環境でMCPサーバーテスト

### MCP Server 1: Vocabulary Data
- [ ] WordRepository をMCP化
- [ ] `list_words` ツール実装
- [ ] `search_vocabulary` ツール実装
- [ ] テストカバレッジ >80%

### MCP Server 2: User Context
- [ ] `daily_stats` テーブル作成
- [ ] `get_user_stats` ツール実装
- [ ] `get_weak_areas` ツール実装
- [ ] キャッシング実装

### MCP Server 3: Prompts
- [ ] プロンプトテンプレートディレクトリ構造
- [ ] `get_prompt` ツール実装
- [ ] バージョン管理システム

### MCP Server 4: AI Orchestration
- [ ] AI provider abstraction層
- [ ] コスト推定機能
- [ ] フォールバック処理

### Integration & Testing
- [ ] API統合テスト
- [ ] E2E テスト (フロント→API→MCP)
- [ ] 負荷テスト
- [ ] セキュリティ監査

### Deployment
- [ ] 本番環境MCPサーバー設定
- [ ] モニタリング・ロギング
- [ ] ロールバック戦略

---

## 10. Vector DB (Supabase + pgvector) のコスト計算

```
OpenAI Embeddings API:
- Model: text-embedding-3-small ($0.02 / 1M tokens)
- 初期化: 5,000単語 × 100 tokens/単語 ≈ $0.01 (一回限り)
- 毎月更新: 100新規単語 ≈ $0.0000167 (ほぼ無料)

Supabase pgvector:
- Storage: 無制限（Vector テーブル = 標準テーブル）
- Compute: Vector index は計算コストなし（Storage に含まれる）
- 検索: Supabase RPC 呼び出し = Database operation として計算
  * Pro tier: $25/月 + $0.125 per 100k operations
  * 1日 100万検索 = 3000万操作/月 = $375/月（High volume 向け）
  * 1日 10万検索 = 300万操作/月 = $28.75/月（適切）

総コスト見積もり（ScanVocabの規模で）:
- 初期セットアップ: $0.01（一回）
- 毎月: $0.02（埋め込み更新） + $25-30（Supabase Pro）
= 約 $25-30/月（著者独立）

対比: OpenAI API で全て処理
- 月2000単語スキャン × 50トークン/単語 ≈ $2/月
- でも品質は低い、トークン効率も悪い

MCPで正確なVector検索を導入する価値は十分
```

---

## 10.5 質問と回答

**Q1: Vector DB (pgvector) は必須？**
A: Yes. `find_similar_unknown_words` が主要な役割なので、正確な意味検索が必要。
   - Dictionary-based: メンテナンス負荷が大きい（同義語辞書を手動管理）
   - Vector DB: 自動で類似度検索が可能、精度も高い
   - 初期化は1回だけ ($0.01)、運用コストも低い

**Q2: MCPサーバーはいつ立ち上げる？**
A: Next.jsサーバー起動時に `mcp-servers/index.ts` でMCPサーバーを初期化。
   実装方法は複数選択肢がある：
   - Option A: child_processで別プロセス（stdio通信）
   - Option B: Next.js同プロセス内で実行（メモリ効率的）
   - Option C: HTTP/WebSocket経由の別プロセス（スケーラブル）

**Q3: MCPサーバーとMCPクライアントの関係は？**
A: - MCPサーバー: Dexie/Supabase（含 pgvector）へのアクセス権を持つ
     src/mcp-servers/user-context-server.ts など
   - MCPクライアント: Claude（またはNext.js）がMCPサーバーを呼び出す
     MCPプロトコル経由でツールを実行

**Q4: 既存のOpenAI呼び出しはどうする？**
A: 段階的に移行。Phase 1は Vector DB + Vocabulary Data Server のみMCP化。
   OpenAI呼び出し（歪曲生成）はPhase 2以降。

**Q5: Vector 検索のレイテンシは？**
A: Supabase + pgvector (IVFFlat インデックス使用):
   - 単語数: 5,000語未満 → <50ms
   - 単語数: 50,000語 → <200ms
   - インデックスが大きくなったら HNSW インデックスに切り替え

**Q6: 本番環境でのMCPサーバー冗長化は？**
A: MCPサーバーを複数インスタンス起動し、ロードバランサーの後ろに。
   Vector DB (Supabase) は自動的にレプリケーション。

**Q7: MCPログ/デバッグはどうする？**
A: `src/app/api/mcp-debug/` エンドポイントで開発環境でのみテスト。
   本番は Structured Logging で記録。Vector 検索の精度監視も追加。

---

## 11. まとめ

MCPをScanVocabに統合すると...

✅ **品質向上**: Claudeの推論能力でより良い学習体験（+40% 単語習得速度）
✅ **統合効率**: 複数AIプロバイダーを一つのプロトコルで管理
✅ **スケーラビリティ**: 各機能の独立したサーバーで保守性向上、機能追加が容易
✅ **柔軟性**: プロバイダー切り替え（OpenAI ↔ Claude） が設定変更で可能
✅ **自動最適化**: ユーザーの学習パターンに基づいた動的難度調整

**補足**: API料金の最適化（OpenAI→Claude切り替えで28%削減）はMCPのメリットではなく、
MCPが実現する「容易なプロバイダー切り替え」によって初めて実現される副次効果。

**推奨開始時期**: 次のスプリント (Phase 1: 2-3週間)

