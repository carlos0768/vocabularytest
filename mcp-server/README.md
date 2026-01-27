# ScanVocab MCP Server

Context-aware quiz generation server for ScanVocab using Python Flask and Google Embeddings API.

## Overview

このMCPサーバーは以下の機能を提供します：

- **ベクトル検索**: ユーザーの既習単語から、テキストに関連する単語を検索
- **ユーザーコンテキスト**: ユーザーの単語リストと学習進捗を取得
- **クイズ最適化**: ユーザーの単語セットを活用した文脈認識的な問題生成

## システムアーキテクチャ

```
┌─────────────────────────────────────────────┐
│  Next.js API Route (/api/sentence-quiz)    │
│  - Gemini にクイズ問題生成を依頼            │
└────────────────┬────────────────────────────┘
                 │ MCPツール呼び出し
┌────────────────▼────────────────────────────┐
│  MCP Server (HTTP Flask)                    │
│  - load_user_words                          │
│  - search_related_words                     │
│  - get_user_word_list                       │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│  Word Embedding Store                       │
│  - Google Embeddings API                    │
│  - Cosine Similarity Search                 │
│  - In-Memory Vector Database                │
└─────────────────────────────────────────────┘
```

## セットアップガイド

詳細なセットアップ手順は [SETUP.md](./SETUP.md) を参照してください。

### クイックスタート

```bash
# 1. 依存関係をインストール
pip install -r requirements.txt

# 2. 環境変数を設定
cp .env.example .env
# .env を編集して GOOGLE_AI_API_KEY を設定

# 3. サーバーを起動
python -m src.server
```

サーバーは `http://localhost:5000` で起動します。

## API エンドポイント

### POST `/tools/load_user_words`

ユーザーの単語をベクトル化してサーバーにロードします。

```bash
curl -X POST http://localhost:5000/tools/load_user_words \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "words": [
      {"english": "go", "japanese": "行く", "status": "mastered"},
      {"english": "come", "japanese": "来る", "status": "review"}
    ]
  }'
```

### POST `/tools/search_related_words`

テキストから関連単語を検索します。

```bash
curl -X POST http://localhost:5000/tools/search_related_words \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "text": "go to school",
    "limit": 3
  }'
```

### POST `/tools/get_user_word_list`

ユーザーの全単語リストを取得します。

```bash
curl -X POST http://localhost:5000/tools/get_user_word_list \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user-123"}'
```

### GET `/health`

サーバーのヘルスチェック。

```bash
curl http://localhost:5000/health
```

## Next.js との連携

`/api/sentence-quiz` ルートで以下のように使用されます：

```typescript
import { loadUserWords, searchRelatedWords } from '@/lib/mcp/client';

// 1. ユーザー単語をロード
await loadUserWords(userId, userWords);

// 2. 関連単語を検索
const relatedWords = await searchRelatedWords(userId, word.english, 3);

// 3. Gemini に渡すプロンプトに含める
const userMessage = `
単語: "${word.english}"
ユーザーの既習関連単語: ${relatedWords.map(w => w.english).join(', ')}

上記の関連単語を誤答として使用して、穴埋め問題を生成してください。
`;
```

## テクノロジー

- **Python 3.8+**
- **Flask** - HTTP Web Framework
- **Google Generative AI** - Text Embeddings API
- **NumPy** - Numerical computations (similarity calculations)

## ファイル構成

```
mcp-server/
├── src/
│   ├── server.py           # Flask アプリケーション メイン
│   └── embeddings.py       # Google Embeddings + 類似度検索
├── requirements.txt        # Python 依存関係
├── .env.example           # 環境変数テンプレート
├── SETUP.md               # 詳細なセットアップガイド
└── README.md              # このファイル
```

## トラブルシューティング

### Port が既に使用されている

```bash
MCP_SERVER_PORT=5001 python -m src.server
```

### Google AI APIエラー

- APIキーが正しいか確認
- https://aistudio.google.com で API がアクティベートされているか確認
- API呼び出し数制限に達していないか確認

詳細は [SETUP.md](./SETUP.md) を参照。

## パフォーマンス

- ロード: 1000単語 ～2-3秒
- 検索: ～100ms（1000単語時）
- 大規模ユーザー用に Chroma などのベクトルDBへの移行も可能
