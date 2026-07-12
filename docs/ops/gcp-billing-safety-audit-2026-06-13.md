# GCP Billing Safety Audit 2026-06-13

MERKEN v1.0 の一般公開に向けて、Google Cloud 高額請求リスクを公式ドキュメントと本番設定で照合した記録です。

## 結論

2026-06-14 時点の `merken.jp` 本番運用では、GCP 高額請求を防ぐための実停止ガードが入っています。

- Cloud Run scan gateway は `max instances=3`, `min instances=0`, `concurrency=10`, `timeout=300s`, `cpu=1`, `memory=1Gi`, request-based CPU throttling。
- Cloud Run の `AUTH_TOKEN` と `OPENAI_API_KEY` は Secret Manager 参照。
- Cloud Run fallback は `gpt-4o-mini`、日次 fallback cap は 100 calls / 300 円。
- Cloud Run gateway 全体の日次 cap は 300 calls / 900 円。Firestore transaction の共通カウンタで全 instance 横断に判定し、cap 到達時は provider 呼び出し前に 429。
- Google Cloud Billing budget は本番 project に絞って月 5,000 円。25%, 50%, 75%, 100% current spend と 90% forecasted spend で通知。
- Budget Pub/Sub notification は `merken-budget-guard` function に接続済み。実支出または予測が 90% に達したら Firestore の `ops/aiGatewayGuard.disabled=true` を立て、AI gateway 全体を provider 呼び出し前に 429 で止める。
- Web 側 AI route は認証必須化済み。scan は server-side scan limit、例文/翻訳/ディクテーションは feature usage daily limit。

この状態なら、初回の無料一般公開は「ユーザーを増やし始めてよい」状態です。ただし、GCP Budget 自体は停止装置ではなく通知装置です。MERKEN では Budget 通知を受けた自前の Cloud Run function と Firestore guard で gateway を停止します。月 5,000 円 budget に近づいたら、gateway cap を上げる前に実請求と `/ops/api-costs` を比較してください。

## 参照した公式ドキュメント

- Cloud Billing budgets: https://docs.cloud.google.com/billing/docs/how-to/budgets
- Cloud Billing programmatic budget notifications: https://docs.cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications
- Disable billing with notifications: https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications
- Control resource usage with notifications: https://docs.cloud.google.com/billing/docs/how-to/control-usage
- Cloud Run billing settings: https://docs.cloud.google.com/run/docs/configuring/billing-settings
- Cloud Run maximum instances: https://docs.cloud.google.com/run/docs/configuring/max-instances
- Cloud Run minimum instances: https://docs.cloud.google.com/run/docs/configuring/min-instances
- Cloud Run concurrency guidance: https://docs.cloud.google.com/run/docs/tips/general
- Cloud Quotas view/manage: https://docs.cloud.google.com/docs/quotas/view-manage
- Cloud Quotas overview: https://docs.cloud.google.com/docs/quotas
- Firestore transactions: https://docs.cloud.google.com/firestore/docs/manage-data/transactions
- Cloud Run functions Pub/Sub triggers: https://docs.cloud.google.com/functions/docs/calling/pubsub
- Gemini / Vertex AI quotas and system limits: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/quotas

## 公式 docs から採用した判断基準

1. Budget は必須。ただし停止装置ではない。
   - Google Cloud の budget は支出を追跡し、threshold 到達で通知するための仕組み。
   - programmatic notification や billing disable は作れるが、課金反映には遅延があるため、予算超過を完全には防げない。
   - したがって MERKEN では budget alert に加えて、Budget Pub/Sub notification で Firestore 停止フラグを立て、Cloud Run gateway 側で provider 呼び出し前に止める。

2. Cloud Run は最大インスタンスを明示する。
   - Cloud Run の max instances は cost control と backend connection 保護に使える。
   - デフォルトの revision maximum は大きすぎるため、MERKEN scan gateway は service / revision ともに 3 に固定する。

3. min instances は 0 にする。
   - minimum instances は idle でも課金される。
   - MERKEN scan gateway は常時 warm である必要がないため、v1.0 は `min instances=0`。

4. concurrency は低めに固定する。
   - Cloud Run は 1 instance で複数 request を同時処理でき、デフォルト 80。
   - AI gateway では 80 concurrent がそのまま provider 同時呼び出しになりうるため、v1.0 は 10。

5. quota は監視と調整対象。
   - Google Cloud quota は project 単位で確認・調整する。
   - ただし quota は金額 cap ではない。RPM / TPM / regional quota を下げる場合も、ユーザー体験への影響を確認してから行う。

## 本番で確認・変更した内容

### Billing

- Project: `project-32967881-3a93-46c4-8b5`
- Project number: `441368426215`
- Billing account currency: JPY
- Billing enabled: true
- Budget: `MERKEN production monthly guardrail`
- Budget scope: `projects/441368426215`
- Budget amount: 5,000 JPY / month
- Thresholds: 25%, 50%, 75%, 100% current spend、90% forecasted spend
- Pub/Sub topic: `projects/project-32967881-3a93-46c4-8b5/topics/merken-budget-guard`
- Pub/Sub publisher: `billing-budget-alert@system.gserviceaccount.com`
- Function: `merken-budget-guard`
- Function service account: `budget-guard-runtime@project-32967881-3a93-46c4-8b5.iam.gserviceaccount.com`
- Budget guard threshold: actual 90% / forecast 90%

### Firestore budget guard

- Database: `(default)` in `asia-northeast1`
- Guard doc: `ops/aiGatewayGuard`
- Daily counter docs: `ops/aiGatewayGuard/daily/<UTC_DATE>`
- Current state after smoke: `disabled=false`
- Verification:
  - Low budget notification wrote `lastBudgetNotification` without stopping gateway.
  - Stop budget notification set `disabled=true`.
  - While stopped, authenticated `/generate` returned 429 before provider call.
  - Manual reset set `disabled=false`.
  - After reset, authenticated Gemini smoke succeeded.

### Cloud Run

- Service: `scanvocab-ai-gateway`
- Region: `asia-northeast1`
- `max instances`: 3
- `min instances`: 0
- `concurrency`: 10
- `timeout`: 300 seconds
- `cpu`: 1
- `memory`: 1Gi
- `AUTH_TOKEN`: Secret Manager `scan-gateway-auth-token:latest`
- `OPENAI_API_KEY`: Secret Manager `scan-openai-api-key:latest`
- `FALLBACK_SLACK_WEBHOOK_URL`: Secret Manager `scan-fallback-slack-webhook-url:latest`
- `/health`: `fallbackModel=gpt-4o-mini`, `breakerOpenMs=300000`
- `/health`: `gatewayGuardStore=firestore`, `gatewayGuardStateDoc=ops/aiGatewayGuard`
- Unauthenticated `/generate`: 401
- Active revision after update: `scanvocab-ai-gateway-00020-7p5`

### Cloud Run env caps

```bash
FALLBACK_OPENAI_MODEL=gpt-4o-mini
FALLBACK_CALLS_DAILY_CAP=100
FALLBACK_COST_DAILY_CAP_YEN=300
FALLBACK_ESTIMATED_YEN_PER_CALL=3
FALLBACK_BREAKER_OPEN_MS=300000
GATEWAY_CALLS_DAILY_CAP=300
GATEWAY_COST_DAILY_CAP_YEN=900
GATEWAY_FIRESTORE_GUARD_ENABLED=true
GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED=true
GATEWAY_GUARD_STATE_DOC=ops/aiGatewayGuard
GATEWAY_USD_TO_JPY_RATE=155
GATEWAY_FLAT_FALLBACK_USD=0.05
```

`FALLBACK_*` は Gemini 障害時の OpenAI fallback だけを止めます。`GATEWAY_*` は Gemini / OpenAI を問わず Cloud Run gateway 全体を provider 呼び出し前に止めます。Firestore guard が有効な本番では、日次 cap は全 Cloud Run instance 共通で判定されます。

## 防御レイヤー

| Layer | 防ぐもの | 現在の状態 |
|---|---|---|
| Web auth | 未ログイン bot による AI route 連打 | `REQUIRE_AUTH_* = true` |
| Web usage limits | 認証済みユーザーごとの例文/翻訳/採点連打 | `ENABLE_AI_USAGE_LIMITS=true` |
| Scan DB limit | ユーザーごとの scan 連打 | `check_and_increment_scan` |
| Cloud Run auth | Cloud Run URL 直接攻撃 | Bearer token 必須、未認証 401 |
| Cloud Run scale | 瞬間的な provider 呼び出し爆発 | max 3 instances、concurrency 10 |
| Gateway Firestore guard | Cloud Run instance 再起動・複数 instance をまたぐ日次暴走 | Firestore transaction、300 calls / 900 円（usage ベースの動的見積もり） |
| Budget auto stop | 月次 GCP spend / forecast の高騰 | 5,000 円 budget の90%で Firestore disabled |
| Fallback cap | Gemini 障害時の OpenAI fallback 暴走 | 100 calls / 300 円 estimate |
| Billing budget | GCP 月次支出の早期検知 | 5,000 円 budget |
| `/ops/api-costs` | アプリ内推定コストの可視化 | `api_cost_events` 集計 |

## 残るリスク

1. Budget 自体は停止装置ではない。
   - 通知には遅延があり、budget 到達後も追加費用が発生しうる。
   - MERKEN は Budget 通知を受けた function が Firestore stop flag を立てることで gateway を止める。
   - Cloud Billing API で billing disable する方式もあるが、project の全サービス停止を伴うため通常運用では使わない。

2. 日次 cap は推定額ベース。
   - リクエスト完了ごとに provider の実際の usage (tokens) を `cloud-run-scan/src/pricing/pricing.ts` の価格表で円換算した動的見積もりであり、実請求と完全一致しない。
   - usage が取得できない場合も無料扱いにはせず、保守的な `GATEWAY_FLAT_FALLBACK_USD` 見積もりを課金する。
   - ただし Firestore transaction により、Cloud Run instance 再起動や scale-to-zero ではリセットされない。

3. Google Cloud quota は金額 cap ではない。
   - quota を下げると provider 呼び出しは抑えられるが、直接的な円建て上限ではない。
   - 利用増加で `RESOURCE_EXHAUSTED` が出た場合は、quota を上げる前に `/ops/api-costs` と Billing report を確認する。

4. アプリ内推定コストと実請求は一致しない。
   - `api_cost_events` は運用判断用の推定値。
   - Google Cloud Billing / OpenAI Billing と週次で差分確認する。

## 運用ルール

### 毎日見る

- `/ops/api-costs`: 前日比 2 倍以上、unpriced calls、failed calls。
- Cloud Run Logs: `gateway-cap-reached`, `FALLBACK_CAP_REACHED`, `FALLBACK_RATE_HIGH`, `QUOTA_EXHAUSTED`。
- Firestore `ops/aiGatewayGuard`: `disabled`, `lastBudgetNotification`, `daily/<UTC_DATE>`。
- Google Cloud Billing budget alert メール。
- Cloud Run metrics: request count, 4xx/5xx, instance count。

### cap 到達時

1. `gateway-cap-reached` なら、まず abuse か自然増かを切り分ける。
2. 自然増なら、`/ops/api-costs` と Google Cloud Billing を見て実コストを確認する。
3. 問題なければ `GATEWAY_CALLS_DAILY_CAP` と `GATEWAY_COST_DAILY_CAP_YEN` を段階的に上げる。
4. abuse なら cap を上げない。対象 route / user / IP / auth 状態を調査する。

### 緊急停止

Firestore guard で AI gateway を止める場合:

```bash
PROJECT_ID=project-32967881-3a93-46c4-8b5
TOKEN=$(gcloud auth print-access-token)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl -sS -X PATCH \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/ops/aiGatewayGuard?updateMask.fieldPaths=disabled&updateMask.fieldPaths=disabledReason&updateMask.fieldPaths=disabledAt&updateMask.fieldPaths=disabledBy" \
  -d "{\"fields\":{\"disabled\":{\"booleanValue\":true},\"disabledReason\":{\"stringValue\":\"manual emergency stop\"},\"disabledAt\":{\"timestampValue\":\"${NOW}\"},\"disabledBy\":{\"stringValue\":\"manual\"}}}"
```

fallback だけ止めたい場合:

```bash
gcloud run services update scanvocab-ai-gateway \
  --region asia-northeast1 \
  --update-env-vars FALLBACK_CALLS_DAILY_CAP=0,FALLBACK_COST_DAILY_CAP_YEN=0
```

アプリ側で Cloud Run 経路を迂回する場合は、Vercel の `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` を外します。ただし直接 provider key 経路に戻るため、実行前に `GOOGLE_AI_API_KEY` / `OPENAI_API_KEY` と usage limits を確認してください。

詳細な停止・復旧・smoke test は [`gcp-budget-guard-runbook.md`](gcp-budget-guard-runbook.md) を正とします。
