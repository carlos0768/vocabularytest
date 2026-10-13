# Maintenance Roadmap

公開前から公開後にかけて、保守性向上工事を安全に進めるための段階計画です。

## Phase 0: docs入口の構築

目的:

- AIと人間が最初に読む入口を作る
- 恒久情報と工事中の一時情報を分ける
- 以後の作業状況を `maintenance/` に残せる状態にする

完了条件:

- `docs/README.md` がある
- `docs/maintenance/AI_HANDOFF.md`, `TASKS.md`, `ROADMAP.md`, `DECISIONS.md` がある
- `docs/ops/README.md` と `docs/security/README.md` がある

## Phase 1: 公開前の検証基盤を直す

目的:

- 公開判断に使えるコマンドを確定する
- lockfileと依存関係のズレをなくす
- security/lint/build/testの結果を信頼できる状態にする

主な作業:

- lockfile更新とclean install検証
- `security:deps` と `security:secrets` の修正
- Web本体向けlintの分離
- `verify` コマンドの定義
- README / docsの古い記述を実装に合わせる

完了条件:

- clean install後に公開前検証コマンドが通る
- 公開前に失敗している既知チェックが `TASKS.md` で管理されている

## Phase 2: 公開前の運用Runbook整備

目的:

- 障害時にTypeScriptを読めなくても初動対応できる状態にする
- Vercel、Supabase、Stripe、Cloud Runの確認手順を日本語で固定する

主な作業:

- スキャン失敗Runbook
- 課金反映失敗Runbook
- ログイン失敗Runbook
- Supabase障害Runbook
- AIコスト急増Runbook
- 本番環境変数チェックリスト

完了条件:

- 主要障害について「見る場所」「探すログ」「実行するSQL」「触ってはいけない場所」が書かれている

## Phase 3: 公開直後の安定化

目的:

- 実ユーザー利用時の障害とコストを観測する
- 公開直後に大規模リファクタを入れず、運用情報を蓄積する

主な作業:

- Vercel Runtime Logsの確認手順を運用に組み込む
- Supabase Logsと主要テーブルの確認クエリを整備する
- Stripe webhookとsubscription反映の監視観点を固定する
- AIコストダッシュボードとCloud Run logsの確認を定例化する

完了条件:

- 障害対応で得た知識がrunbookに追記されている
- 公開直後の暫定対応が `maintenance/` に残っている

## Phase 4: 公開後の段階的リファクタ

目的:

- 巨大ファイルと危険領域を小さく分け、今後の機能追加を安全にする

優先順:

1. `src/app/api/scan-jobs/process/route.ts`
2. `src/app/page.tsx`
3. `src/app/project/[id]/page.tsx`
4. `src/app/quiz/[projectId]/page.tsx`
5. `src/lib/ai/prompts.ts`

ルール:

- 1回の変更で1テーマに絞る
- 挙動変更なしの抽出を優先する
- 危険領域は先にテストを追加または確認する
- 作業後に `TASKS.md` と必要な正式docsを更新する

