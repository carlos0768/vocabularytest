# vercel-log-drain

Vercel Log Drains から送られる NDJSON ログを受信し、
`proxy.statusCode >= 500` または `level === "error"` のログだけを Slack に通知する Cloud Run 向けサービスです。

## 構成
- Node.js + Express
- Slack通知: `@slack/web-api`
- 重複通知抑制: 同じ `message` は 5 分間再通知しない (メモリ内)

## エンドポイント
- `POST /` : Vercel Log Drain NDJSON受信
- `GET /` : ヘルスチェック (`ok`)

`POST /` ではヘッダー `x-vercel-verify` を `VERCEL_LOG_DRAIN_SECRET` と照合します。

## 環境変数
- `SLACK_BOT_TOKEN` (必須)
- `VERCEL_LOG_DRAIN_SECRET` (必須)
- `PORT` (任意, default: `8080`)
- `SLACK_CHANNEL_ID` (任意, default: `C0AH493Q61J`)

## ローカル実行
```bash
npm install
$env:SLACK_BOT_TOKEN="xoxb-..."
$env:VERCEL_LOG_DRAIN_SECRET="your-vercel-verify-token"
$env:SLACK_CHANNEL_ID="C0AH493Q61J"
npm start
```

## Docker ビルド
```bash
docker build -t vercel-log-drain .
docker run --rm -p 8080:8080 \
  -e SLACK_BOT_TOKEN="xoxb-..." \
  -e VERCEL_LOG_DRAIN_SECRET="your-vercel-verify-token" \
  -e SLACK_CHANNEL_ID="C0AH493Q61J" \
  vercel-log-drain
```

## Cloud Run デプロイ (asia-northeast1)
プロジェクトルートをこのフォルダにして実行:

```bash
cd C:\Users\carlo\.openclaw\workspace\vocabularytest\vercel-log-drain
gcloud config set project YOUR_GCP_PROJECT_ID

gcloud run deploy vercel-log-drain \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars SLACK_BOT_TOKEN="xoxb-...",VERCEL_LOG_DRAIN_SECRET="your-vercel-verify-token",SLACK_CHANNEL_ID="C0AH493Q61J"
```

## Vercel Log Drain 設定例
Cloud Run URL が `https://vercel-log-drain-xxxxx-an.a.run.app` の場合:

- Endpoint URL: `https://vercel-log-drain-xxxxx-an.a.run.app/`
- Verify token: `VERCEL_LOG_DRAIN_SECRET` と同じ値

## Slack通知フォーマット
```text
🚨 ランタイムエラー検知
ステータス: {statusCode}
ソース: {source}
メッセージ: {message}
時刻: {timestamp(JST)}
```
