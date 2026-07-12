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

gateway は provider を呼ぶ前後で Firestore の `GatewayFirestoreGuard` とだけやり取りします（in-memory の limiter は廃止済み）。

- リクエスト開始時 (`checkEligibility`): `ops/aiGatewayGuard.disabled=true` なら全 request を 429 で止める。日次 `calls`/`yen` が cap に達していれば 429。この時点では **call 枠だけ予約し、yen は加算しない**。
- リクエスト完了時 (`commitRequestCost`): provider の実際の usage (input/output/cached/thinking tokens) をモデル価格表 (`cloud-run-scan/src/pricing/pricing.ts`) で円換算し、その額だけ `ops/aiGatewayGuard/daily/<UTC_DATE>.yen` に加算する。固定 3 円/回の見積もりは廃止した。
- 判定とカウント増加はすべて Firestore transaction なので、Cloud Run instance が消えてもリセットされない。
- Firestore 障害時は `GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED=true` により 429 で止める。
- provider 呼び出しが失敗した場合はコストを加算せず、失敗を `recordFailure` でログするだけ（過小評価より安全側に倒すため、失敗時は 0 円加算・別途ログという方針）。
- usage を provider が返さなかった場合は「無料」にはせず、保守的な `flat_fallback` 見積もり（`GATEWAY_FLAT_FALLBACK_USD`）を課金する。

## 動的コスト計算

各リクエスト完了後、`cloud-run-scan/src/pricing/pricing.ts` の価格表と正規化された usage (`cloud-run-scan/src/pricing/usage-normalizer.ts`) から `estimatedCostUsd` / `estimatedCostJpy` を計算します。

| costCalculationMode | 意味 |
|---|---|
| `usage_priced` | input/output tokens 両方が provider から返ってきた場合の正確な計算 |
| `usage_priced_with_fallback_parts` | usage の一部だけが返ってきた場合の保守的な補完計算 |
| `flat_fallback` | usage が全く無い、またはモデルが価格表に無い場合の保守的な固定見積もり |
| `rejected_unpriced_model` | `GATEWAY_BLOCK_UNPRICED_MODELS=true` の時、価格表に無いモデルを実行前にブロックした場合（ログ専用、この場合は実行されない） |

価格表・為替レート・fallback 単価はすべて `cloud-run-scan/src/pricing/pricing.ts` と env 変数の1箇所で管理しています（NFR5: 価格改定時はここだけ更新する）。

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
GATEWAY_COST_DAILY_CAP_YEN=900
GATEWAY_FIRESTORE_GUARD_ENABLED=true
GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED=true
GATEWAY_GUARD_STATE_DOC=ops/aiGatewayGuard
GATEWAY_USD_TO_JPY_RATE=155
GATEWAY_FLAT_FALLBACK_USD=0.05
GATEWAY_USAGE_MISSING_CALLS_DAILY_CAP=0
GATEWAY_BLOCK_UNPRICED_MODELS=false
```

- `GATEWAY_USD_TO_JPY_RATE`: usage 円換算に使う為替レート（固定値、env で運用者が更新する。D1）。
- `GATEWAY_FLAT_FALLBACK_USD`: 価格表に無いモデル（`rejected_unpriced_model` にしない場合）に使う保守的な固定見積もり（USD）。価格表にあるモデルで usage だけが取得できない場合は、この値ではなく「そのモデルの実レート × 保守的な想定トークン数」で計算した `flat_fallback` を使うため、モデルごとに異なる金額になる（FR5: model specific flat fallback）。
- `GATEWAY_USAGE_MISSING_CALLS_DAILY_CAP`: usage 取得失敗（=`flat_fallback`扱い）が1日で一定回数を超えたら 429 で止める追加の安全弁。`0` で無効。
- `GATEWAY_BLOCK_UNPRICED_MODELS`: `true` にすると価格表に無いモデルを実行前に 429 でブロックする。デフォルトは `false`（保守的な固定見積もりで課金し続行）。

`GATEWAY_*` の円は推定値です。実請求そのものではありません。実請求の反映には遅延があるため、完全な「1円単位のハードキャップ」ではなく、provider 呼び出し前に止める実用上の停止装置です。

## 監査ログ

各 `/generate` リクエストの完了時（成功・ブロック・エラーいずれも）、Cloud Run のログに `event: "gateway-audit"` の構造化 JSON を1行出力します。

```json
{
  "event": "gateway-audit",
  "requestId": "...",
  "providerRequested": "gemini",
  "providerUsed": "gemini",
  "modelRequested": "gemini-2.5-flash",
  "modelUsed": "gemini-2.5-flash",
  "feature": "scan_extraction",
  "fallbackHappened": false,
  "usage": { "provider": "gemini", "model": "gemini-2.5-flash", "inputTokens": 1200, "outputTokens": 300, "usageAvailable": true, "usageSource": "provider_response" },
  "cost": { "estimatedCostUsd": 0.00111, "estimatedCostJpy": 1, "pricingVersion": "2026-07-11.1", "pricingMatchedModel": "gemini-2.5-flash", "costCalculationMode": "usage_priced" },
  "guardDecision": "allowed",
  "stopReason": null,
  "dailyTotals": { "calls": 42, "yen": 120, "estimatedCostUsdTotal": 0.8, "usageMissingCalls": 0, "fallbackPricedCalls": 2 }
}
```

Cloud Logging で `jsonPayload.event="gateway-audit"` を絞り込めば、リクエスト単位でどのモデル・どの費用モードで課金されたか、429 ならどの `stopReason` で止まったかがログだけで説明できます（NFR1）。

## 確認コマンド

### gateway health

```bash
curl -sS https://scanvocab-ai-gateway-t3z6gez2ha-an.a.run.app/health | jq
```

期待値:

```json
{
  "status": "ok",
  "gatewayCallsDailyCap": 300,
  "gatewayCostDailyCapYen": 900,
  "gatewayUsageMissingCallsDailyCap": 0,
  "gatewayGuardStore": "firestore",
  "gatewayGuardStateDoc": "ops/aiGatewayGuard",
  "pricingVersion": "2026-07-11.1",
  "usdToJpyRate": 155,
  "flatFallbackUsd": 0.05,
  "blockUnpricedModels": false
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
  | jq '{
      calls: .fields.calls.integerValue,
      yen: .fields.yen.integerValue,
      costDailyCapYen: .fields.costDailyCapYen.integerValue,
      estimatedCostUsdTotal: .fields.estimatedCostUsdTotal.doubleValue,
      usageMissingCalls: .fields.usageMissingCalls.integerValue,
      fallbackPricedCalls: .fields.fallbackPricedCalls.integerValue,
      pricingVersion: .fields.pricingVersion.stringValue,
      lastRequestId: .fields.lastRequestId.stringValue,
      lastModelUsed: .fields.lastModelUsed.stringValue
    }'
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
  "reason": "budget_guard_disabled"
}
```

`reason` (429 応答 + `[gateway-budget-guard-blocked]` ログ) は以下のいずれかです。レスポンスとログの両方から必ず停止理由を特定できます (FR7)。

| reason | 意味 |
|---|---|
| `budget_guard_disabled` | `ops/aiGatewayGuard.disabled=true`（月次 Budget Guard か手動停止） |
| `global_daily_cost_cap_reached` | 日次 `yen` の cap 到達 |
| `usage_missing_fallback_cap_reached` | `GATEWAY_USAGE_MISSING_CALLS_DAILY_CAP` を超えて usage 取得失敗が続いた |
| `unpriced_model_blocked` | `GATEWAY_BLOCK_UNPRICED_MODELS=true` の時、価格表に無いモデルをブロックした |
| `budget_guard_error` | Firestore 障害時に `GATEWAY_FIRESTORE_GUARD_FAIL_CLOSED=true` で fail-closed した |

## 復旧する

復旧前に必ず GCP Billing と `/ops/api-costs` を見て、止めた原因が解消していることを確認します。

in-memory の `DailyGatewayLimiter` は廃止し、停止判定は Firestore guard だけに一本化しました。そのため `disabled=false` に戻せば即座に全 Cloud Run instance へ反映され、instance ごとに残っていた in-memory state による再ブロック（旧課題）は発生しません。

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
