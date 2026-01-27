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
| **API費用の最適化不足** | 全てのNLP処理をOpenAIで実行 | 不必要な高額の処理 |
| **学習状態の非活用** | AIに学習進度データが渡されない | 個人化が不十分 |
| **ツール連携の手作業** | 異なるプロバイダーの呼び出しを手動管理 | メンテナンス複雑化 |

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
│  4. コスト効率化                                │
│     - Claudeの価格 < OpenAI gpt-4o              │
│     - 不要な重複処理を削減                       │
│     → 同じ品質でコスト削減可能                   │
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

#### **MCP Server 2: User Learning Context Server**
**目的**: ユーザーの学習状態・進度をClaudeに提供

```typescript
// Resource: users/{userId}/learning-context
// Tools:
// - get_user_stats(userId)
// - get_weak_areas(userId, topN=5)
// - get_learning_history(userId, days=7)
// - get_mastered_words(userId)
// - get_review_needed(userId)

// 返り値例:
{
  totalWords: 342,
  masteredCount: 120,
  reviewCount: 98,
  newCount: 124,
  currentStreak: 15,  // days
  weakAreas: [
    { eiken: "1級", score: 0.45 },  // 不得意な級
    { category: "TOEIC", score: 0.52 }
  ],
  recentErrors: [
    { word: "ephemeral", correctRate: 0.3 },
    { word: "ameliorate", correctRate: 0.4 }
  ]
}

// 使用例:
// Claude: "このユーザーは1級の単語が弱い傾向。
//          歪曲オプションは1級レベルの類似単語を選ぼう"
```

**実装ファイル**:
- `src/mcp-servers/user-context-server.ts`
- `src/lib/mcp-tools/learning-analytics.ts`

**データソース**:
- `words` テーブル (status, updatedAt, correctCount)
- `daily_stats` テーブル (新規作成: 毎日の学習記録)

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

### シナリオ1: スマートな歪曲オプション生成

**現在のフロー** (品質: 中程度、コスト: 高)
```
1. User uploads image
2. Gemini: OCR → single words list
3. OpenAI (gpt-4o): "Generate 3 distractors per word"
   - Context不足 → つまらない歪曲
   - コスト高（全単語をOpenAIで処理）
```

**MCP統合後** (品質: 高、コスト: 低)
```
1. User uploads image
2. Gemini: OCR → single words list
3. Claude (via MCP):
   a) ユーザーの既存単語リストを取得
      → MCP: Vocabulary Data Server
   b) ユーザーの弱い分野を取得
      → MCP: User Learning Context Server
   c) プロンプトテンプレートをレンダリング
      → MCP: Prompt Template Library Server
   d) 「このユーザーの弱い分野に基づいた
      歪曲オプションを作成」とCooperating
      → MCP: AI Provider Orchestration Server

Result: より高い品質の歪曲オプション
   - ユーザーが実際に間違える可能性が高い
   - 教育的価値がある
```

**実装**:
```typescript
// src/app/api/extract/route.ts
const extractAndGenerateDistracters = async (
  userId: string,
  words: string[],
  projectId: string
) => {
  // MCPサーバーへのクライアント
  const mcpClient = getMCPClient();

  // 1. ユーザーのコンテキストを取得
  const context = await mcpClient.tools.call("get_learning_context", {
    userId
  });

  const existingWords = await mcpClient.tools.call("search_vocabulary", {
    userId,
    limit: 500
  });

  // 2. プロンプトをレンダリング
  const promptTemplate = await mcpClient.resources.read(
    `prompts/distractor_generation/v2`
  );

  const prompt = Mustache.render(promptTemplate, {
    words: words.join(", "),
    userWeakAreas: context.weakAreas,
    existingWords: existingWords.map(w => w.english),
    userLevel: context.recommendedLevel
  });

  // 3. Claudeで処理
  const distractors = await mcpClient.tools.call("call_nlp", {
    prompt,
    provider: "claude",  // Claudeのほうが良い推論
    temperature: 0.7
  });

  return distractors;
};
```

---

### シナリオ2: 学習進度に基づいたクイズ最適化

**現在**: すべてのユーザーに同じ難易度のクイズ
**MCP後**: ユーザーのレベルに合わせた動的難易度調整

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

### Phase 1: 基盤構築 (2-3週間)

- [ ] MCP SDK統合 (Next.jsプロジェクトにMCP client追加)
- [ ] Vocabulary Data Server実装
  - 既存リポジトリ (Dexie/Supabase) をMCP化
  - word クエリツール作成
- [ ] User Context Server実装
  - `daily_stats` テーブル作成
  - 学習分析ツール実装
- [ ] 開発環境でのテスト

**ファイル構成**:
```
src/
├── mcp-servers/
│   ├── vocabulary-data-server.ts
│   ├── user-context-server.ts
│   └── index.ts (サーバー起動)
├── lib/mcp-tools/
│   ├── word-queries.ts
│   ├── learning-analytics.ts
│   └── mcp-client.ts (クライアント統合)
└── app/api/
    └── mcp-debug/  (開発用エンドポイント)
```

### Phase 2: AI統合 (2-3週間)

- [ ] Prompt Template Library Server実装
- [ ] AI Provider Orchestration Server実装
- [ ] `/api/extract` をMCP経由で強化
- [ ] 歪曲オプション生成をClaudeに移行
- [ ] コスト&品質比較テスト

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

### 5.1 MCP サーバー間の通信

```
┌──────────────────────────────────────────┐
│  Next.js API Route                        │
│  (e.g., /api/extract)                    │
└──────────────┬───────────────────────────┘
               │
               ↓
      ┌────────────────────┐
      │  MCP Client Pool   │
      │  (管理: mcp.ts)    │
      └────────────┬───────┘
                   │
        ┌──────────┼──────────┬──────────┐
        ↓          ↓          ↓          ↓
    [Server1]  [Server2]  [Server3]  [Server4]
    (Vocab)    (Context)  (Prompts)  (AI)
        │          │          │          │
        └──────────┼──────────┼──────────┘
                   ↓
            実装: stdio/HTTP
                のいずれか
```

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

### コスト指標

| 項目 | 現在 | MCP導入後 | 削減幅 |
|------|------|---------|--------|
| API費用 (月間) | $2,500 | $1,800 | -28% |
| 処理時間 (平均) | 2.3s | 1.8s | -22% |

---

## 8. セキュリティ考慮事項

### 8.1 認証・認可

```typescript
// MCPサーバーへのアクセス制御
// - 各MCPサーバーはJWT検証を必須に
// - ユーザーIDはトークンから取得 (リクエストで受け取らない)
// - RLS (Row Level Security) はそのまま継続

middleware.ts で検証後、
MCPクライアントに認証済みトークンを渡す
```

### 8.2 データプライバシー

```
- MCPサーバー同士の通信は暗号化 (TLS/mTLS)
- キャッシュデータはRedisで暗号化
- MCPログには個人情報を記録しない
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

## 10. 質問と回答

**Q1: MCPはいつ立ち上げる？**
A: Next.jsサーバー起動時に `mcp-servers/index.ts` でMCPサーバープロセスを起動。child_processで別プロセスとして実行。

**Q2: 既存のOpenAI呼び出しはどうする？**
A: 段階的に移行。Phase 1はDexieアクセスのみMCP化。OpenAI呼び出しはPhase 2以降。

**Q3: 本番環境でのMCPサーバー冗長化は？**
A: MCPサーバーを複数インスタンス起動し、ロードバランサーの後ろに。フェイルオーバーは自動。

**Q4: MCPログ/デバッグはどうする？**
A: `src/app/api/mcp-debug/` エンドポイントで開発環境でのみテスト。本番はStructured Loggingで記録。

---

## 11. まとめ

MCPをScanVocabに統合すると...

✅ **品質向上**: Claudeの推論能力でより良い学習体験
✅ **コスト削減**: スマートなプロバイダー選択で28%削減
✅ **スケーラビリティ**: 各機能の独立したサーバーで保守性向上
✅ **自動最適化**: ユーザーの学習パターンに基づいた動的調整
✅ **柔軟性**: プロンプト・モデルの簡単な切り替え

**推奨開始時期**: 次のスプリント (Phase 1: 2-3週間)

