# Scan Extraction Gemini 2.5 Flash Runbook (Cloud Run)

## 0. Scope
- 対象: スキャン抽出API（`/api/extract`, `/api/scan-jobs/*`）
- モデル: `gemini-2.5-flash`
- 経路: Next.js -> Cloud Run (`scanvocab-ai-gateway`) -> Vertex AI Gemini
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
- `GCP_PROJECT_ID` <- デプロイ先プロジェクトID
- `GCP_LOCATION` <- `asia-northeast1`

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

## 5. ロールバック
### 5.1 Cloud Run側の切戻し
- 直前の安定リビジョンへトラフィックを戻す。
```bash
gcloud run services update-traffic scanvocab-ai-gateway \
  --region asia-northeast1 \
  --to-revisions <PREVIOUS_REVISION>=100
```

### 5.2 アプリ側の切戻し
- 直前コミットに戻して再デプロイ（Vercel/GitHub Actions）

### 5.3 緊急時（Cloud Run迂回）
- Vercel の `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` を一時的に外して旧経路へ戻す。

## 6. Secretローテーション
1. Secret Manager の `scan-gateway-auth-token` を更新
2. Cloud Run を再デプロイ（新バージョンを読み込ませる）
3. Vercel の `CLOUD_RUN_AUTH_TOKEN` を更新
4. `/health` と `/api/extract` をスモーク

## 7. 運用チェックリスト
- [ ] `main` へのデプロイ workflow 成功
- [ ] Cloud Run `/health` が 200
- [ ] Preview `/api/extract` 代表ケース成功
- [ ] Production `/api/extract` 代表ケース成功
- [ ] scan-jobs E2E（完了通知まで）成功
- [ ] エラー率・レイテンシ閾値内
