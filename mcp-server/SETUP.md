# MCP Server Setup Guide

このドキュメントは、ScanVocab MCP（Model Context Protocol）サーバーのセットアップと実行方法を説明します。

## 概要

MCPサーバーは、ユーザーの登録した単語のベクトル化と類似単語検索機能を提供します。これにより、クイズ問題生成時に、ユーザーの既習単語を活用した文脈認識的な問題を作成できます。

## 前提条件

- Python 3.8以上
- Google AI API Key（Gemini）

## インストール

### 1. 依存関係のインストール

```bash
cd mcp-server
pip install -r requirements.txt
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集して、Google AI APIキーを設定：

```bash
GOOGLE_AI_API_KEY=your-google-ai-api-key-here
```

## 実行

### ローカル開発環境

```bash
# MCP サーバーを起動（ポート 5000）
python -m src.server
```

サーバーが起動したら、以下のメッセージが表示されます：

```
ScanVocab MCP Server starting on port 5000
```

### Next.js側の設定

`/home/user/vocabularytest/.env.local` に以下を追加：

```bash
MCP_SERVER_URL=http://localhost:5000
```

Next.js開発サーバーを起動：

```bash
npm run dev
```

## API エンドポイント

### POST `/tools/load_user_words`

ユーザーの登録済み単語をサーバーにロード（ベクトル化）します。

**リクエスト：**
```json
{
  "user_id": "user-123",
  "words": [
    {
      "english": "go",
      "japanese": "行く",
      "status": "mastered"
    },
    {
      "english": "come",
      "japanese": "来る",
      "status": "review"
    }
  ]
}
```

**レスポンス：**
```json
{
  "success": true,
  "message": "Loaded 2 words for user user-123"
}
```

### POST `/tools/search_related_words`

テキスト・単語から、ユーザーの既習単語の中で関連性の高い単語を検索します。

**リクエスト：**
```json
{
  "user_id": "user-123",
  "text": "go to school",
  "limit": 3
}
```

**レスポンス：**
```json
{
  "related_words": [
    {
      "english": "attend",
      "japanese": "出席する",
      "status": "mastered",
      "similarity": 0.875
    },
    {
      "english": "visit",
      "japanese": "訪問する",
      "status": "review",
      "similarity": 0.823
    },
    {
      "english": "travel",
      "japanese": "旅をする",
      "status": "new",
      "similarity": 0.756
    }
  ]
}
```

### POST `/tools/get_user_word_list`

ユーザーの登録済み単語一覧を取得します。

**リクエスト：**
```json
{
  "user_id": "user-123"
}
```

**レスポンス：**
```json
{
  "user_id": "user-123",
  "total_words": 150,
  "words": [
    {
      "word": "go",
      "meaning": "行く",
      "status": "mastered"
    },
    {
      "word": "come",
      "meaning": "来る",
      "status": "review"
    }
  ]
}
```

### GET `/health`

サーバーのヘルスチェック。

**レスポンス：**
```json
{
  "status": "ok"
}
```

## トラブルシューティング

### Port 5000 が既に使用されている場合

```bash
# 別のポートで起動（例：5001）
MCP_SERVER_PORT=5001 python -m src.server
```

その後、`.env.local` で `MCP_SERVER_URL` を更新：

```bash
MCP_SERVER_URL=http://localhost:5001
```

### Google AI APIエラー

- APIキーが正しいか確認
- Google AIスタジオ（https://aistudio.google.com）で有効化されているか確認
- API呼び出しのレート制限に達していないか確認

### Next.jsから接続できない

- MCPサーバーが起動しているか確認：`curl http://localhost:5000/health`
- `.env.local` の `MCP_SERVER_URL` が正しいか確認
- ファイアウォール設定を確認

## 本番環境デプロイ

MCPサーバーを本番環境にデプロイする場合：

1. **Gunicorn** または **uWSGI** などのWASGIサーバーを使用
2. **Docker** でコンテナ化
3. Google AI APIキーを環境変数として設定
4. `.env.local` で `MCP_SERVER_URL` を本番URLに設定

### Gunicorn での起動例

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 src.server:app
```

## アーキテクチャ

```
ユーザー登録単語
      ↓
[Google Embeddings API]
      ↓
ベクトルストア (メモリ内)
      ↓
類似度計算 (Cosine Similarity)
      ↓
関連単語リスト
      ↓
クイズ生成 (Gemini)
```

## パフォーマンス最適化

### 単語数が多い場合

ベクトル化処理は初回ロード時に実行されます（O(n)）。その後の検索は高速です（O(n)）。

- 1000単語：初回ロード ～2-3秒、検索 ～100ms
- 5000単語：初回ロード ～10-15秒、検索 ～500ms

大規模なユーザーの場合は、Chroma などのベクトルDBに移行することを検討：

```python
# embeddings.py を拡張
from chromadb import Client as ChromaClient

chroma_client = ChromaClient()
collection = chroma_client.get_or_create_collection(name="user_words")
```

## ライセンス

ScanVocab MCP Server
