# P2-C Checkpoint

作成日: 2026-05-09

P2-C Task 1-15 完了後のチェックポイントです。次のAIセッションは、巨大ファイル分割や追加リファクタへ入る前に、この文書で「何が固定済みで、何がまだ危ないか」を確認してください。

## 現在の状態

- P2-C Task 1-15 は完了済み。
- `npm run verify` は成功。`npm test` は 290 tests pass、`test:security` は 38 tests pass。
- ここまでの作業は、主に「挙動を変えずに、危険な処理をテストで固定する」ための安全柵づくり。
- `docs/maintenance/REFACTOR_PLAN.md` は履歴として残す。Task 1-15 完了後の次フェーズ判断は、このcheckpointと `docs/maintenance/TASKS.md` を優先する。

## P2-Cで安全になったこと

- スキャン系:
  - `scan-jobs/process` のjob claim、already processed、missing job、`client_local` result payload、example生成失敗warning、completed通知をcontract testで固定。
  - `/api/extract` の認証、file type、PDF/OpenAI制限、HEIC拒否、Pro-only、usage limit、response shapeを固定。
  - scan mode / provider選択、scan job createの `save_mode` 判定、`server_cloud` 保存payload、通知/timing paramsをhelper化。
- UI受け渡し:
  - Home / Project の `/scan/confirm` 向け sessionStorage key とpayload shapeをhelper testで固定。
  - Quizのstorage key、30分TTL、question生成、fallback distractorsを純粋helperとして固定。
- AI prompt:
  - prompt public exports、JSON output、sourceLabels rule、partOfSpeechTags、EIKEN/idiom分類をcontract testで固定。
  - prompt本文の意味を変えずにdomain別ファイルへ分割済み。
- 課金と認証:
  - Stripe webhookはsignature/claim/processed/failedをroute側に残し、event handlerだけをhelper化。
  - subscription reconcile response shapeとpayment state分類をhelper化。
  - Auth OTP lifecycleと4つのroute差分をroute-level contract testで固定。
- 同期:
  - remote empty + local dataでlocal project/wordを消さないことを固定。
  - pending createつきlocal-only projectのremote push、sync queueの順序、retry increment、retry limit drop、成功itemのみ削除を固定。

## まだ残る保守性リスク

- `src/app/api/scan-jobs/process/route.ts` はまだ大きい。AI抽出、DB保存、rollback、通知、timing、post-processingが同じroute内に残っている。
- `src/app/page.tsx` と `src/app/project/[id]/page.tsx` は、UI表示、repository選択、scan開始、sessionStorage、offline/PWA寄りの副作用が混在している。
- `src/app/quiz/[projectId]/page.tsx` は、クイズ進行、保存、表示、background distractor生成、spaced repetitionがまだ同じ画面に近い。
- Supabase RLSのdocs差分、Cloud Run本番env、App Store / IAP外部設定は、repo内だけでは確定できない確認事項として残っている。
- `npx tsc --noEmit` は既知の失敗状態。公開前gateは `npm run verify` を正とする。

## 次に進める候補

推奨順:

1. `scan-jobs/process` 残分割の再計画
   - まず現行routeを読み直し、Task 1-15で外に出た責務と、まだroute内に残る責務を再棚卸しする。
   - いきなり保存処理全体をservice化しない。DB状態遷移、rollback、通知、timing、post-processingの順序を動かさない小タスクへ再分解する。
2. Home / Project巨大ファイル整理
   - 先に画面責務と副作用を一覧化する。
   - repository選択、scan API呼び出し、offline cache、push通知、share/bulk deleteを同時に動かさない。
3. Quiz巨大ファイル整理
   - 既にquestion/storage helperはあるため、次は回答処理、保存処理、表示責務を分ける候補を洗い出す。
   - spaced repetition、wrong answer記録、background distractor APIは同時に触らない。
4. P2-D正式docs昇格
   - P2-A/P2-B/P2-Cで得た恒久知識を `docs/architecture.md`, `docs/boundaries.md`, `docs/invariants.md`, `docs/ops/` へ移す。
   - `maintenance/` の一時情報を正式docsへ移す時は、古い調査メモと恒久runbookを混ぜない。

## AIへ投げる時の注意

- 1回のセッションで1責務だけを扱う。
- 認証、課金、スキャン、同期、DB migrationを同時に触らない。
- 既存contract testを壊して挙動変更しない。挙動変更が必要なら、先に理由と影響範囲をdocsへ書く。
- コードを触る場合は、対象testと `npm run verify` を実行する。
- docsだけを触る場合は `git diff --check` と関連 `rg` 確認でよい。
