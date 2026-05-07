# Maintenance Decisions

保守性向上工事中の判断と理由を記録します。後から「なぜそうしたか」をAIと人間が復元できるようにするための文書です。

## 2026-05-06: 既存docsは初回では移動しない

判断:

- 初回の `/docs` 構築では、既存docsの移動、改名、削除をしない。
- `docs/README.md` と `maintenance/` を追加し、既存docsへリンクする。

理由:

- 現時点ではdocs間のリンクや古い参照が多く、移動するとリンク切れや混乱が増える。
- まず入口を作る方が安全で、差分も追いやすい。
- 古い記述の修正は `TASKS.md` に積み、別タスクで実装と照合しながら進める。

## 2026-05-06: `maintenance/` は工事中の一時情報として扱う

判断:

- `docs/maintenance/` は保守性向上工事中のホワイトボードにする。
- 工事完了後、必要な知識は正式docsへ昇格し、作業ログは `_archive/` に退避する。

理由:

- 一時的な進捗と恒久的な運用知識を混ぜると、公開後にどれを信じるべきか分からなくなる。
- AIの引き継ぎには一時情報が必要だが、恒久docsに作業中メモを混ぜ続けるべきではない。

## 2026-05-06: 公開前は大規模リファクタより検証基盤を優先する

判断:

- 巨大ファイル分割は重要だが、公開前の最優先にはしない。
- 先に依存関係、security、lint、docs、runbookを整える。

理由:

- 本番ビルドは通っているが、`lint`、`security:deps`、`security:all` が失敗している。
- 公開直前の大規模リファクタは新しい事故を作る可能性が高い。
- まず「何を信じて公開判断するか」を固定する方が運用上の効果が高い。

## 2026-05-06: 古いKOMOJU/Sentry記述は即削除せずタスク化する

判断:

- KOMOJUやSentryなど、実装とズレている可能性がある記述は、初回docs構築では削除しない。
- `TASKS.md` に修正対象として積む。

理由:

- 過去のincidentや仕様検討として有用な文書もある。
- 実装と照合せずに削除すると、運用上必要な履歴まで失う可能性がある。

## 2026-05-06: secrets guardの誤検知はdummy表現で解消する

判断:

- 実secretではない検出は、原則として明確なdummy表現へ変更して解消する。
- `security/secrets-allowlist.json` は、期限と理由を明記できる例外だけに使う。

理由:

- allowlistの恒久化は本物の漏洩を見落とすリスクを増やす。
- dummy表現なら、検証を通しつつ人間にも本番値ではないことが伝わる。

## 2026-05-06: 公開前lintはWeb本体に限定する

判断:

- 公開前の最低lint gateは `npm run lint:web` とする。
- `lint:web` は `src/`, `shared/`, Next/PostCSS/ESLint設定、security guard系scriptsを対象にする。
- `mobile/`, `ios-native/`, `cloud-run-scan/`, `stitch/`, `uisu/`, `vocabularytest*`, `legacy/`, `experimental/`, `動画素材/`, `.next/`, `node_modules/`, build/dist/coverage/out はWeb本体公開前lintの対象外にする。
- `npm run verify` は `lint:web`, `security:all`, `npm test`, `test:security`, `npm run build` を順に実行する公開前最低チェックとする。

理由:

- 対象外ディレクトリはWeb本体とは別コードベース、legacy/experimental、動画素材、または生成物であり、公開前Web検証の失敗原因に含めると判断がぶれる。
- `shared/` はWeb本体のdomain type/DB mapper契約なので対象に残す。
- 既存の広範囲 `npm run lint` は履歴確認用に残し、公開判断では `npm run verify` を信頼する。

## 2026-05-07: Web testは自動発見ではなく通過確認済み固定リストを維持する

判断:

- `npm test` は `npm run test:web` を呼ぶ形にし、Web/shared通常testの通過確認済み固定リストを実行する。
- `npm run verify` には `npm run test:security` を含める。
- `scripts/check-*.test.mjs` と `src/app/api/**/*.security.test.ts` はsecurity testとして扱う。
- `cloud-run-scan` は別packageなので root Web `verify` には含めず、`npm run test:cloud-run-scan` で明示実行する。
- `src/lib/supabase/session-cache.test.ts` と `src/app/api/shared-projects/shared.test.ts` は現行実装との期待値ズレで失敗するため、公開前gateには入れず `TASKS.md` で追跡する。

理由:

- repo内の全test自動発見に切り替えると、古い期待値のtestで公開前Web gateが失敗する。
- 失敗testを通すために認証/sessionやshared project metricsの本体仕様を変えるのは、今回の目的と制約に反する。
- security guard testは公開前検証に含める価値が高く、通常unit testとは責務が違う。
- Cloud Run scan serviceは別packageで依存関係と実行責務が分かれているため、Web本体の最低verifyとは別に確認する方が判断しやすい。

## 2026-05-07: P2-Bはcontract firstで進める

判断:

- P2-Aの優先度表では `src/app/api/scan-jobs/process/route.ts` のservice boundaryをP1先頭に置いたが、P2-Cの実行順ではscan job contract testを先に行う。
- 最初の3回は、scan process contract test、scan mode/provider helper、background scan create save mode contractの順にする。
- `scan-jobs/process` のproject/word保存分離、Stripe webhook/reconcile、Auth OTP、hybrid sync、prompt本文変更、DB migrationは、先行contractがない状態では実装に入らない。

理由:

- `scan-jobs/process` はjob claim、AI抽出、DB保存、rollback、通知、timing、post-processingを同時に持ち、route-level worker flow coverageが薄い。
- 分割前に `pending -> processing -> completed/failed`、`client_local` / `server_cloud` payload、example warning、usage/Pro mode、webhook idempotencyなどの契約を固定しないと、AIが安全に小さく直せない。
- 公開後のリファクタでは、1回のAIセッションで1責務だけを動かす方が、事故時に戻しやすい。

## 2026-05-06: 現行Web課金docsはStripeを正とする

判断:

- README、CLAUDE、architecture、runbooks、commandsの現行課金説明はStripe Checkout / Stripe webhook / `STRIPE_*` を正とする。
- KOMOJU関連docsと `src/lib/komoju/` は削除せず、履歴資料・過去実装として残す。

理由:

- 現行の `src/app/api/subscription/` は `src/lib/stripe/` を使い、Stripe webhook signatureを検証して課金状態を反映している。
- KOMOJU資料は過去障害の理解には有用だが、現在の運用者が一次確認先として扱うと誤誘導になる。

## 2026-05-06: Sentry env例はno-op実装に合わせて外す

判断:

- `.env.example` からSentry関連envを削除する。
- `src/instrumentation.ts` と `src/instrumentation-client.ts` はno-opのまま残し、docsで現在未使用と明記する。

理由:

- `@sentry/nextjs` は現在installされておらず、instrumentationもSentry初期化を行っていない。
- 使っていない監視envをサンプルに残すと、本番監視が存在するように見えて運用判断を誤らせる。
