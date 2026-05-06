# Maintenance Tasks

公開前の保守性向上工事で追うタスク一覧です。完了したものは日付つきでDoneへ移すか、`_archive/` に退避します。

## P0: 公開前に必ず終わらせる

- [ ] secrets guardの失敗を整理する
  - 現状: `npm run security:all` が `CLAUDE.md`, `src/lib/api/internal-worker.ts`, `src/lib/api/internal-worker.test.ts` で失敗
  - 成功条件: 本物のsecretではないものを安全に修正またはallowlist化し、`npm run security:secrets` が通る
- [ ] lint対象を整理する
  - 現状: `npm run lint` が `mobile/`, `cloud-run-scan/dist/`, 動画素材配下まで拾って失敗
  - 成功条件: 少なくともWeb本体向けの `lint:web` が通る
- [ ] 公開前検証コマンドを定義する
  - 候補: `npm run verify`
  - 成功条件: 公開前に何を実行すればよいかが `package.json` と docsで一致する
- [ ] docsの古い記述を実装に合わせる
  - 対象: `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/commands.md`, `docs/runbooks.md`, `.env.example`, `vercel.json`
  - 注意: KOMOJU/Stripe、Sentry、migration数、テスト一覧、存在しないroute設定

## P1: 公開前にできれば終わらせる

- [ ] `docs/ops/` に日本語の障害対応Runbookを追加する
  - スキャン失敗
  - 課金反映失敗
  - ログイン失敗
  - Supabase障害
  - AIコスト急増
- [ ] 本番環境変数チェックリストを作る
  - Vercel
  - Supabase
  - Stripe
  - Cloud Run
  - Apple IAP
  - Push通知
- [ ] テスト実行方式を見直す
  - 現状: `package.json` の `test` script は固定リスト
  - 課題: repo内に存在するが固定リストに入っていないtestがある
- [ ] docsの矛盾一覧を作る
  - まずは矛盾箇所を列挙し、修正は別タスクに分ける

## P2: 公開後に段階的に進める

- [ ] `src/app/api/scan-jobs/process/route.ts` を段階的に分割する
- [ ] `src/app/page.tsx` を段階的に分割する
- [ ] `src/app/project/[id]/page.tsx` を段階的に分割する
- [ ] `src/app/quiz/[projectId]/page.tsx` を段階的に分割する
- [ ] `src/lib/ai/prompts.ts` を用途別に整理する
- [ ] repository層、認証、課金、同期の設計を必要に応じて再点検する

## Done

- [x] 2026-05-06: `package-lock.json` と実際のinstall結果を一致させ、dependency auditのhigh/criticalを解消
  - `npm ls next uuid protobufjs fast-jwt undici --all`: `next@16.2.4`, `uuid@13.0.2`, `protobufjs@7.5.6`, `fast-jwt@6.2.4`, `undici@7.25.0`
  - `npm run security:deps`: 成功。high=0 / critical=0
  - `npm audit --omit=dev --audit-level=high`: 成功。Next同梱 `postcss@8.4.31` にmoderate 2件は残る
  - `npm run build`: 成功
  - `npm test`: 成功。132 tests pass
- [x] 2026-05-06: 保守性監査メモを作成
  - [`../prelaunch-maintainability-audit.md`](../prelaunch-maintainability-audit.md)
- [x] 2026-05-06: docs入口とmaintenance文書の初回構成を追加
