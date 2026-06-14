# GCP Budget Guard Runbook

MERKEN の GCP 高額請求防止で、AI gateway を実際に止める仕組みの運用手順です。

## 仕組み

```text
Cloud Billing Budget
  -> Pub/Sub topic: merken-budget-guard
  -> Cloud Run functions: merken-budget-guard
  -> Firestore doc: ops/aiGatewayGuard
  -> Cloud Run gateway: scanvocab-ai-gateway
  -> Gemini / OpenAI provider call
```

gateway は provider を呼ぶ前に Firestore を transaction で確認します。

- `ops/aiGatewayGuard.disabled=true` なら全 request を 429 で止める。
- `ops/aiGatewayGuard/daily/<UTC_DATE>` の `calls` / `yen` が日次 cap に達したら 429 で止める。
- cap 判定とカウント増加は Firestore transaction なので、Cloud Run instance が消えてもリセットされない。
- Firestore 障害時は `GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED=true` により 429 で止める。

## 本番リソース

| 種別 | 値 |
|---|---|
| Project | `project-32967881-3a93-46c4-8b5` |
| Project number | `441368426215` |
| Region | `asia-northeast1` |
| Budget | `MERKEN production monthly guardrail` |
| Budget amount | 5,000 JPY / month |
| Pub/Sub topic | `projects/project-32967881-3a93-46c4-8b5/topics/merken-budget-guard` |
| Budget publisher | `billing-budget-alert@system.gserviceaccount.com` |
| Function | `merken-budget-guard` |
| Function service account | `budget-guard-runtime@project-32967881-3a93-46c4-8b5.iam.gserviceaccount.com` |
| Firestore DB | `(default)`, `asia-northeast1` |
| Guard doc | `ops/aiGatewayGuard` |
| Daily counter | `ops/aiGatewayGuard/daily/<UTC_DATE>` |
| Gateway service | `scanvocab-ai-gateway` |

## 停止条件

Budget guard function は以下のどれかを満たすと `ops/aiGatewayGuard.disabled=true` にします。

- `costAmount / budgetAmount >= 0.9`
- `alertThresholdExceeded >= 0.9`
- `forecastThresholdExceeded >= 0.9`

現在の Budget は 5,000 円/月なので、実支出または予測が 4,500 円相当に達した時点で AI gateway を止めます。

## gateway 側 cap

```bash
GATEWAY_CALLS_DAILY_CAP=300
GATEWAY_COST_DAILY_CAP_YEN=900
GATEWAY_ESTIMATED_YEN_PER_CALL=3
GATEWAY_FIRESTORE_GUARD_ENABLED=true
GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED=true
GATEWAY_GUARD_STATE_DOC=ops/aiGatewayGuard
```

`GATEWAY_*` の円は推定値です。実請求そのものではありません。実請求の反映には遅延があるため、完全な「1円単位のハードキャップ」ではなく、provider 呼び出し前に止める実用上の停止装置です。

## 確認コマンド

### gateway health

```bash
curl -sS https://scanvocab-ai-gateway-t3z6gez2ha-an.a.run.app/health | jq
```

期待値:

```json
{
  "status": "ok",
  "gatewayGuardStore": "firestore",
  "gatewayGuardStateDoc": "ops/aiGatewayGuard"
}
```

### Firestore guard state

```bash
PROJECT_ID=project-32967881-3a93-46c4-8b5
TOKEN=$(gcloud auth print-access-token)

curl -sS \
  -H "Authorization: Bearer ${TOKEN}" \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/ops/aiGatewayGuard" \
  | jq '{disabled: .fields.disabled.booleanValue, disabledReason: .fields.disabledReason, lastBudgetNotification: .fields.lastBudgetNotification.mapValue.fields}'
```

### 今日の共通カウンタ

```bash
PROJECT_ID=project-32967881-3a93-46c4-8b5
DAY=$(date -u +%Y-%m-%d)
TOKEN=$(gcloud auth print-access-token)

curl -sS \
  -H "Authorization: Bearer ${TOKEN}" \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/ops/aiGatewayGuard/daily/${DAY}" \
  | jq '{calls: .fields.calls.integerValue, yen: .fields.yen.integerValue, callsDailyCap: .fields.callsDailyCap.integerValue, costDailyCapYen: .fields.costDailyCapYen.integerValue}'
```

## 手動でAI gatewayを止める

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

止まっている時の gateway response:

```json
{
  "success": false,
  "error": "Gateway budget guard blocked this request",
  "reason": "budget-guard-disabled"
}
```

## 復旧する

復旧前に必ず GCP Billing と `/ops/api-costs` を見て、止めた原因が解消していることを確認します。

```bash
PROJECT_ID=project-32967881-3a93-46c4-8b5
TOKEN=$(gcloud auth print-access-token)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl -sS -X PATCH \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/ops/aiGatewayGuard?updateMask.fieldPaths=disabled&updateMask.fieldPaths=disabledReason&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=updatedBy" \
  -d "{\"fields\":{\"disabled\":{\"booleanValue\":false},\"disabledReason\":{\"nullValue\":null},\"updatedAt\":{\"timestampValue\":\"${NOW}\"},\"updatedBy\":{\"stringValue\":\"manual-reset\"}}}"
```

## Budget notification smoke test

停止しない通知:

```bash
gcloud pubsub topics publish merken-budget-guard \
  --project=project-32967881-3a93-46c4-8b5 \
  --message='{"budgetDisplayName":"MERKEN production monthly guardrail smoke","costAmount":1000,"budgetAmount":5000,"currencyCode":"JPY","costIntervalStart":"2026-06-01T00:00:00Z","alertThresholdExceeded":0.25,"forecastThresholdExceeded":0}'
```

停止する通知:

```bash
gcloud pubsub topics publish merken-budget-guard \
  --project=project-32967881-3a93-46c4-8b5 \
  --message='{"budgetDisplayName":"MERKEN production monthly guardrail smoke-stop","costAmount":4500,"budgetAmount":5000,"currencyCode":"JPY","costIntervalStart":"2026-06-01T00:00:00Z","alertThresholdExceeded":0.75,"forecastThresholdExceeded":0.9}'
```

停止する通知を送った場合は、検証後すぐに「復旧する」の手順で `disabled=false` に戻します。

## 公式ドキュメント

- Cloud Billing budgets: https://docs.cloud.google.com/billing/docs/how-to/budgets
- Programmatic budget notifications: https://docs.cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications
- Control resource usage with budget notifications: https://docs.cloud.google.com/billing/docs/how-to/control-usage
- Disable billing with notifications: https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications
- Firestore transactions: https://docs.cloud.google.com/firestore/docs/manage-data/transactions
- Cloud Run functions Pub/Sub triggers: https://docs.cloud.google.com/functions/docs/calling/pubsub
