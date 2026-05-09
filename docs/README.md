# MERKEN Docs

このディレクトリは、MERKENを安全に変更・運用するための入口です。AIにコード作業を依頼する場合も、人間が運用確認をする場合も、まずここから読み始めます。

## 最初に読む順番

### AIがコード作業を始める前

1. このファイル
2. [`maintenance/AI_HANDOFF.md`](maintenance/AI_HANDOFF.md)
3. 触る領域に応じて [`boundaries.md`](boundaries.md) と [`invariants.md`](invariants.md)
4. 運用・障害対応に関わる場合は [`ops/`](ops/) の該当runbook
5. 変更後、進捗が変わったら [`maintenance/TASKS.md`](maintenance/TASKS.md) を更新

### 人間が状況を把握する時

1. [`prelaunch-maintainability-audit.md`](prelaunch-maintainability-audit.md)
2. [`maintenance/ROADMAP.md`](maintenance/ROADMAP.md)
3. [`maintenance/TASKS.md`](maintenance/TASKS.md)
4. 必要に応じて [`architecture.md`](architecture.md)、[`runbooks.md`](runbooks.md)、[`commands.md`](commands.md)

## 情報の種類

### 恒久情報

公開後も残す正式な知識です。実装や運用の前提が変わったら更新します。

| 文書 | 用途 |
|---|---|
| [`architecture.md`](architecture.md) | システム構成、主要データフロー、責務分担 |
| [`boundaries.md`](boundaries.md) | 触ってよい場所、危険領域、変更時の注意 |
| [`invariants.md`](invariants.md) | 壊してはいけないルール |
| [`commands.md`](commands.md) | コマンド一覧と安全性 |
| [`runbooks.md`](runbooks.md) | 主要運用手順の親Runbook |
| [`ops/`](ops/) | 障害対応、Cloud Run、scan、課金系runbook |
| [`security/`](security/) | SQL injection、secrets、dependency policyなど |

### 工事中の一時情報

保守性向上工事の作業状況を共有するためのホワイトボードです。工事完了後は `maintenance/_archive/` に退避し、恒久化すべき知識だけ正式docsへ昇格させます。

| 文書 | 用途 |
|---|---|
| [`maintenance/AI_HANDOFF.md`](maintenance/AI_HANDOFF.md) | AIが毎回読む引き継ぎ |
| [`maintenance/TASKS.md`](maintenance/TASKS.md) | 未完了タスクと優先度 |
| [`maintenance/ROADMAP.md`](maintenance/ROADMAP.md) | 公開前、公開直後、公開後の段階計画 |
| [`maintenance/DECISIONS.md`](maintenance/DECISIONS.md) | 方針判断と理由 |
| [`maintenance/PRELAUNCH_RELEASE_CHECKLIST.md`](maintenance/PRELAUNCH_RELEASE_CHECKLIST.md) | 初版公開前の最終チェック、手動QA、外部サービス確認 |
| [`maintenance/_archive/`](maintenance/_archive/) | 終了した工事ログの退避先 |

### 要確認・古い可能性がある資料

以下は有用な履歴や調査メモですが、実装とズレている可能性があります。作業時は実コードと上位docsで確認してください。

| 文書 | 注意 |
|---|---|
| [`KOMOJU_BILLING_SPEC.md`](KOMOJU_BILLING_SPEC.md) | 現在のWeb課金実装はStripe中心。KOMOJU記述は歴史的資料として扱う |
| [`ops-komoju-incident-2026-02-09.md`](ops-komoju-incident-2026-02-09.md) | 過去のKOMOJU障害メモ |
| [`qa/komoju-payment-test-matrix.md`](qa/komoju-payment-test-matrix.md) | KOMOJU用QA。現行課金確認ではStripe側も必ず確認 |
| [`_discovery_notes.md`](_discovery_notes.md) | 発見メモ。正式仕様ではない |
| [`research.md`](research.md) | 調査メモ |
| [`marketing-plan.md`](marketing-plan.md) | マーケティング資料。実装仕様ではない |
| [`ui_tactics/`](ui_tactics/) | UI検討資料。現在UIと一致するとは限らない |

## 矛盾した時の優先順位

ドキュメント同士、またはドキュメントとコードが矛盾した場合は、この順に確認します。

1. 実コード、設定、DB migration、環境変数
2. この `docs/README.md`
3. 該当領域の正式docsまたはrunbook
4. `maintenance/DECISIONS.md` の最新判断
5. 古い調査メモ、過去incident、マーケティング資料

不一致を見つけたら、その場で無理に全面修正せず、まず [`maintenance/TASKS.md`](maintenance/TASKS.md) に「どこが矛盾しているか」を追加します。作業で確定した恒久知識は、後続で正式docsへ昇格させます。

## 現在の公開前注意点

詳細は [`prelaunch-maintainability-audit.md`](prelaunch-maintainability-audit.md) を参照してください。現時点で特に重要な注意点は以下です。

- `npm run lint` は広範囲のlegacy lintで、公開前Web gateではない
- 公開前Web検証は `npm run verify` / `npm run lint:web` を使う
- 初版公開前の最終確認は [`maintenance/PRELAUNCH_RELEASE_CHECKLIST.md`](maintenance/PRELAUNCH_RELEASE_CHECKLIST.md) を使う
- `npm run security:deps` と `npm run security:all` は成功している
- 現行Web課金はStripe中心。KOMOJU資料は履歴資料として残している
- Sentryは現在未使用。`src/instrumentation.ts` と `src/instrumentation-client.ts` はno-op
- 巨大ファイルの分割は重要だが、公開前は検証基盤と運用文書の整備を優先する
