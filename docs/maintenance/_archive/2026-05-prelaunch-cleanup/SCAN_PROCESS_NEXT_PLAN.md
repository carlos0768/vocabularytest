# Scan Process Next Plan

> Current UI rescue note: この文書は旧 `codex/prelaunch-safety-baseline` で実施済みのscan process追加分割計画です。Task 1-7は最新UIブランチへ再実装済みです。今後は履歴資料として扱ってください。

作成日: 2026-05-09

目的: P2-C Task 1-15 完了後の `src/app/api/scan-jobs/process/route.ts` を再棚卸しし、次にAIへ1回ずつ安全に投げられる小タスクへ分解する。今回は計画文書であり、コード変更、リファクタ実装、機能追加はしない。

## 現状確認

- `git status --short --branch`: `main...origin/main [ahead 31, behind 259]`。作業前の未committed変更はなし。
- `src/app/api/scan-jobs/process/route.ts`: 1600行。
- `src/lib/scan/` には、P2-Cで追加された `mode-provider`, `job-result-payload`, `server-cloud-persistence`, `job-side-effects`, `scan-session-storage`, `job-create-contract` と各testがある。
- `package.json` の `test:web` 固定リストには、scan process関連の route/helper tests が含まれている。

## 責務棚卸し

### P2-C Task 1-15で外へ出た責務

- `scan-jobs/process` の最低限の route contract:
  - pending job claim、already processed、valid UUID missing job、`client_local` result payload、example生成失敗warning、completed通知を `src/app/api/scan-jobs/process/route.contract.test.ts` で固定済み。
  - `processJobById()` にはtest用depsがあるが、production defaultは既存singleton / helperを使う。
- scan mode / provider選択:
  - `getProvidersForMode()` と `getMissingProviderKey()` は `src/lib/scan/mode-provider.ts` へ移動済み。
- background scan createのsave mode判定:
  - `clientPlatform` とPro状態からの `save_mode` 判定は `src/lib/scan/job-create-contract.ts` へ移動済み。
- `client_local` 完了payload:
  - `scan_jobs.result` に保存する `wordCount`, `saveMode`, `extractedWords`, `sourceLabels`, `lexiconEntries`, `warnings`, `exampleGeneration` のpayload作成は `src/lib/scan/job-result-payload.ts` へ移動済み。
- `server_cloud` 保存の一部payload/条件:
  - 新規project insert payload、既存project sourceLabels merge、words insert payload、words保存失敗時rollback条件は `src/lib/scan/server-cloud-persistence.ts` へ移動済み。
  - ただし実際のSupabase select/insert/update/delete順序は route 内に残っている。
- notification / timing の薄いadapter:
  - completed / failed / warning の通知params作成と `flushTiming()` 呼び出しwrapperは `src/lib/scan/job-side-effects.ts` へ移動済み。
  - ただし通知送信自体、DB status更新との順序、Google Sheets timing生成本体は route 内に残っている。
- adjacent scan UI/helper:
  - Home / Project の scan confirm sessionStorage helper、Quiz question/storage helper、prompt分割、課金/auth/sync safety tests は完了済みだが、`scan-jobs/process` route本体の残分割とは別領域。

### まだroute内に残っている責務

- internal worker POST境界:
  - `authorizeInternalWorkerRequest()`、strict JSON parse、`processJobById()` direct call。
- Supabase service role client:
  - lazy singleton `getSupabaseAdmin()` と、test deps未指定時のproduction client取得。
- job state machine:
  - `pending -> processing` claim、claim失敗時の既存job確認、`completed` / `failed` update、HTTP response化。
- timing本体:
  - `TimingMetrics`、Google Sheets payload、Cloud Run timing summary sheet、status別flush。
- image processing:
  - Storage bucket `scan-images` download、MIME判定、base64 data URL化、per-image timeout、batch concurrency、page warning集約。
- extraction orchestration:
  - mode別AI呼び出し、idiom fallback、EIKEN level正規化、provider key不足判定、Cloud Run timing phase。
- parse / validation:
  - extracted words parse、invalid Japanese除外、dedupe、sourceLabels merge、no words failure branch。
- lexicon / Japanese fallback:
  - master-first lexicon解決、`MASTER_FIRST_SCAN_DISABLED_MODES` fallback、Japanese backfill、metrics logging。
- `client_local` branch:
  - example sentence生成、generated example適用、summary/warning作成、completed update、completed通知、timing flush。
- `server_cloud` branch:
  - target project確認、既存project icon/sourceLabels更新、新規project作成、words insert、新規project rollback、example sentence生成、word example update、lexicon master example save `after()`、pronunciation backfill `after()`、quiz prefill、completed update、completed通知、timing flush、word lexicon resolution enqueue `after()`。
- catch/failure branch:
  - processing error時のfailed update、failed通知、timing flush、500応答。

### 絶対に順序を動かしてはいけない処理

1. `scan_jobs` は、downstream workより前に `status='pending'` 条件つきで `processing` へclaimする。
2. claimできなかった場合は既存jobを確認し、pending以外は再処理しない。ここでStorage downloadやAI抽出を始めない。
3. image path / mode / provider key確認後にStorage downloadとAI抽出へ進む。provider key不足は処理本体へ入る前に失敗させる。
4. no words pathは、`failed` update、failed通知、timing flush、400応答の順序を維持する。
5. lexicon master-first / fallback Japanese backfillは、`client_local` / `server_cloud` 分岐前に完了させる。
6. `client_local` は、example生成best-effort後にresult payloadを作り、`completed` update後にcompleted通知とtiming flushを行う。
7. `server_cloud` は、project作成/更新後にwords insertを行う。words insert失敗時にrollbackしてよいのは、その処理で新規作成したprojectだけ。
8. `server_cloud` のexample生成とword example updateは、現状ではcompleted updateより前。lexicon master example saveとpronunciation backfillはbest-effortの `after()`。
9. `server_cloud` のcompleted updateは、completed通知、timing flush、post-processing `after()` より前。
10. processing catchは、`failed` update、failed通知、timing flush、500応答の順序を維持する。
11. `/api/scan-jobs/process` のPOSTは、worker token認証をrequest body parseより前に行う。

### 既存testで固定済みのcontract

- `src/app/api/scan-jobs/process/route.contract.test.ts`
  - pending jobだけprocessingへclaimする。
  - already completed jobは再処理しない。
  - valid UUIDだがrowがないjobは404。
  - `client_local` はexample生成失敗でもscan成功扱いになり、resultに `example_generation_failed` とsummaryが入る。
  - `client_local` completed通知paramsは `projectId: null`, `status: 'completed'`, `wordCount` を持つ。
- `src/app/api/scan-jobs/process/route.extractor.test.ts`
  - mode別extract dispatch。
  - idiom provider mapping。
  - parserが `japaneseSource` を保持し、dedupe時はscan由来を優先する。
  - example generation partial/failed warning helper。
- `src/lib/scan/mode-provider.test.ts`
  - mode別provider mapping。
  - Cloud Run設定時はdirect provider key不足を返さない。
  - Cloud Run未設定時はconfigured provider key不足を返す。
- `src/lib/scan/job-result-payload.test.ts`
  - `client_local` result payload shape、optional fields、省略条件、example warning追加。
- `src/lib/scan/server-cloud-persistence.contract.test.ts`
  - project insert payload、sourceLabels merge、words insert payload、新規projectだけrollbackする条件。
- `src/lib/scan/job-side-effects.test.ts`
  - completed / failed / warning notification params。
  - timing wrapperがentries/timing/jobId/userId/statusを変えずに渡す。
- `src/app/api/security/route.security.test.ts`
  - worker auth 401、non-uuid `jobId` 400、internal worker token正規化。

### まだtestが薄い箇所

- `server_cloud` route-level happy path:
  - 既存project追加、新規project作成、completed update、result payload、通知、timingの順序がroute-levelでは薄い。
- `server_cloud` failure path:
  - words insert失敗時の新規project rollback、既存project非rollback、failed update、failed通知、timing flushのroute-level固定が薄い。
- no words path:
  - multi-image全失敗 / empty result時のfailed update、notification、timing、400応答の契約が薄い。
- grammar warning:
  - `grammar_not_found` warning通知が1 jobで1回だけ送られること、completed payload warningsへ残ることが薄い。
- timing:
  - `TimingMetrics` の値、Cloud Run timing collector / GCP sheet summary、no Cloud Run entries時の挙動はhelper化・testが薄い。
- image processing:
  - Storage download failure、MIME判定、multi-image partial failure、timeout page warning、batch concurrencyの固定が薄い。
- example generation:
  - `client_local` のgenerated example適用、`server_cloud` のword update payload、lexicon master example `after()` が薄い。
- quiz prefill:
  - `ai_enabled` false時のskip、sync prefill result fields、optional post-scan prefill flagは薄い。
- post-processing:
  - word lexicon resolution enqueue対象、`aiTranslatedWordIds` 引き継ぎ、immediate processing flag、`after()` の非critical failure handlingが薄い。

## 次の小タスク

以下は推奨順です。1タスクでDB状態遷移、rollback、通知、timing、post-processingを同時に動かさないでください。保存処理全体をいきなりservice化しないでください。

### Task 1: `server_cloud` route contractを追加する

- 目的: `server_cloud` を分割する前に、現行route-levelの成功/失敗contractを固定する。
- 触ってよい範囲: `src/app/api/scan-jobs/process/route.contract.test.ts` のfake Supabase client拡張、test fixture、必要最小限のtest-only deps。可能ならproduction codeは触らない。
- 触ってはいけない範囲: `src/app/api/scan-jobs/process/route.ts` の処理順、DB update payload、rollback条件、通知/timing/post-processing、package scripts。
- 追加/更新すべきtest:
  - 新規project `server_cloud` happy pathで、project insert -> words insert -> completed updateの順序とresult payloadを固定。
  - words insert失敗時に、新規projectだけdeleteされ、failed update / failed通知 / timing flushへ進むことを固定。
  - 既存project追加時のwords insert失敗ではproject deleteしないことを固定。
- 検証コマンド: `npm exec -- tsx --test src/app/api/scan-jobs/process/route.contract.test.ts src/lib/scan/server-cloud-persistence.contract.test.ts`
- 失敗時の戻し方: 追加したtest caseとfake client拡張だけを戻す。production codeへ触れた場合はその差分を破棄し、test-onlyでやり直す。

### Task 2: `server_cloud` result payload builderを抽出する

- 目的: route内の `server_cloud` completed result payload作成だけを純粋helperへ移し、DB状態遷移や保存処理本体から切り離す。
- 触ってよい範囲: 新規候補 `src/lib/scan/server-cloud-result-payload.ts` とtest、`route.ts` のresult payload object作成箇所の置換。
- 触ってはいけない範囲: project/word insert/update/delete、rollback、example生成呼び出し、quiz prefill実行、`scan_jobs.update({ status: 'completed' })`、通知、timing、`after()`。
- 追加/更新すべきtest:
  - `wordCount`, `saveMode`, `targetProjectId`, `sourceLabels`, `warnings`, `exampleGeneration` の有無。
  - `quizPrefillRequested/Succeeded/Failed` の有無と値。
  - warningなし / exampleGenerationなしではoptional fieldsを省略すること。
- 検証コマンド: `npm exec -- tsx --test src/lib/scan/server-cloud-result-payload.test.ts src/app/api/scan-jobs/process/route.contract.test.ts`
- 失敗時の戻し方: 新helperとimport変更を戻し、route内の既存object literalへ戻す。DB保存や通知/timingへ触れた差分は破棄する。

### Task 3: quiz prefillのselector / update payloadを純粋helperへ出す

- 目的: `server_cloud` branch内のquiz prefill対象選定とword update payload作成を、AI呼び出しやDB更新から分離する。
- 触ってよい範囲: 新規候補 `src/lib/scan/quiz-prefill.ts` とtest、route内の `quizSeedWords` 作成と `updatePayload` 作成箇所。
- 触ってはいけない範囲: `generateQuizContentWithRetry()` のretry実行順、AI呼び出し、Supabase update実行、`ai_enabled` 判定、timing加算、post-scan prefill feature flag。
- 追加/更新すべきtest:
  - distractors不足、example不足、POS不足のwordだけprefill対象になる。
  - example fieldsは生成結果に値がある時だけupdate payloadへ入る。
  - 既存exampleを空で上書きしない。
- 検証コマンド: `npm exec -- tsx --test src/lib/scan/quiz-prefill.test.ts src/app/api/scan-jobs/process/route.contract.test.ts`
- 失敗時の戻し方: helper抽出を戻し、route内の既存filter/map/object literalへ戻す。AI/DB/timingへ触れた場合はその差分を破棄する。

### Task 4: `client_local` example generationのplan/apply helperを抽出する

- 目的: `client_local` branchの「example生成が必要なword一覧作成」と「生成結果をresolvedWordsへ適用する処理」を純粋helperへ出す。
- 触ってよい範囲: 新規候補 `src/lib/scan/example-generation.ts` の `buildClientLocalExampleSeedWords()` / `applyClientLocalGeneratedExamples()` とtest、route内の該当map/loop置換。
- 触ってはいけない範囲: `generateExamples()` 呼び出し、Cloud Run timing phase、example生成失敗時のbest-effort継続、summary/warning作成、completed update、通知、timing flush。
- 追加/更新すべきtest:
  - DB idがない `client_local` ではindex文字列をplaceholder idにする。
  - 既存exampleがあるwordはseedから除外する。
  - generated exampleがある時だけexample/日本語/品詞を適用し、既存品詞がある場合は上書きしない。
- 検証コマンド: `npm exec -- tsx --test src/lib/scan/example-generation.test.ts src/app/api/scan-jobs/process/route.contract.test.ts src/app/api/scan-jobs/process/route.extractor.test.ts`
- 失敗時の戻し方: helperとroute import変更を戻し、既存branch内のmap/loopへ戻す。DB statusや通知/timingへ触れた差分は破棄する。

### Task 5: `server_cloud` example generationのseed / update payload helperを抽出する

- 目的: `server_cloud` branchのexample生成対象選定とword update payload作成を、実DB更新やlexicon `after()` から分離する。
- 触ってよい範囲: Task 4と同じ `src/lib/scan/example-generation.ts` への追加、または別helper。route内の `wordsForExampleGen` 作成とexample update payload作成箇所。
- 触ってはいけない範囲: `generateExamples()` 呼び出し、`Promise.all` によるSupabase update実行、lexicon master example save `after()`、timing加算、completed update、通知。
- 追加/更新すべきtest:
  - `example_sentence` が空/nullのinserted wordだけseedに入る。
  - generated exampleのDB update payloadは `example_sentence`, `example_sentence_ja`, `part_of_speech_tags` を維持する。
  - seed idはinserted word idを使う。
- 検証コマンド: `npm exec -- tsx --test src/lib/scan/example-generation.test.ts src/app/api/scan-jobs/process/route.contract.test.ts`
- 失敗時の戻し方: helper追加とroute置換を戻す。DB update実行順、lexicon `after()`、timingへ触れた差分は破棄する。

### Task 6: per-image extraction workerを小さく切り出す

- 目的: Storage download、MIME判定、base64化、AI extraction、per-image timing delta、page warningを1画像単位のhelperに寄せ、batch orchestrationから分ける。
- 触ってよい範囲: 新規候補 `src/lib/scan/image-extraction.ts` とtest、route内の `processOneImage()` 相当の置換。helperはstorage/download/extract depsを受け取る形にする。
- 触ってはいけない範囲: job claim、provider key判定、batch concurrency値、grammar warning通知送信、dedupe、no words failure branch、DB status update、completed/failed通知、timing flush。
- 追加/更新すべきtest:
  - png/webp/pdf/jpegのMIME判定。
  - download failureはwords空、pageWarningありで返す。
  - extraction failureはfirst error候補とpageWarningを返す。
  - success時はparse済みwords、sourceLabels、download/extraction msを返す。
- 検証コマンド: `npm exec -- tsx --test src/lib/scan/image-extraction.test.ts src/app/api/scan-jobs/process/route.extractor.test.ts src/app/api/scan-jobs/process/route.contract.test.ts`
- 失敗時の戻し方: 新helperとroute置換を戻し、route内 `processOneImage()` へ戻す。DB/notification/timing flush/post-processingへ触れた差分は破棄する。

### Task 7: post-processing候補計算をpure helperへ出す

- 目的: completed update後の `after()` 本体へ進む前に、word lexicon resolution対象とquiz prefill対象の計算だけをtest可能にする。
- 触ってよい範囲: 新規候補 `src/lib/scan/post-processing.ts` とtest、route内の `pendingWordIds` 計算とpost-scan quiz seed計算。
- 触ってはいけない範囲: `after()` の配置、completed update前後の順序、`enqueueWordLexiconResolutionJobs()` 実行、`triggerWordLexiconResolutionProcessing()` 実行、feature flags、通知、timing。
- 追加/更新すべきtest:
  - AI backfilled Japaneseのword idはlexicon resolution対象になる。
  - lexicon entryやPOS不足に応じた対象判定を維持する。
  - post-scan quiz prefill seedはTask 3のselectorと同じ基準を使う。
- 検証コマンド: `npm exec -- tsx --test src/lib/scan/post-processing.test.ts src/lib/scan/quiz-prefill.test.ts src/app/api/scan-jobs/process/route.contract.test.ts`
- 失敗時の戻し方: helperとroute置換を戻し、`after()` 内の既存filter/mapへ戻す。`after()` の位置やexternal callを動かした場合はその差分を破棄する。

## AIに渡す時の共通注意

- 1回の依頼で上記タスクを複数まとめない。
- 先に該当helper/testを作り、route置換は最小にする。
- `src/app/api/scan-jobs/process/route.ts` の保存処理全体をserviceへ移す作業は、上記のpayload / selector / example / image / post-processing helperが揃うまで禁止。
- 認証、課金、同期、DB migration、schema、package-lock、prompt本文は触らない。
- routeを触った場合は、少なくとも対象helper test、`src/app/api/scan-jobs/process/route.contract.test.ts`, `src/app/api/scan-jobs/process/route.extractor.test.ts` を実行する。広い変更なら `npm run verify` まで実行する。
