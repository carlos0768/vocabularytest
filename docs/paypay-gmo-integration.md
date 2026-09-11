# PayPay 継続課金 (GMO PG) 連携

Pro月額(¥300)を PayPay で継続課金するための連携メモ。Stripe の PayPay は
**単発決済専用**で月額課金に使えないため、Proの月額だけ GMO PG を通す。
コインパック(単発)は引き続き Stripe のまま — こちらはダッシュボードで
PayPay を有効化するだけで動く。

## 状態

| Phase | 内容 | 状態 |
|-------|------|------|
| 1 | `pro_source='paypay'` の土台（DB・status判定・解約/削除ガード） | 完了 |
| 2a | GMO トランスポート・応答解析・通知の信頼モデル・通知ルート骨格 | 完了 |
| 2b | 仕様書に依存する定数の確定と、契約作成／解約／再照会の実装 | **仕様書待ち** |
| 2c | `/subscription` の決済手段選択UI、特商法表記の更新 | 未着手 |

`PAYPAY_SUBSCRIPTION_ENABLED=false` の間、通知ルートは 404 を返し、
UIにも導線は出ない。Phase 2b が終わるまでフラグは立てない。

## 通知の信頼モデル（最重要）

GMO の結果通知には**署名がない**。Stripe の HMAC (INV-05) や App Store の JWS に
相当するものが存在しないため、**通知本文の決済状態を信用してはいけない**。
本文に `OrderID` と `Status` を書いて投げるだけで Pro を有効化できてしまう。

`src/app/api/subscription/paypay/notifications/route.ts` は次の順で処理する:

1. フラグ・ゲートウェイ設定の確認（未設定なら 404）
2. **送信元IPの照合**（`notification-trust.ts`。許可リスト未設定なら全拒否）
3. `claim_webhook_event` による冪等化
4. **GMOへの再照会**（本命の防御。通知は「見に行くきっかけ」に過ぎない）
5. 照会で確定した状態だけを `subscriptions` に反映

4 が未実装の間は `fetchAuthoritativeState` が必ず throw するので、
偽通知で 5 に到達することはない（fail-closed）。

IPだけに頼らないのは、IPが詐称されうることと、プロキシ構成次第で
ヘッダ由来のIPが信用できないため。IP照合は再照会APIへの増幅攻撃を防ぐ入口フィルタと位置づける。

### 送信元IPの取得

`x-real-ip` を優先し、無ければ `x-forwarded-for` の**末尾**を使う。
先頭はクライアントが自由に書けるため、`X-Forwarded-For: <GMOのIP>` を
付けるだけで素通りしてしまう。

> **初回疎通時の必須確認**: GMOのテスト通知を1本実際に流し、どのヘッダに
> 何が入るかをログで確認すること。プロキシ構成が想定と違うとここが常に
> 拒否側に倒れる（安全側なので気付けるが、原因はここ）。

## Phase 2b で埋める仕様（`src/lib/paypay/gmo/spec.ts` に集約）

仕様書に依存する定数は**すべて `spec.ts` 1ファイルに閉じてある**。
受領したらここだけ埋めれば他のモジュールは変更不要。

| 定数 | 内容 |
|------|------|
| `GMO_STATUS_TO_NOTIFICATION_TYPE` | 結果通知の `Status` → 内部イベント種別。**決済手段ごとに語彙が違うので、カード決済の値を流用しないこと** |
| `GMO_RECURRING_SEARCH_API` | 再照会に使う取引照会APIの名前。これが無いと通知を信用できない |
| `GMO_RECURRING_REGISTER_API` | 契約作成API |
| `GMO_RECURRING_CANCEL_API` | 解約API |
| `GMO_NOTIFICATION_FIELDS.recurringId` | 継続課金契約IDの項目名（`RecurringID` / `RegistrationNo` などサービスにより異なる） |

`GMO_STATUS_TO_NOTIFICATION_TYPE` が空でも通知ルートは動く（未知Statusとして
無視し警告ログを出す）ので、疎通テストで実際に飛んできた値をログから拾って
埋めるのが確実。

### GMO に確認が必要な事項

1. **PayPay の継続課金に対応しているか**（都度課金対応とは別物。契約プラン次第）
2. 解約は**即時解約 / 期間末解約**のどちらが可能か
   - 期間末が取れない場合、`/api/subscription/cancel` の文言とUXが変わる
3. 次回課金日が通知/APIで返るか、こちらで計算する必要があるか
4. 結果通知のリトライ仕様（回数・間隔・何を返せば停止するか）
5. 結果通知の送信元IPレンジ（`GMO_NOTIFICATION_IP_ALLOWLIST` に入れる）
6. 返金API
7. 契約作成フローがリダイレクト型かトークン型か

## API の呼び出し規約（実装済み）

- エンドポイント: `https://{host}/payment/{Api}.idPass`
- 要求・応答ともに `application/x-www-form-urlencoded`
- **業務エラーも HTTP 200 で返る**。成否は本文の `ErrCode`/`ErrInfo` の有無だけで判定する
  （`parseGmoResponse`）。「HTTP 200 = 成功」と書くと課金失敗を成功扱いする
- 複数エラーはパイプ区切りで位置対応: `ErrCode=E01|E01&ErrInfo=E01010001|E01020010`
- 通信失敗は `GmoTransportError`、業務エラーは `GmoApiError` と型を分ける。
  タイムアウトは「失敗」ではなく「結果不明」で、取引が成立している可能性があるため
  課金失敗として確定させてはいけない

## 関連ファイル

| パス | 役割 |
|------|------|
| `src/lib/paypay/config.ts` | フラグ・ゲートウェイ選択 |
| `src/lib/paypay/gmo/config.ts` | 資格情報・エンドポイント・IP許可リスト |
| `src/lib/paypay/gmo/response.ts` | 応答解析・エラー判定 |
| `src/lib/paypay/gmo/client.ts` | HTTPトランスポート |
| `src/lib/paypay/gmo/notification-trust.ts` | 送信元IP照合 |
| `src/lib/paypay/gmo/spec.ts` | **仕様依存の定数（ここだけ埋める）** |
| `src/lib/subscription/paypay-activation.ts` | 状態遷移（ゲートウェイ非依存） |
| `src/app/api/subscription/paypay/notifications/route.ts` | 結果通知の受け口 |
| `supabase/migrations/20260826120000_add_paypay_subscription_foundation.sql` | DB土台 |
