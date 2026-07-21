# 財務ダッシュボード (/ops/finance)

財務担当がMERKENのお金の流れ(売上・変動費・固定費・損益)を1画面で追うためのダッシュボード。
`/ops` 管理ハブからアクセスし、`ADMIN_SECRET` を入力して閲覧する(ログイン不要・シークレット認可)。

## 画面の構成

| セクション | 内容 |
|-----------|------|
| KPIカード | MRR(Stripe実績+App Store推定)、有料会員数(課金/App Store/テスト/解約予約/支払遅延)、当月純売上高・ARPPU、当月営業損益・営業利益率、損益分岐点(必要有料会員数)、当月AI原価と月末ペース予測 |
| 月次推移チャート | 純売上高・総費用(バー)と営業損益(ライン)。ホバー/タップで月別詳細 |
| 月次損益計算書 | 売上高(サブスク/コインパック/返金)→純売上高→変動費(AI原価/決済手数料試算)→限界利益→固定費→営業損益。負値は▲表記 |
| 固定費管理 | 静的費用のCRUD。登録すると損益計算へ即時反映 |
| AI原価内訳 | プロバイダ/モデル別の呼出回数・トークン・推定原価(期間合計) |
| コインパック販売実績 | パック別の販売数・付与コイン・売上 |
| 前提・計算方法 | 集計の前提となる注記 |

## 数値の出所

- **サブスク売上**: Stripe APIの支払済み請求書(`invoices.list status=paid`)をJST月で実績集計。
  Stripeに到達できない場合は当月のみ「課金Pro会員数 × ¥300」の推定値にフォールバックし、
  画面上部に注意メッセージを表示する(過去月は「—」)。
- **コインパック売上**: `coin_transactions`(`type='pack_purchase'`)を月次RPCで集計し、
  `pack_id` → `src/lib/coins/packs.ts` の税込価格で円換算。
- **AI API原価(動的コスト)**: `api_cost_events` に記録済みの推定コスト
  (モデル別トークン単価 × 使用量、`src/lib/api-cost/pricing.ts`)を月次RPCで集計。
  使用量に応じて自動で変動する。
- **決済手数料**: Stripe標準料率3.6%による試算(`STRIPE_FEE_RATE`)。実額はStripeダッシュボード参照。
- **固定費(静的コスト)**: `finance_fixed_costs` テーブル。月額は全額、年額は1/12按分、単発は開始月に全額計上。
  適用期間(開始日〜終了日)で過去月にも反映される。
- **App Store課金**: 金額連携がないため売上には計上せず、会員数とMRR推定のみ表示。

## 固定費の登録ルール

- 費目名・金額(円)・開始日が必須。カテゴリはインフラ/データベース/AI API(固定枠)/SaaS/決済関連/マーケティング/その他。
- 請求サイクル: 月額(そのまま計上)/年額(1/12按分)/単発(開始月のみ)。
- 値上げ・プラン変更は「旧行に終了日を入れて新行を追加」すると過去月の計上額が保たれる。
- 削除すると過去月の表示からも消えるため、通常は終了日の設定を推奨。

## 実装構成(エンジニア向け)

| パス | 役割 |
|------|------|
| `src/app/ops/finance/page.tsx` | ダッシュボードUI(クライアント) |
| `src/app/ops/finance/monthly-pnl-chart.tsx` | 月次推移SVGチャート |
| `src/app/api/ops/finance/route.ts` | 集計API(GET, `months=1..12`) |
| `src/app/api/ops/finance/fixed-costs/route.ts` | 固定費 一覧/登録 |
| `src/app/api/ops/finance/fixed-costs/[id]/route.ts` | 固定費 更新/削除 |
| `src/lib/finance/summary.ts` | 集計本体。純粋関数 `buildFinanceSummary` + データ取得 |
| `src/lib/finance/fixed-costs.ts` | 固定費ドメイン型と月次按分 |
| `src/lib/finance/months.ts` | JST月キーヘルパー |
| `src/lib/stripe/client.ts` | `listPaidInvoicesSince` / `listSucceededRefundsSince`(追記) |
| `supabase/migrations/20260721090000_create_finance_dashboard.sql` | `finance_fixed_costs` + 月次集計RPC 3本 |

- 認可は既存の `requireAdminSecret`(`x-admin-secret` ヘッダ)。`finance_fixed_costs` と集計RPCは
  service_role 専用(RLS/GRANT)で、認可はAPI層で行う。
- 月次集計はDB側RPC(`finance_monthly_ai_costs` / `finance_ai_cost_breakdown` /
  `finance_monthly_coin_pack_sales`)で行い、行数増に耐える(JST月境界は `AT TIME ZONE 'Asia/Tokyo'`)。
- Stripe取得は100件×最大20ページ。決済Webhook(`/api/subscription/webhook`)には一切手を入れていない。
- マイグレーション未適用やStripe未接続でも落ちず、`warnings` 経由で画面に注意を表示して残りを描画する。
- テスト: `src/lib/finance/fixed-costs.test.ts` / `src/lib/finance/summary.test.ts`(`npm test` に登録済み)。
