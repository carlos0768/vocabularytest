# Scan Extraction Gemini 2.5 Flash Runbook (Cloud Run)

## 0. Scope
- 対象: スキャン抽出API（`/api/extract`, `/api/scan-jobs/*`）
- モデル: `gemini-2.5-flash`
- 経路: Next.js -> Cloud Run (`scanvocab-ai-gateway`) -> Vertex AI Gemini
- フォールバック: Gemini障害時に OpenAI (`gpt-4o-mini`) へ自動切替（Retry + Breaker + 日次cap + Slack通知）
- 非対象: クイズ生成、埋め込み（既存OpenAI運用のまま）

## 1. 事前準備（GCP）
### 1.1 API有効化
```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com
```

### 1.2 Artifact Registry 作成
```bash
gcloud artifacts repositories create cloud-run-scan \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Container images for scan gateway"
```

### 1.3 Secret Manager 作成
```bash
echo -n '<RANDOM_LONG_TOKEN>' | gcloud secrets create scan-gateway-auth-token --data-file=-
echo -n '<OPENAI_API_KEY>' | gcloud secrets create scan-openai-api-key --data-file=-
# Optional: fallback通知をSlackへ送る場合のみ
echo -n 'https://hooks.slack.com/services/xxx/yyy/zzz' | gcloud secrets create scan-fallback-slack-webhook-url --data-file=-
```

### 1.4 GitHub Actions 用 Service Account
- 例: `github-actions-cloudrun-deployer@<PROJECT_ID>.iam.gserviceaccount.com`
- 付与推奨ロール（最小構成）
  - `roles/run.admin`
  - `roles/artifactregistry.admin`
  - `roles/cloudbuild.builds.editor`
  - `roles/secretmanager.secretAccessor`
  - `roles/iam.serviceAccountUser`

### 1.5 Workload Identity Federation（OIDC）
- GitHub Actions の OIDC を GCP Workload Identity Pool/Provider に接続する。
- GitHub 側 Secrets に以下を登録:
  - `GCP_PROJECT_ID`
  - `GCP_WORKLOAD_IDENTITY_PROVIDER`
  - `GCP_DEPLOY_SERVICE_ACCOUNT`

## 2. CI/CD（GitHub Actions）
- Workflow: `.github/workflows/deploy-cloud-run-scan.yml`
- トリガー:
  - `main` push（`cloud-run-scan/**` または workflow更新時）
  - `workflow_dispatch`（手動実行）

### 2.1 デプロイ時に設定される Cloud Run 環境変数
- `AUTH_TOKEN` <- Secret Manager `scan-gateway-auth-token:latest`
- `OPENAI_API_KEY` <- Secret Manager `scan-openai-api-key:latest`（必須）
- `FALLBACK_SLACK_WEBHOOK_URL` <- Secret Manager `scan-fallback-slack-webhook-url:latest`（任意）
- `GCP_PROJECT_ID` <- デプロイ先プロジェクトID
- `GCP_LOCATION` <- `asia-northeast1`
- `APP_ENV` <- `prod`
- `FALLBACK_OPENAI_MODEL` <- `gpt-4o-mini`
- `FALLBACK_CALLS_DAILY_CAP` <- `1000`
- `FALLBACK_COST_DAILY_CAP_YEN` <- `3000`
- `FALLBACK_ESTIMATED_YEN_PER_CALL` <- `3`
- `FALLBACK_BREAKER_OPEN_MS` <- `300000`

### 2.2 CIで実行される検証
- `cloud-run-scan` の依存インストール (`npm ci --prefix cloud-run-scan`)
- `cloud-run-scan` 単体テスト (`npm run test --prefix cloud-run-scan`)

## 3. Vercel 設定（初回は手動）
Preview -> Production の順で以下を設定する:
- `CLOUD_RUN_URL`
- `CLOUD_RUN_AUTH_TOKEN`

補足:
- 両方設定されると抽出経路は Cloud Run を必須利用する。
- どちらか欠けると Cloud Run は使われない（直接API経路）。

## 4. 段階切替（本番）
1. Cloud Run 新リビジョンをデプロイ（GitHub Actions または手動）
2. Preview環境でスモーク
```bash
curl -sS "${CLOUD_RUN_URL}/health"
```
3. Preview環境の `/api/extract` で代表ケース確認
- `all`
- `eiken`
- `highlighted`
4. Productionへ `CLOUD_RUN_*` を反映
5. Productionで同じ代表ケースをスモーク
6. 監視確認
- APIエラー率
- レイテンシ
- Cloud Run ログ（5xx, timeout, auth失敗）
- fallback通知（Slack）と fallback率

## 5. フォールバック運用（Gemini -> OpenAI）
### 5.1 BreakerとRetryの挙動
- 429(BURST/OVERLOADED/UNKNOWN), 502/503: Geminiを最大2回リトライ後、OpenAIへ切替
- timeout/network: Geminiを最大1回リトライ後、OpenAIへ切替
- QUOTA_EXHAUSTED: リトライ無しで即OpenAI切替 + breaker即OPEN
- 400/404, policy/safety, 401/403(非quota): フォールバックせず失敗返却

### 5.2 日次cap
- `FALLBACK_CALLS_DAILY_CAP=1000`
- `FALLBACK_COST_DAILY_CAP_YEN=3000`
- cap到達後は OpenAI フォールバック停止（Gemini失敗時はそのままエラー）

### 5.3 Slack通知イベント
- `QUOTA_EXHAUSTED`（Critical, 24hで1回）
- `BREAKER_OPEN`（Warning, OPEN遷移ごと1回）
- `FALLBACK_CAP_REACHED`（Critical, 到達時1回）
- `FALLBACK_RATE_HIGH`（Warning, 10分で1回）

### 5.4 推奨監視観点
- 直近10分の fallback率（20%超）
- breaker状態（OPENが連続していないか）
- fallback日次消費（calls/yen）

## 6. ロールバック
### 6.1 Cloud Run側の切戻し
- 直前の安定リビジョンへトラフィックを戻す。
```bash
gcloud run services update-traffic scanvocab-ai-gateway \
  --region asia-northeast1 \
  --to-revisions <PREVIOUS_REVISION>=100
```

### 6.2 アプリ側の切戻し
- 直前コミットに戻して再デプロイ（Vercel/GitHub Actions）

### 6.3 緊急時（Cloud Run迂回）
- Vercel の `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` を一時的に外して旧経路へ戻す。

## 7. Secretローテーション
1. Secret Manager の `scan-gateway-auth-token` を更新
2. `scan-openai-api-key` を更新（OpenAI keyを更新する場合）
3. `scan-fallback-slack-webhook-url` を更新（Slack webhookを更新する場合）
4. Cloud Run を再デプロイ（新バージョンを読み込ませる）
5. Vercel の `CLOUD_RUN_AUTH_TOKEN` を更新（shared token更新時）
6. `/health` と `/api/extract` をスモーク

## 8. 運用チェックリスト
- [ ] `main` へのデプロイ workflow 成功
- [ ] Cloud Run `/health` が 200
- [ ] Preview `/api/extract` 代表ケース成功
- [ ] Production `/api/extract` 代表ケース成功
- [ ] scan-jobs E2E（完了通知まで）成功
- [ ] エラー率・レイテンシ閾値内
- [ ] fallback通知が期待どおり（必要時のみ）発報

## 9. APIコスト制御フラグ運用
### 9.1 認証必須化（AI系API）
- `REQUIRE_AUTH_TRANSLATE=true`
- `REQUIRE_AUTH_GENERATE_EXAMPLES=true`
- `REQUIRE_AUTH_DICTATION_GRADE=true`

### 9.2 日次利用上限
- `ENABLE_AI_USAGE_LIMITS=true`
- `AI_LIMIT_TRANSLATE_FREE_DAILY=100`
- `AI_LIMIT_TRANSLATE_PRO_DAILY=500`
- `AI_LIMIT_EXAMPLES_FREE_DAILY=15`
- `AI_LIMIT_EXAMPLES_PRO_DAILY=150`
- `AI_LIMIT_DICTATION_FREE_DAILY=10`
- `AI_LIMIT_DICTATION_PRO_DAILY=60`

### 9.3 ロールアウト手順（推奨）
1. `feature_usage_daily` migrationを本番適用
2. 先に `ENABLE_AI_USAGE_LIMITS=false` でアプリ反映（認証必須化のみ有効）
3. 問題がなければ `ENABLE_AI_USAGE_LIMITS=true` へ切替
4. `/api/ops/api-costs` の `operation`/`byModel` を7日比較し効果確認

### 9.4 sentence-quiz切戻し
- 通常: `SENTENCE_QUIZ_MAX_CONCURRENCY=3`
- 緊急切戻し: `SENTENCE_QUIZ_USE_LEGACY=true`
