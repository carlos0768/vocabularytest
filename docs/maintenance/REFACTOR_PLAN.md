# Refactor Plan

> Current UI rescue note: この文書は旧 `codex/prelaunch-safety-baseline` 向けのP2-C分解計画です。最新UIブランチでは、旧コミットを丸ごとcherry-pickせず、各taskの意図とcontractを最新 `origin/main` のコードへ再実装してください。

作成日: 2026-05-07

目的: P2-Bとして、P2-A監査結果と実コード再確認をもとに、公開後にAIへ1回ずつ安全に任せられる小さなリファクタタスクへ分解する。これは実装計画であり、今回コード変更、巨大ファイル分割、機能追加はしない。

## 1. 全体方針

- いきなり巨大ファイルを分割しない。巨大ファイルは「責務を1つずつ外に出す」対象であり、最初の作業単位にしない。
- 先にcontract / test / 検証条件を固定する。特にscan jobの `status`, `save_mode`, `result` payload、usage increment、Pro-only mode、Stripe webhook idempotencyは、分割前に現在挙動を固定する。
- 認証、課金、スキャン、同期、DB migrationを同時に触らない。1回のAIセッションでは1領域だけを対象にする。
- API routeを薄くする時は、HTTP境界、request parsing、auth、Bearer/cookie/internal worker検証、Stripe signature検証はroute側に残す。
- `/api/scan-jobs/*` の `after()` から `processJobById()` を直接呼ぶ構造は維持する。HTTP self-fetchへ戻さない。
- Supabase service roleを使うrouteでは、service role clientの作成場所や認可条件を移動する前に、テストまたは手動検証条件を明記する。
- prompt文言、DB mapper、Dexie schema、RLS、migrationは、機能品質やデータ保持へ直結するため、分割目的のついでに触らない。

## 2. リファクタ優先順位

### 最初に扱うべき領域

1. scan jobのcontract testと検証条件
   - 対象: `src/app/api/scan-jobs/process/route.ts`, `src/app/api/scan-jobs/create/route.ts`, `src/app/api/scan-jobs/route.ts`, `src/app/api/extract/route.ts`
   - 理由: P2-Aで最も危険とされたscan系は、現在route-levelのworker flow coverageが薄い。分割より先に、claim、`save_mode`, failed/completed payload、Pro-only mode、usage応答を固定する必要がある。
2. scan mode / provider / usage / save-modeの小さな共通helper
   - 理由: `/api/extract` と `/api/scan-jobs/process` にprovider選択が重複し、`create` とlegacy `/api/scan-jobs` にsave mode判定が重複している。純粋関数から外へ出せばblast radiusが小さい。
3. `scan-jobs/process` の非HTTP部分を1責務ずつ外へ出す
   - 理由: 1,589行で、AI抽出、DB保存、通知、timing、post-processingが混在している。ただし最初に外すのはpayload builderやnotification/timing adapterなど、DB状態遷移を変えない部分に限定する。

### 後回しにすべき領域

1. Stripe webhook / reconcileの大きなhandler移動
   - 理由: 課金は高リスクだが、`src/lib/subscription/billing-activation.ts` へ共通化済み部分があり、scanより先に触る必要は低い。signature検証とwebhook idempotencyをroute側に残す前提が固まってから扱う。
2. Auth OTP lifecycleの共通化
   - 理由: 重複は明確だが、account creation、session cookie、password resetを誤るとログイン不能やaccount takeover防止に影響する。先にroute contract testを足す。
3. Home / Project / QuizのUI巨大ファイル分割
   - 理由: UI側はテストが薄く、repository選択、sessionStorage、scan開始、副作用が絡む。server-side scan contractが安定してから、純粋helperやhook単位で切る。
4. Hybrid repository / sync queue
   - 理由: `fullSync()` はローカルデータ削除を含む。既存testは `shouldRunFullSync()` 中心で、sync queueのretry/drop順序が薄い。追加テストなしで構造変更しない。
5. prompt分割
   - 理由: `src/lib/ai/prompts.ts` は長いが、文言変更はAI品質に直結する。先にprompt contract testを増やし、文言を変えない機械的分割だけに限定する。

### P2-A優先度からの修正

P2-Aの表では `src/app/api/scan-jobs/process/route.ts` service boundaryがP1先頭だったが、P2-Bでは「scan job contract test」を最初に置く。P2-A本文のRecommended orderはcontract firstなので大きな矛盾ではないが、実行順としては明確に修正する。理由は、現状のroute-level worker flow coverageが薄く、先にservice boundaryを動かすと `pending -> processing -> completed/failed`、`client_local` / `server_cloud` payload、通知、usageの回復点を無自覚に変える危険があるため。

## 3. 小タスク一覧

### Task 1: scan job process contract testを追加する

- タスク名: scan job process contract test追加
- 目的: `processJobById()` を分割する前に、claim、already processed、invalid job、`client_local` payload、example warning、worker authの現行挙動を固定する。
- 対象ファイル: `src/app/api/scan-jobs/process/route.ts`, `src/app/api/scan-jobs/process/route.extractor.test.ts`, `src/app/api/security/route.security.test.ts`
- 触ってよい範囲: `__internal` に既存純粋helperをテストしやすく公開する最小変更、test fixture、mock dependency追加
- 触ってはいけない範囲: `processJobById()` のDB更新順、`after()` post-processing、notification送信、timing log、AI prompt、Supabase migration
- 変更前に固定すべき挙動: pending jobだけprocessingへclaimする、pending以外は再処理しない、jobId validationは400、invalid worker authは401、example生成失敗はscan失敗にしない
- 追加・更新すべきテスト: `route.extractor.test.ts` にpayload/warning helper testを追加、必要なら新規 `route.contract.test.ts` でSupabase chain mockを使ったclaim branchを固定
- 実行すべき検証コマンド: `npm exec -- tsx --test src/app/api/scan-jobs/process/route.extractor.test.ts src/app/api/security/route.security.test.ts`, `npm run verify`
- 失敗時の戻し方: 追加したtestと `__internal` 露出だけを戻す。production codeの状態遷移を触っていた場合はその差分を破棄し、test追加のみからやり直す。
- AIに投げる時の注意文: 「`processJobById()` の処理順やDB update payloadは変えない。今回はcontract test追加だけ。HTTP self-fetchを復活させない。」

### Task 2: scan mode / provider選択helperを共通化する

- タスク名: scan mode provider helper抽出
- 目的: `/api/extract` と `/api/scan-jobs/process` の `getProvidersForMode()` / `getMissingProviderKey()` 重複を、挙動を変えずに1箇所へ寄せる。
- 対象ファイル: `src/app/api/extract/route.ts`, `src/app/api/scan-jobs/process/route.ts`, 新規候補 `src/lib/scan/mode-provider.ts`, 既存provider tests
- 触ってよい範囲: provider選択の純粋関数、既存testのimport先変更
- 触ってはいけない範囲: auth、usage increment、AI抽出呼び出し、Cloud Run判定仕様、`ExtractMode` の値追加/削除
- 変更前に固定すべき挙動: `all` / `circled` / `eiken` / `idiom` のprovider、Cloud Run設定時はdirect provider key missingを返さない
- 追加・更新すべきテスト: `src/app/api/extract/route.provider.test.ts` と `src/app/api/scan-jobs/process/route.extractor.test.ts` を新helperへ向ける。可能なら新規helper testへ集約する。
- 実行すべき検証コマンド: `npm exec -- tsx --test src/app/api/extract/route.provider.test.ts src/app/api/scan-jobs/process/route.extractor.test.ts`, `npm run verify`
- 失敗時の戻し方: 新helperとimport変更を戻し、既存route内関数へ戻す。test期待値は変更しない。
- AIに投げる時の注意文: 「provider mappingの移動だけ。mode追加、文言変更、AI_CONFIG変更、Cloud Run fallback変更は禁止。」

### Task 3: scan job create / legacy routeのsave mode contractを固定する

- タスク名: background scan create contract test追加
- 目的: `clientPlatform` とPro状態から `save_mode` を決める挙動、target project validation、storage existence check、usage batch incrementのroute contractを固定する。
- 対象ファイル: `src/app/api/scan-jobs/create/route.ts`, `src/app/api/scan-jobs/route.ts`, 新規候補 `src/lib/scan/job-create-contract.ts`
- 触ってよい範囲: `save_mode` 判定などの純粋関数化、test fixture
- 触ってはいけない範囲: `checkAndIncrementScanUsage()` 呼び出しタイミング、Storage bucket名、job insert payload、`after(processJobById)` 直接呼び出し
- 変更前に固定すべき挙動: webはPro/freeとも `server_cloud`、iOS/Android freeは `client_local`、Pro-only modeはfreeで403、missing uploaded imageは400、usage limitは429
- 追加・更新すべきテスト: 新規 `src/app/api/scan-jobs/create/route.contract.test.ts` または helper testでsave mode matrixを固定。legacy `/api/scan-jobs` は同じhelperを使う場合だけtest追加。
- 実行すべき検証コマンド: `npm exec -- tsx --test src/app/api/scan-jobs/create/route.contract.test.ts`, `npm run test:security`, `npm run verify`
- 失敗時の戻し方: helper抽出を戻し、route内の既存判定へ戻す。Storageやusageのmockが不安定なら純粋関数testだけに縮小する。
- AIに投げる時の注意文: 「usage incrementを後ろへ動かさない。Storage確認、target project ownership、after direct invocationは触らない。」

### Task 4: `/api/extract` のrequest / usage / response contractを固定する

- タスク名: extract route contract test追加
- 目的: 即時scanの認証、file type validation、Pro-only mode、usage response、PDF/OpenAI制限、example generation best-effortを固定する。
- 対象ファイル: `src/app/api/extract/route.ts`, `src/app/api/extract/route.provider.test.ts`, 新規候補 `src/app/api/extract/route.contract.test.ts`
- 触ってよい範囲: request schemaやresponse shapeをテストしやすい純粋helperへ出すこと、dependency injection追加
- 触ってはいけない範囲: auth方法、`check_and_increment_scan` の呼び出し、user-facing error文言、AI抽出順、example generationをblockingにする変更
- 変更前に固定すべき挙動: 401/400/403/429/422/500の代表応答、`scanInfo` shape、`limitReached`、`sourceLabels` / `lexiconEntries` shape
- 追加・更新すべきテスト: provider testに加えて、schema/response helper testを追加。route full mockが重い場合は最初は純粋helper testに限定。
- 実行すべき検証コマンド: `npm exec -- tsx --test src/app/api/extract/route.provider.test.ts src/app/api/extract/route.contract.test.ts`, `npm run verify`
- 失敗時の戻し方: route本体を戻し、追加testだけを保留にする。usage/authへ触れた差分は必ず破棄する。
- AIに投げる時の注意文: 「`/api/extract` の挙動変更禁止。特にusage increment、Pro-only判定、PDF制限、HEIC拒否の順序を変えない。」

### Task 5: `scan-jobs/process` のclient_local result payload builderを抽出する

- タスク名: client_local result payload builder抽出
- 目的: `client_local` 完了時の `scan_jobs.result` JSON構築を純粋helperに移し、process route本体からpayload整形だけを外す。
- 対象ファイル: `src/app/api/scan-jobs/process/route.ts`, 新規候補 `src/lib/scan/job-result-payload.ts`, `route.extractor.test.ts`
- 触ってよい範囲: payload object作成、warning/exampleGeneration summary適用
- 触ってはいけない範囲: `scan_jobs.update({ status: 'completed' })` の実行場所、通知、timing flush、example generation呼び出し
- 変更前に固定すべき挙動: `wordCount`, `saveMode`, `extractedWords`, `sourceLabels`, `lexiconEntries`, `warnings`, `exampleGeneration` の有無
- 追加・更新すべきテスト: helper testでwarningあり/なし、example partial/failed、empty lexiconEntriesを固定
- 実行すべき検証コマンド: `npm exec -- tsx --test src/app/api/scan-jobs/process/route.extractor.test.ts`, `npm run verify`
- 失敗時の戻し方: helperを削除し、route内の既存object literalへ戻す。DB更新やAI呼び出しに触れた場合はその差分を捨てる。
- AIに投げる時の注意文: 「payload作成の移動だけ。DB update、notification、timing、AI生成は一切移動しない。」

### Task 6: `scan-jobs/process` のserver_cloud project/word保存は準備だけにする

- タスク名: server_cloud保存処理の境界準備
- 目的: project作成/更新、word insert、rollbackの責務を将来分離するため、先に入力/出力型と失敗時contractを文書化し、必要なtest fixtureを作る。
- 対象ファイル: `src/app/api/scan-jobs/process/route.ts`, 新規候補 `src/lib/scan/server-cloud-persistence.contract.test.ts`
- 触ってよい範囲: type alias、純粋な `wordsToInsert` builder、test fixture
- 触ってはいけない範囲: Supabase insert/update/delete呼び出し順、新規project rollback条件、source labels compat helper、lexicon/example persistence
- 変更前に固定すべき挙動: target projectがあれば存在確認とsourceLabels merge、新規projectならwords insert失敗時に新規projectだけ削除、既存projectは削除しない
- 追加・更新すべきテスト: `wordsToInsert` payload builder test、rollback condition helper test
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/scan/server-cloud-persistence.contract.test.ts`, `npm run verify`
- 失敗時の戻し方: type/helper/testを戻す。DB persistenceを移動し始めた場合は中断して戻す。
- AIに投げる時の注意文: 「今回は保存処理の実移動は禁止。rollback条件とpayload contractを固定するだけ。」

### Task 7: notification / timing adapterをscan処理から切り出す

- タスク名: scan notification timing adapter抽出
- 目的: 成功/失敗/grammar warning通知とtiming flushの呼び出しを小さなadapterにまとめ、process routeの見通しを上げる。
- 対象ファイル: `src/app/api/scan-jobs/process/route.ts`, `src/lib/notifications/*`, 新規候補 `src/lib/scan/job-side-effects.ts`
- 触ってよい範囲: notification params builder、timing log呼び出し wrapper
- 触ってはいけない範囲: push/APNS送信条件、Google Sheets payload内容、`completed` / `failed` DB更新より前後の順序
- 変更前に固定すべき挙動: completed/failed/warningの通知対象、projectId null/あり、wordCount、timing status
- 追加・更新すべきテスト: params builderの純粋test。実通知送信mockの統合testは後続。
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/scan/job-side-effects.test.ts`, `npm run verify`
- 失敗時の戻し方: adapter呼び出しを戻し、既存route内の直接呼び出しへ戻す。
- AIに投げる時の注意文: 「通知の発火タイミングを変えない。best-effortのcatch有無を変えない。DB status更新順を変えない。」

### Task 8: Home scan sessionStorage contract helperを作る

- タスク名: Home scan sessionStorage helper抽出
- 目的: `src/app/page.tsx` 内のscan confirm受け渡しkeyとpayload保存を純粋helperへ寄せ、後でProject画面と共通化できる足場を作る。
- 対象ファイル: `src/app/page.tsx`, 新規候補 `src/lib/scan/scan-session-storage.ts`
- 触ってよい範囲: `scanvocab_extracted_words`, `scanvocab_source_labels`, `scanvocab_lexicon_entries`, project name/icon/existing project keyの読み書きwrapper
- 触ってはいけない範囲: file upload、PDF expansion、Supabase Storage upload、`/api/extract` / `/api/scan-jobs/create` 呼び出し、UI state
- 変更前に固定すべき挙動: 保存するkey名、JSON shape、existing project追加時のproject name/icon削除、navigate前後のprocessing close順
- 追加・更新すべきテスト: sessionStorage helper test。JSDOMがないため、Storage-like fake objectを受け取る純粋helperとしてtestする。
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/scan/scan-session-storage.test.ts`, `npm run build`, `npm run verify`
- 失敗時の戻し方: helper importを戻し、page内の既存sessionStorage直接操作へ戻す。
- AIに投げる時の注意文: 「UI分割やhook化はしない。sessionStorage key wrapperだけ。画面文言、scan flow、API呼び出しは触らない。」

### Task 9: Project scan-to-addのsession contractをHome helperへ合わせる

- タスク名: Project scan-to-add session contract共通化
- 目的: `src/app/project/[id]/page.tsx` のscan-to-add受け渡しをHomeと同じhelperへ寄せ、`/scan/confirm` contractを一箇所に寄せる。
- 対象ファイル: `src/app/project/[id]/page.tsx`, `src/lib/scan/scan-session-storage.ts`
- 触ってよい範囲: sessionStorage保存/削除の呼び出しだけ
- 触ってはいけない範囲: repository選択、`mutationRepository`, scan file processing、share、bulk delete、filter/sort UI
- 変更前に固定すべき挙動: `scanvocab_existing_project_id` をセットする、project name/sourceLabels/lexiconEntriesを必要箇所で削除する、single/multiple scan両方で同じpayloadを渡す
- 追加・更新すべきテスト: helper testにProject scan-to-add caseを追加
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/scan/scan-session-storage.test.ts`, `npm run build`, `npm run verify`
- 失敗時の戻し方: Project側のhelper呼び出しを既存sessionStorage直接操作へ戻す。
- AIに投げる時の注意文: 「`mutationRepository` とrepository選択には触れない。scan-to-addのstorage contract以外を変更しない。」

### Task 10: Quiz question builderとstorage keyを純粋helperへ出す

- タスク名: quiz pure helper抽出
- 目的: `src/app/quiz/[projectId]/page.tsx` の `getQuizStorageKey()`、TTL、question生成を純粋helperへ出し、quiz UI本体を分ける前のtestable surfaceを作る。
- 対象ファイル: `src/app/quiz/[projectId]/page.tsx`, 新規候補 `src/lib/quiz/quiz-state.ts`
- 触ってよい範囲: storage key生成、TTL定数、generic distractor pool、`generateQuestions()` 相当の純粋処理
- 触ってはいけない範囲: repository update、spaced repetition保存、wrong answer記録、background distractor API、review/collection loading
- 変更前に固定すべき挙動: review mode keyは `quiz_state_review`、通常keyは `quiz_state_${projectId}`、30分TTL、ja-to-en/en-to-jaの選択肢生成、fallback distractors
- 追加・更新すべきテスト: `src/lib/quiz/quiz-state.test.ts` でkey、TTL expiry判定、両方向question生成、重複除外を固定
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/quiz/quiz-state.test.ts`, `npm run build`, `npm run verify`
- 失敗時の戻し方: helper抽出を戻し、page内関数へ戻す。repository/spaced repetition周りを触っていたら差分を破棄する。
- AIに投げる時の注意文: 「Quizの保存処理や回答処理は触らない。純粋なquestion/storage helperだけを抽出する。」

### Task 11: prompt contract testを増やしてからdomain別に分ける

- タスク名: prompt contract test追加と機械的分割
- 目的: `src/lib/ai/prompts.ts` を分ける前に、sourceLabels、JSON output、partOfSpeechTags、EIKEN、idiom、circled/highlighted/wrong-answerのcontractを固定する。
- 対象ファイル: `src/lib/ai/prompts.ts`, `src/lib/ai/prompts.translation-context.test.ts`, 新規候補 `src/lib/ai/prompts.contract.test.ts`
- 触ってよい範囲: prompt exportの配置、barrel export、文言を変えない機械的移動
- 触ってはいけない範囲: prompt本文の意味変更、source label rule変更、EIKEN level order変更、AI schema変更
- 変更前に固定すべき挙動: sourceLabelsに一般名詞を入れない指示、JSONのみ出力、partOfSpeechTags必須、EIKEN level以上filter、idiom/phrasal_verb分類
- 追加・更新すべきテスト: `prompts.contract.test.ts` で各promptの必須語句/JSON keyを検査。分割後も同じexportsで既存呼び出し元を壊さない。
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/ai/prompts.translation-context.test.ts src/lib/ai/prompts.contract.test.ts src/lib/ai/extract-circled-words.test.ts src/lib/ai/extract-eiken-words.test.ts src/lib/ai/extract-highlighted-words.test.ts src/lib/ai/extract-wrong-answers.test.ts`, `npm run verify`
- 失敗時の戻し方: 分割ファイルを戻し、`prompts.ts` 単一ファイルへ戻す。prompt本文の差分が出たら分割を中止する。
- AIに投げる時の注意文: 「prompt文言は変えない。export維持とtest追加が目的。品質改善や新prompt追加は禁止。」

### Task 12: Stripe webhook handler抽出はsignature / claimをrouteに残して行う

- タスク名: Stripe webhook event handler抽出
- 目的: event type別handlerをroute外へ移し、signature検証、payload hash、claim/mark processed/failedはroute側に残す。
- 対象ファイル: `src/app/api/subscription/webhook/route.ts`, 新規候補 `src/lib/subscription/stripe-webhook-handlers.ts`
- 触ってよい範囲: `handleCheckoutSessionCompleted`, `handleInvoicePaid`, `handleInvoicePaymentFailed`, `handleSubscriptionUpdated`, `handleSubscriptionDeleted`, `handleChargeRefunded` の移動、pure helper test
- 触ってはいけない範囲: `request.text()`, `stripe-signature`, `constructWebhookEvent`, `claimWebhookEvent`, `markWebhookEventProcessed`, `markWebhookEventFailed`, `WebhookError` status mapping
- 変更前に固定すべき挙動: signature missing/invalidは401、duplicate claimは200 no-op、processing errorはmark failedして500、checkout activationは `activateBillingFromSession()` を使う
- 追加・更新すべきテスト: handler helper testでinvoice subscription id、first invoice skip、unknown subscription no-op、refund cancellation payloadをfake Supabaseで固定。route signature testは後続で追加。
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/subscription/billing-activation.test.ts src/lib/subscription/stripe-webhook-handlers.test.ts`, `npm run test:security`, `npm run verify`
- 失敗時の戻し方: handler移動を戻し、route単一ファイルへ戻す。signature/claimを移動していた場合は必ずroute側へ戻す。
- AIに投げる時の注意文: 「Stripe signature検証とwebhook idempotencyはrouteから出さない。外部Stripe APIを本番keyで叩かない。」

### Task 13: reconcile routeのresponse state helperを抽出する

- タスク名: subscription reconcile response helper抽出
- 目的: `/api/subscription/reconcile` のpending/failed/confirmed response shapeをhelper化し、webhook側共通処理と混ぜずに見通しを上げる。
- 対象ファイル: `src/app/api/subscription/reconcile/route.ts`, `src/lib/subscription/reconcile-status.ts`
- 触ってよい範囲: response builder、payment status classification、failure reason mapping
- 触ってはいけない範囲: cookie auth、session ownership check、Stripe session fetch、`activateBillingFromSession()`, `markSessionFailed()`
- 変更前に固定すべき挙動: unknown session 404、forbidden 403、metadata mismatch 409、Stripe fetch failureはpending、unpaid/expiredはfailed、paidはactivationへ進む
- 追加・更新すべきテスト: `reconcile-status.test.ts` にresponse reason mappingを追加。route full mockは別タスク。
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/subscription/reconcile-status.test.ts src/lib/subscription/billing-activation.test.ts`, `npm run verify`
- 失敗時の戻し方: helper抽出を戻し、route内response literalへ戻す。
- AIに投げる時の注意文: 「課金状態更新は触らない。response shape helperだけ。Stripe API呼び出しやactivation flowを動かさない。」

### Task 14: Auth OTP lifecycleはroute contract test後に共通化する

- タスク名: Auth OTP helper抽出準備
- 目的: send/verify/signup/resetで重複するOTP取得、期限、attempts、verified更新を共通化する前に、routeごとの違いをテストで固定する。
- 対象ファイル: `src/app/api/auth/send-otp/route.ts`, `src/app/api/auth/verify-otp/route.ts`, `src/app/api/auth/signup-verify/route.ts`, `src/app/api/auth/reset-password/route.ts`
- 触ってよい範囲: OTP validationの純粋helper、test fixture、admin client操作の薄いwrapper
- 触ってはいけない範囲: Supabase Auth user作成/更新、session cookie設定、Resend送信文言、OTP code生成、service role clientをclient側へ出す変更
- 変更前に固定すべき挙動: email lower-case、invalid code attempts increment、MAX_ATTEMPTS=5、expired OTP delete、reset-passwordは存在しないemailを秘匿、signupは既存emailで409
- 追加・更新すべきテスト: 新規 `src/app/api/auth/otp.contract.test.ts` または `src/lib/auth/otp-lifecycle.test.ts` で純粋helperを固定
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/auth/otp-lifecycle.test.ts`, `npm run test:security`, `npm run verify`
- 失敗時の戻し方: helper抽出を戻し、route内処理へ戻す。Auth user/session操作を触っていたら必ず破棄する。
- AIに投げる時の注意文: 「認証フローの挙動変更は禁止。OTP共通helperだけ。ユーザー作成、password更新、session cookieは動かさない。」

### Task 15: hybrid repository / sync queueは先にretryとdestructive guard testを増やす

- タスク名: sync safety contract test追加
- 目的: `hybridRepository.fullSync()` と `syncQueue.process()` を整理する前に、空remote guard、local-only push条件、retry上限、create/update/delete順序を固定する。
- 対象ファイル: `src/lib/db/hybrid-repository.ts`, `src/lib/db/sync-queue.ts`, `src/lib/db/hybrid-repository.test.ts`, 新規候補 `src/lib/db/sync-queue.test.ts`
- 触ってよい範囲: dependency injectionを最小限追加したtestable helper、retry/dropの純粋test
- 触ってはいけない範囲: Dexie schema、`fullSync()` のdelete順、sync queue item format、remoteRepositoryのAPI contract
- 変更前に固定すべき挙動: remote empty + local dataではlocal deleteしない、pending createだけlocal-only projectをpush、retryCount>=3はdrop、失敗時はretryCount increment
- 追加・更新すべきテスト: `hybrid-repository.test.ts` にguard/pending create条件を追加、`sync-queue.test.ts` でretry/drop/process orderをfake repositoryで固定
- 実行すべき検証コマンド: `npm exec -- tsx --test src/lib/db/hybrid-repository.test.ts src/lib/db/sync-queue.test.ts`, `npm run verify`
- 失敗時の戻し方: testability用DIやhelperを戻し、現行実装へ戻す。Dexie schemaへ触った場合は中止して差分を破棄する。
- AIに投げる時の注意文: 「sync挙動変更は禁止。データ削除順、queue format、Dexie versionは触らない。まずtestだけ。」

## 4. 最初の3回分の実行計画

### 1回目

Task 1だけを実施する。`scan-jobs/process` のcontract test追加に限定し、production behaviorは変えない。完了条件は、対象testと `npm run verify` が通ること、またはroute full mockが重すぎる場合に「どのcontractが未固定か」を `TASKS.md` に残すこと。

### 2回目

Task 2だけを実施する。scan mode / provider選択helperを作り、`/api/extract` と `scan-jobs/process` の重複を挙動維持で消す。HTTP境界、usage、AI抽出呼び出しは触らない。

### 3回目

Task 3だけを実施する。background scan create / legacy routeのsave mode matrixを固定し、可能なら純粋helperへ出す。`checkAndIncrementScanUsage()`、Storage確認、`after(processJobById)` は動かさない。

この3回が終わるまで、`scan-jobs/process` のproject/word保存分離、UI hook分割、課金/auth/syncの実装分離には入らない。

## 5. まだ実装に入ってはいけない領域

### `scan-jobs/process` のserver_cloud保存処理の大移動

- なぜ危険か: project作成/更新、word insert、sourceLabels compat、example generation、rollback、lexicon job enqueue、通知が密結合している。失敗時に新規projectだけ削除する条件を壊すとデータ欠落や不要削除が起きる。
- 先に必要な確認: Task 1、5、6のcontract test。`docs/ops/scan-failure-runbook.md` の復旧点との照合。
- 必要な外部確認: 本番相当Supabaseで `scan_jobs`, `projects`, `words`, Storage `scan-images` の実データ復旧点確認。

### Stripe webhook / reconcileのidempotency周辺

- なぜ危険か: signature検証、`webhook_events` claim、`subscription_sessions` claim、`subscriptions` 更新がPro反映の根幹。二重処理や未反映が直接課金事故になる。
- 先に必要な確認: `billing-activation` とhandler helperのtest追加、Stripe test modeのevent matrix、runbookのSQL確認。
- 必要な外部確認: Stripe Dashboardのtest webhook endpoint、test secret、Checkout Session / Subscription / Invoice eventの実配送確認。Production keyでは実行しない。

### Auth OTP / session cookie処理

- なぜ危険か: OTP expiry/attempts、ユーザー作成、password更新、magic link session作成が混在し、誤るとログイン不能または認証弱体化になる。
- 先に必要な確認: Auth route contract test、Resend送信失敗時のOTP削除、Supabase Auth user状態の手動確認手順。
- 必要な外部確認: Resend Dashboard、Supabase Auth Logs、本番domain cookie設定。

### Hybrid repository / sync queue

- なぜ危険か: `fullSync()` はローカルIndexedDBを削除してremoteで置換する処理を持つ。sync queueを誤るとoffline変更が消える。
- 先に必要な確認: destructive guard、pending create、retry/dropのtest。実機ブラウザでoffline -> online復旧を確認する手順。
- 必要な外部確認: Supabase remoteが空に見える障害時の挙動、複数端末同期の手動確認。

### DB migration / RLS / shared mapper

- なぜ危険か: migration drift、RLS漏れ、mapper mismatchは全ユーザーデータへ影響する。P2-B/P2-Cの構造整理と同時に扱うべきではない。
- 先に必要な確認: live DB schema/RLS監査、migration履歴、`shared/types/index.ts` と `shared/db/mappers.ts` の影響範囲。
- 必要な外部確認: Supabase Dashboard / SQL EditorでのRLS policy確認。本番適用済みmigrationの確認。

### prompt本文の改善

- なぜ危険か: testが通っても抽出品質が変わる。sourceLabels、partOfSpeechTags、EIKEN filterの文言変更はscan結果に直結する。
- 先に必要な確認: prompt contract test、実画像での代表mode確認、AI costへの影響確認。
- 必要な外部確認: 必要ならGemini/OpenAIの実APIで、test画像を使った比較確認。

### PWA / service worker / offline cache

- なぜ危険か: build/testだけではService Worker cache、push通知、offline表示の破損を検出しにくい。
- 先に必要な確認: browser manual test、cache clear/update手順、push通知の登録/解除確認。
- 必要な外部確認: 実ブラウザまたはスマホPWAでのoffline/online切替、Web Push/APNS env確認。
