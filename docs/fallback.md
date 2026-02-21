自動フォールバック実装仕様（Gemini → OpenAI）v1

対象：**画像入力の座標抽出（マーカー/強調領域のBBox抽出）**のみ

目的

Gemini側のレート/クォータ/混雑で落ちても、自動でOpenAIへ切替して機能を継続

完全自動でも コスト暴走しない（日次上限）

運用者（あなた）に Slackで必要最小限の通知

非目的

UX表示、キュー設計、非同期処理、モデル選定議論（ここでは扱わない）

クイズ生成（gpt-4o-miniなど）や他機能の運用

1. I/O仕様（両プロバイダ共通）
入力

image_bytes: Buffer（JPEG/PNG等）

feature: "highlight_bbox"（用途識別用）

request_id: string（追跡用）

env: "prod" | "stg"

出力（統一JSON）
[
  { "x1": 12, "y1": 34, "x2": 200, "y2": 80, "type": "highlight", "confidence": 0.72 }
]

x1,y1,x2,y2：画像座標（整数推奨）

type："highlight" 固定でOK

confidence：モデルが返さない場合は省略可（出してもよい）

失敗時（統一）

OpenAI側が失敗しても「フォールバックのフォールバック」はしない（無限ループ防止）

フォールバック上限到達後も OpenAI には流さず、エラー返却

2. 全体フロー（フォールバックのみ）

Breaker状態を確認

OPEN → 直接 OpenAI（ただし上限チェック）

CLOSED / HALF_OPEN → Geminiを試す（失敗時に判定）

Gemini失敗時は エラー種別で分岐

フォールバックする場合は 日次上限（calls/¥） を先にチェック

必要なイベントは Slack通知（スパム防止あり）

3. Rolling Circuit Breaker（フォールバック制御のため）
状態

CLOSED：Gemini使用

OPEN：Geminiを使わず常にOpenAI

HALF_OPEN：復帰テスト（少数だけGemini）

Rolling window

60秒窓（rolling）

breaker判定に含める eligible：

429

502/503

timeout/network（ETIMEDOUT/ECONNRESET等）

除外（breakerに含めない）：

400/404（入力/参照）

401/403（認証/権限/課金設定ミス）

policy/safety

OPEN条件（60秒窓、いずれか）

count(429) >= 10

count(502/503) >= 6

error_rate >= 30% かつ total >= 20

error_rate = eligible_errors / total_requests

OPEN期間・復帰

OPEN期間：5分

5分後 HALF_OPEN へ

HALF_OPEN の probe：3回だけGeminiに試し打ち

3/3 success → CLOSED

1回でも 429 or 502/503 → OPEN(5分)に戻す

timeout/networkの扱い：**1回でも出たらOPENに戻す（堅め）**で固定

例外：QUOTA_EXHAUSTED

QUOTA_EXHAUSTED を検知したら、窓条件を待たずに 即OPEN扱いにしてよい（復活が当日見込めないため）

4. 429ラベル付け（自動分類）※最小ルール確定
ラベル

QUOTA_EXHAUSTED

RATE_LIMIT_BURST

OVERLOADED

UNKNOWN

優先順位

構造化フィールド（存在する場合）を最優先

details.reason == "rateLimitExceeded" → RATE_LIMIT_BURST

メッセージ文字列（小文字化・空白正規化して判定）

どれでもない → UNKNOWN

判定キーワード（最小セット）

QUOTA_EXHAUSTED（強い証拠があるときだけ）

quota exceeded

quota limit exceeded

insufficient quota

plan and billing

billing

daily limit

quota exceeded for metric

generate_content_free_tier_requests

RATE_LIMIT_BURST

rate limit

too many requests

per minute

OVERLOADED

please try again later

resource exhausted（ただし quota 系が同居していたら QUOTA を優先）

UNKNOWN

上記以外の429

振る舞いは OVERLOADED 相当（= リトライ2回→fallback）

5. エラー別のフォールバック判定（確定）
Gemini失敗	条件	Geminiリトライ	フォールバック	Slack reason
429	label=QUOTA_EXHAUSTED	0	即OpenAI	QUOTA_EXHAUSTED
429	label=RATE_LIMIT_BURST	2	リトライ後	RATE_LIMIT_BURST
429	label=OVERLOADED	2	リトライ後	OVERLOADED
429	label=UNKNOWN	2	リトライ後	UNKNOWN
502/503	-	2	リトライ後	UPSTREAM_5XX
timeout/network	-	1	リトライ後	TIMEOUT
400/404	-	0	しない（失敗返却）	（通知なし）
401/403	quota以外	0	しない（失敗返却）	AUTH_OR_PERMISSION（Critical）
policy/safety	-	0	しない（失敗返却）	（通知なし/任意）
6. リトライ（指数バックオフ＋ジッター）※確定

429(BURST/OVERLOADED/UNKNOWN), 502/503：最大2回リトライ

待機：200ms → 500ms → 1200ms のうち必要分

ジッター：各待機に ±30%

timeout/network：最大1回リトライ

待機：300ms（±30%）

QUOTA_EXHAUSTED はリトライ無し。

7. フォールバック上限（コスト暴走防止）※確定

fallback_calls_daily_cap = 1000 / day

fallback_cost_daily_cap = ¥3000 / day

上限到達時の動作

OpenAIへのフォールバックを禁止

以降は Gemini の結果のみ（失敗したら失敗返却）

Slackに Critical通知（FALLBACK_CAP_REACHED） を1回送る

fallback_cost_daily_cap は概算で良い（固定単価×回数、または実測コストの積み上げ）。

8. Slack通知（フォールバック専用）※確定
送るイベント

QUOTA_EXHAUSTED 初回検知：Critical

breakerが OPEN になり OpenAI運転開始：Warning

フォールバック上限到達（calls/cost）：Critical

直近10分 fallback_rate >= 20%：Warning

スパム防止（クールダウン）

QUOTA_EXHAUSTED：24hで1回

breaker OPEN：遷移ごとに1回

cap到達：到達時に1回

fallback_rate：10分に1回

通知に含めるフィールド（共通）

env, feature, request_id

from: gemini, to: openai

reason

breaker_state

fallback_today_calls, fallback_today_yen

window_stats（可能なら：直近60秒の total/429/5xx/error_rate）

sample_error（短文）

9. 参照実装（TypeScript擬似コード）
async function detectBBoxes(image: Buffer, ctx: Ctx): Promise<BBox[]> {
  // 1) breaker open => direct fallback
  if (breaker.state() === "OPEN") {
    return await fallbackOpenAIOrFail(image, ctx, "BREAKER_OPEN");
  }

  // 2) try gemini with retry policy
  const res = await tryGeminiWithPolicy(image, ctx);
  if (res.ok) return res.value;

  // 3) decide fallback based on classified failure
  if (!res.shouldFallback) return fail(res.failType, ctx);

  return await fallbackOpenAIOrFail(image, ctx, res.reason);
}

async function tryGeminiWithPolicy(image: Buffer, ctx: Ctx): Promise<
  | { ok: true; value: BBox[] }
  | { ok: false; shouldFallback: boolean; reason: string; failType: string }
> {
  const attempt = async (): Promise<BBox[]> => geminiCall(image, ctx);

  try {
    return { ok: true, value: await attempt() };
  } catch (e) {
    const c = classifyGeminiError(e); // includes 429 labeler
    breaker.observe(c);              // record into rolling window (eligible only)

    // QUOTA => immediate fallback + critical slack + breaker force open (allowed)
    if (c.kind === "429" && c.label === "QUOTA_EXHAUSTED") {
      slackOncePer24h("QUOTA_EXHAUSTED", ctx, c);
      breaker.forceOpen("QUOTA_EXHAUSTED");
      return { ok: false, shouldFallback: true, reason: "QUOTA_EXHAUSTED", failType: "QUOTA_EXHAUSTED" };
    }

    // AUTH/PERM => no fallback, critical notify
    if (c.kind === "AUTH_OR_PERMISSION") {
      slack("AUTH_OR_PERMISSION", ctx, c, "CRITICAL");
      return { ok: false, shouldFallback: false, reason: "AUTH_OR_PERMISSION", failType: "AUTH_OR_PERMISSION" };
    }

    // Non-retriable => no fallback
    if (c.kind === "INVALID_INPUT" || c.kind === "POLICY_BLOCK") {
      return { ok: false, shouldFallback: false, reason: c.kind, failType: c.kind };
    }

    // Retriable groups => retry then fallback
    const { maxRetries, backoffsMs } = retryPlan(c);
    for (let i = 0; i < maxRetries; i++) {
      await sleep(withJitter(backoffsMs[i], 0.3));
      try {
        return { ok: true, value: await attempt() };
      } catch (e2) {
        const c2 = classifyGeminiError(e2);
        breaker.observe(c2);
        // if quota appears mid-retry
        if (c2.kind === "429" && c2.label === "QUOTA_EXHAUSTED") {
          slackOncePer24h("QUOTA_EXHAUSTED", ctx, c2);
          breaker.forceOpen("QUOTA_EXHAUSTED");
          return { ok: false, shouldFallback: true, reason: "QUOTA_EXHAUSTED", failType: "QUOTA_EXHAUSTED" };
        }
      }
    }
    return { ok: false, shouldFallback: true, reason: c.reasonForSlack, failType: c.kind };
  }
}

async function fallbackOpenAIOrFail(image: Buffer, ctx: Ctx, reason: string): Promise<BBox[]> {
  if (fallbackCapReached()) {
    slackOnce("FALLBACK_CAP_REACHED", ctx, { reason }, "CRITICAL");
    throw new Error("Fallback disabled: cap reached");
  }
  incrementFallbackCounters(reason);

  try {
    return await openaiCall(image, ctx);
  } catch {
    // no fallback-of-fallback
    throw new Error("OpenAI fallback failed");
  }
}
10. テスト観点（最低限）

429メッセージ別にラベルが期待通り（特にQUOTA誤判定しない）

QUOTA_EXHAUSTEDで「即fallback」「Critical通知」「breaker force open」

429 BURST/OVERLOADEDで「リトライ2回→fallback」

breaker rolling集計が条件通りにOPEN/CLOSED遷移

cap到達後に「OpenAIへ流れない」「Critical通知」

OpenAI失敗時に無限ループしない

このドキュメントをそのままエンジニアに渡せば、実装の分岐・しきい値・通知内容・上限まで全部確定している状態で動きます。必要なら、次の返信で「Slackの実メッセージJSON（Block Kit）テンプレ」も作れます（フォールバック通知だけ）。