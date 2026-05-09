# Scan Process Checkpoint

作成日: 2026-05-09

`SCAN_PROCESS_NEXT_PLAN.md` Task 1-7 完了後のチェックポイントです。次に `src/app/api/scan-jobs/process/route.ts` を触る場合は、実装へ入る前にこの文書で「何が外に出て、何がまだrouteに残っているか」を確認してください。

## Task 1-7で完了したこと

- Task 1: `server_cloud` のroute-level contractを追加した。
  - 新規project happy pathの project insert -> words insert -> completed update -> completed通知 -> timing flush とresult payloadを固定した。
  - words insert失敗時は新規projectだけrollbackし、既存project追加時はproject deleteしないことを固定した。
- Task 2: `server_cloud` completed result payload builderを抽出した。
  - `wordCount`, `saveMode`, `targetProjectId`, `sourceLabels`, warnings, example summary, quiz prefill summaryのshapeを固定した。
- Task 3: quiz prefill selector / update payloadをhelper化した。
  - distractors不足、example不足、POS不足の判定と、空生成結果で既存example/POSを上書きしないことを固定した。
- Task 4: `client_local` example generationのseed作成 / 反映処理をhelper化した。
  - DB idがないwordのplaceholder id、既存example除外、生成結果がある時だけexample / 日本語 / POSを反映することを固定した。
- Task 5: `server_cloud` example generationのseed / update payloadをhelper化した。
  - 空exampleのinserted wordだけを対象にし、DB update payloadが `example_sentence`, `example_sentence_ja`, `part_of_speech_tags` を維持することを固定した。
- Task 6: per-image extraction workerをhelper化した。
  - Storage download、MIME判定、base64 data URL化、AI extraction呼び出し、download/extraction ms計測、page warning生成を `processScanImage()` へ移した。
- Task 7: post-processing候補計算をhelper化した。
  - word lexicon resolution対象IDとpost-scan quiz prefill seedの計算を `post-processing.ts` へ移し、AI backfilled Japanese、lexicon entry不足、POS不足の判定を固定した。

## Helper化された責務と固定済みtest

`scan-jobs/process` から外へ出た主な責務:

- `src/lib/scan/server-cloud-result-payload.ts`
  - `server_cloud` completed時の `scan_jobs.result` payload作成。
  - test: `src/lib/scan/server-cloud-result-payload.test.ts`
- `src/lib/scan/quiz-prefill.ts`
  - quiz prefill対象選定とword update payload作成。
  - test: `src/lib/scan/quiz-prefill.test.ts`
- `src/lib/scan/example-generation.ts`
  - `client_local` / `server_cloud` のexample generation seed作成、生成結果反映、word update payload作成。
  - test: `src/lib/scan/example-generation.test.ts`
- `src/lib/scan/image-extraction.ts`
  - 1画像単位のdownload、MIME判定、data URL化、AI extraction、timing delta、page warning作成。
  - test: `src/lib/scan/image-extraction.test.ts`
- `src/lib/scan/post-processing.ts`
  - completed update後のlexicon resolution対象IDとpost-scan quiz prefill seed計算。
  - test: `src/lib/scan/post-processing.test.ts`

Task 1-7で強化されたroute-level contract:

- `src/app/api/scan-jobs/process/route.contract.test.ts`
  - pending claim、already processed、missing job、`client_local` result payload、`server_cloud` happy path、new project rollback、existing project non-rollback、completed/failed通知、timing flushを固定。
- `src/app/api/scan-jobs/process/route.extractor.test.ts`
  - mode別extract dispatch、idiom provider mapping、parse/dedupe、example warning helperを継続固定。
- `src/app/api/security/route.security.test.ts`
  - worker auth 401、non-uuid `jobId` 400、internal worker token正規化を継続固定。

## まだroute.ts に残している責務

- internal worker POST境界:
  - worker token認証、strict JSON parse、`processJobById()` direct call。
- Supabase service role client取得:
  - production client singleton、test deps未指定時のclient取得。
- job state machine:
  - `pending -> processing` claim、claim失敗時の既存job確認、`completed` / `failed` update、HTTP response化。
- timing本体:
  - `TimingMetrics`、Google Sheets payload、Cloud Run timing summary、status別flushの組み立て。
- batch orchestration:
  - image path検証、provider key判定、parallel batch loop、`Promise.allSettled`、grammar warning集約、no words branch。
- extraction後の整形:
  - invalid Japanese除外、dedupe、sourceLabels merge、master-first lexicon解決、Japanese fallback、metrics logging。
- `client_local` branchの副作用:
  - `generateExamples()` 呼び出し、best-effort warning作成、completed update、completed通知、timing flush。
- `server_cloud` branchのDB副作用:
  - target project確認、既存project更新、新規project作成、words insert、rollback実行、example update、quiz prefill update、completed update。
- completed後の `after()`:
  - lexicon master example save、pronunciation backfill、word lexicon resolution enqueue/trigger、post-scan quiz prefill実行、非critical failure handling。
- failure branch:
  - processing error時のfailed update、failed通知、timing flush、500応答。

## これ以上 scan-jobs/process を触る場合の注意点

- 先に現行routeを再棚卸しして、新しい1責務タスクへ切る。`SCAN_PROCESS_NEXT_PLAN.md` のTask 1-7は完了済みなので、そのまま次の未完了実装計画として扱わない。
- DB状態遷移、rollback、通知、timing、post-processingの順序を同時に動かさない。
- 保存処理全体のservice化へ一気に進まない。特に `scan_jobs` status update、project/word insert/delete、notification、timing flush、`after()` の位置はroute-level contractを先に増やしてから触る。
- 認証、課金、同期、DB migration、schema、package-lock、prompt本文は同じセッションで混ぜて触らない。
- routeを触る場合は、少なくとも対象helper test、`src/app/api/scan-jobs/process/route.contract.test.ts`, `src/app/api/scan-jobs/process/route.extractor.test.ts` を実行する。広い変更なら `npm run verify` まで実行する。
- docsだけを触る場合は、`git diff --check` と関連 `rg` 確認でよい。

## 次フェーズ候補

次の実装候補は、ここからさらに1責務ずつ再分解してから着手します。

1. Home巨大ファイル整理
   - `src/app/page.tsx` の画面責務と副作用を棚卸しする。
   - scan開始、sessionStorage、file upload、PDF expansion、offline/PWA寄り処理、UI stateを同時に動かさない。
2. Project巨大ファイル整理
   - `src/app/project/[id]/page.tsx` のデータ取得、表示、操作を棚卸しする。
   - repository選択、scan-to-add、share、bulk delete、filter/sort UIを同時に動かさない。
3. Quiz巨大ファイル整理
   - `src/app/quiz/[projectId]/page.tsx` のクイズ進行、保存、表示を棚卸しする。
   - 既存のquestion/storage helperを前提に、回答処理、spaced repetition、wrong answer記録、background distractor APIを分ける。
4. P2-D正式docs昇格
   - P2-A/P2-B/P2-Cと今回のscan process checkpointで得た恒久知識を `docs/architecture.md`, `docs/boundaries.md`, `docs/invariants.md`, `docs/ops/` へ昇格する。
   - `maintenance/` の作業ログと正式docsの恒久知識を混ぜない。
