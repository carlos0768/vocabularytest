# Home Scan Client Flow Audit

作成日: 2026-05-09

目的: `src/app/page.tsx` のHome scan client flowを棚卸しし、次に安全に実装できる小タスクへ分解する。今回はコード変更、リファクタ、機能追加は行っていない。

## 前提

- 公開前方針は、大規模リファクタよりも「公開後に安全に直し続けられる足場」を優先する。
- P2-C Task 1-15 と `SCAN_PROCESS_NEXT_PLAN.md` Task 1-7 は完了済み。
- Home巨大ファイル整理は `HOME_PAGE_AUDIT.md` から開始済みで、表示selector、Home専用sessionStorage、scan job local notification message builderは既に外へ出ている。
- この棚卸しでは scan API、file upload、PDF処理、Storage bucket名、API request/response shape、認証、課金、同期、DB migration、package-lock、API route、UI文言、画面遷移、toast文言、modal表示条件を変更していない。

## 事前確認

実行した確認:

- `git status --short --branch`
  - `## main...origin/main [ahead 44, behind 259]`
  - 作業開始時点で未コミットのファイル差分は表示されなかった。
- `rg -n "handleScanModeSelect|handleImageSelect|processImage|processMultipleImages|handleProjectNameConfirm|/api/extract|/api/scan-jobs/create|expandFilesForScan|isPdfFile|processImageToBase64|createBrowserClient|storage|scanUploadStatus|pendingFile|pendingFiles" src/app/page.tsx src/app/scan/page.tsx src/lib/image-utils.ts src/lib/scan src/lib/home`
  - Homeでは `src/app/page.tsx` の `handleScanModeSelect`, `handleImageSelect`, `processImage`, `processMultipleImages`, `handleProjectNameConfirm` にscan client flowが集中している。
  - `/scan` pageにも `expandFilesForScan`, `processImageFile`, `processImageToBase64`, Storage upload, `/api/extract`, `/api/scan-jobs/create` の類似flowがある。
- `sed -n '950,1455p' src/app/page.tsx`
  - Homeのscan mode選択、file選択、PDF展開、immediate `/api/extract`、Pro background upload、Storage cleanup、`/api/scan-jobs/create`、pending generating card、progress/modal stateを確認した。
- 追加で `src/lib/image-utils.ts`, `src/lib/scan/scan-session-storage.ts`, `src/lib/home/home-session-storage.ts`, `src/lib/home/home-scan-job-notifications.ts` を読み、既に外へ出ている責務を確認した。

## Flow Map

### scan mode選択

対象: `src/app/page.tsx` lines 949-969

- `handleScanButtonClick(addToExisting)` が `isAddingToExisting` を保存し、`ScanModeModal` を開く。
- `handleScanModeSelect(mode, eikenLevel)` は `circled`, `eiken`, `idiom` をPro-onlyとして扱い、free userならmodalを閉じて `/subscription` へ遷移する。
- Pro check通過後に `selectedScanMode`, `selectedEikenLevel` をstateへ保存し、hidden file inputを開く。
- file picker表示中はmodalを開いたままにし、file inputの `onChange` 側で `setShowScanModeModal(false)` している。

### word limit / Pro判定

対象: `src/app/page.tsx` lines 957-988, 1263-1401

- mode単位のPro判定は `handleScanModeSelect()` にある。
- scan開始時の認証判定は `handleImageSelect()` にあり、未ログインならログインtoastを出す。
- free userで `isAtLimit` の場合は `WordLimitModal` を開き、file/PDF処理へ進まない。
- background scan利用条件は `handleProjectNameConfirm()` の `isPro && user && !hasPdf && files.length <= 20`。
- ProでもPDFまたは21枚以上の場合は通常解析へfallbackする設計のtoast分岐がある。

注意点:

- `handleImageSelect()` でPDFを先に画像へ展開して `pendingFiles` に入れるため、`handleProjectNameConfirm()` の `hasPdf` はHomeから通常到達するPDF選択ではfalseになりやすい。つまり「PDFは画像化して通常解析モードで処理します」のfallback分岐は、現行flowでは到達条件を再確認する必要がある。

### PDF expansion

対象: `src/app/page.tsx` lines 990-1002, `src/lib/image-utils.ts` lines 17-137

- `handleImageSelect()` が受け取った `files` にPDFが含まれる場合、`expandFilesForScan(files)` を呼ぶ。
- `expandFilesForScan()` はPDFを `convertPdfToImageFiles()` でページごとのJPEG `File` に展開し、それ以外のfileはそのまま返す。
- PDF制限は `MAX_PDF_SIZE = 20MB`, `MAX_PDF_PAGES = 20`。PDF.js workerはブラウザでCDN worker URLを設定する。
- PDF展開に失敗した場合はtoastで `PDFの処理に失敗しました` またはerror messageを表示して終了する。

保守メモ:

- PDFが展開された後は元PDFかどうかの情報が `File[]` から消える。後続のbackground可否判定やtoast条件を触る前に、現行の「元PDFをどう扱うか」をcontractとして固定する必要がある。

### existing project追加

対象: `src/app/page.tsx` lines 1004-1013

- file/PDF展開後、`pendingFile` には先頭file、`pendingFiles` には全fileを保存する。
- `isAddingToExisting && currentProject` の場合はProject name modalを出さず、`setScanConfirmExistingProject(sessionStorage, currentProject.id)` の後に `processMultipleImages(scanFiles)` を呼ぶ。
- existing project追加はHomeではimmediate scan flowに入り、Pro background upload branchは通らない。
- `setScanConfirmExistingProject()` は `scanvocab_existing_project_id` を保存し、`scanvocab_project_name` / `scanvocab_project_icon` を削除する。

保守メモ:

- existing project追加時も `pendingFile` / `pendingFiles` は一度setされるが、この分岐ではProject name modalを経由しないため、成功/失敗後のclear条件を後続タスクで確認する余地がある。
- 失敗時に `scanvocab_existing_project_id` が残る可能性を変える場合は、`/scan/confirm` handoffとProject detail側のscan-to-add flowを同時に確認する必要がある。

### immediate scan: `/api/extract`

対象: `src/app/page.tsx` lines 1016-1119

- `processImage(file)` は単一file用の通常解析flow。
- progress stateは `upload` active、`analyze` pendingで開始し、base64変換後に `upload` complete、`analyze` activeへ進む。
- 新規project draftがsessionStorageにある場合、`pendingGeneratingWordbook` を表示する。
- `processImageToBase64(file)` でPDF/HEIC/画像圧縮を通し、`/api/extract` へPOSTする。
- request bodyは `{ image: base64, mode: selectedScanMode, eikenLevel: selectedEikenLevel }`。
- `result.limitReached` の場合はpending cardとprogressを解除し、`scanInfo` を保存して `ScanLimitModal` を開く。
- success時は `scanInfo` を更新し、`saveScanConfirmResultPayload()` で `words`, merged `sourceLabels`, merged `lexiconEntries` をsessionStorageへ保存して `/scan/confirm` へ遷移する。
- error時はpending cardを消し、HEIC/HEIFやdata URL pattern errorを含むmessageをprogress stepのerror labelへ反映する。

### multiple image immediate scan

対象: `src/app/page.tsx` lines 1121-1256

- `processMultipleImages(files)` は複数fileを順番に処理する。
- fileごとにprogress stepを作り、現在処理中のfileだけactiveにする。
- 各fileで `processImageToBase64()` と `/api/extract` を実行する。
- 画像処理失敗またはAPI失敗は、そのfileのprogressだけerrorにして次fileへ進む。
- `limitReached` は即時returnし、`ScanLimitModal` を開く。
- successしたfileの `words`, `sourceLabels`, `lexiconEntries` を累積し、最後にsessionStorageへ保存する。
- 全fileで `allWords.length === 0` の場合は `画像から単語を読み取れませんでした` をerror stepへ表示する。
- 保存後は `navigate` stepを追加し、pending cardを消して `/scan/confirm` へ遷移する。

保守メモ:

- single/multipleで `/api/extract` request、response parse、limit handling、scanInfo更新、sessionStorage保存が重複している。
- multipleは `any[]` accumulatorを使っており、response shape変更に気づきにくい。

### `/scan/confirm` へのsessionStorage handoff

対象: `src/app/page.tsx` lines 1024-1033, 1085-1095, 1134-1143, 1226-1240, 1403-1414; `src/lib/scan/scan-session-storage.ts`

- `src/lib/scan/scan-session-storage.ts` が `/scan/confirm` 用keyを管理する。
- result payload key:
  - `scanvocab_extracted_words`
  - `scanvocab_source_labels`
  - `scanvocab_lexicon_entries`
- new project draft key:
  - `scanvocab_project_name`
  - `scanvocab_project_icon`
- existing project key:
  - `scanvocab_existing_project_id`
- free/fallback immediate flowでは `saveScanConfirmProjectDraft(sessionStorage, { projectName, projectIcon })` 後に `processImage()` / `processMultipleImages()` を呼ぶ。
- existing project flowでは `setScanConfirmExistingProject()` を先に呼び、result payload保存後に `/scan/confirm` へ遷移する。
- `clearLegacyHomeProjectId(sessionStorage)` は旧 `scanvocab_project_id` を削除するために使われている。

### Pro background upload

対象: `src/app/page.tsx` lines 1258-1386

- `handleProjectNameConfirm()` が `isPro && user && !hasPdf && files.length <= 20` を満たす場合にbackground uploadへ進む。
- `scanUploadStatus` を `uploading` にし、新規project作成時は `pendingGeneratingWordbook` を表示する。
- Supabase browser clientからsessionを取得し、access tokenがなければ `認証が必要です` で失敗する。
- `ensureWebPushSubscription({ requestPermission: true })` を `void` で起動し、upload本体は待たない。
- fileをStorageへ上げた後、`/api/scan-jobs/create` を呼び、成功時に返った `jobId` をpending cardの `linkedJobId` へ入れる。
- `refreshJobs()` を呼び、background job polling/realtime側の更新に委ねる。

保守メモ:

- Homeのexisting project追加はProject name modalを経由しないため、このbackground branchには通常入らない。
- background uploadの画像圧縮は `src/lib/image-utils.ts` の `compressImage()` ではなく、Home inlineのcanvas処理で実装されている。

### Supabase Storage upload / cleanup

対象: `src/app/page.tsx` lines 1277-1342, 1357-1360

- Storage bucketは `scan-images`。
- upload pathは `${user.id}/${Date.now()}-${i}-${randomSuffix}${ext}`。
- random suffixは `crypto.randomUUID()` があれば使い、なければ `Math.random().toString(36).slice(2)`。
- imageはHome inline canvasで最大1600px、JPEG quality 0.7へ圧縮する。
- upload失敗時は、その時点までにupload済みのpathsを `remove(uploadedPaths)` でcleanupする。
- `/api/scan-jobs/create` がnon-OKの場合も、全uploaded pathsをcleanupしてからerrorをthrowする。
- create成功後はStorage cleanupしない。background workerがStorage pathを使うため。

### `/api/scan-jobs/create`

対象: `src/app/page.tsx` lines 1344-1373

- endpointは `/api/scan-jobs/create`。
- headersは `Content-Type: application/json` と `Authorization: Bearer ${session.access_token}`。
- request body:
  - `imagePaths: uploadedPaths`
  - `projectTitle: projectName`
  - `projectIcon: projectIcon ?? null`
  - `scanMode: selectedScanMode`
  - `eikenLevel: selectedScanMode === 'eiken' ? selectedEikenLevel : null`
- non-OK時はresponse JSONの `error` をmessageに使い、なければ `ジョブの作成に失敗しました`。
- success responseで `jobId` がstringならpending cardへ紐づけ、そうでなければpending cardを消す。

### pending generating card

対象: `src/app/page.tsx` lines 187-198, 487-506, 1016-1033, 1121-1143, 1267-1276, 1363-1372, 1417-1421, 1504-1513, 1581-1590, 1710-1715

- immediate new projectでは、sessionStorageのproject draftからpending cardを出し、成功遷移またはerrorで消す。
- Pro background new projectでは、Project name confirm直後にpending cardを出し、jobId取得後に `linkedJobId` を持たせる。
- `/scan` pageからHomeへ戻った場合のpending cardは `consumeHomeGeneratingWordbook()` で復元される。
- linked jobが `completed` または `failed` になったらpending cardと `scanvocab_generating_wordbook` を消す。
- empty stateと通常Homeの両方で `GeneratingProjectCard` を表示する。

### toast / modal / progress state

対象: `src/app/page.tsx` lines 187-210, 971-1002, 1017-1256, 1267-1414, 1417-1421, 1542-1577, 1768-1798

- scan関連state:
  - `processing`
  - `processingSteps`
  - `scanInfo`
  - `pendingGeneratingWordbook`
  - `showScanLimitModal`
  - `showWordLimitModal`
  - `showProjectNameModal`
  - `scanUploadStatus`
  - `showScanModeModal`
  - `isAddingToExisting`
  - `pendingFile`
  - `pendingFiles`
  - `selectedScanMode`
  - `selectedEikenLevel`
- toast:
  - 未ログイン
  - PDF処理失敗
  - Pro PDF fallback warning
  - 21枚以上fallback warning
  - background upload失敗
- modal:
  - `ScanModeModal`
  - `ScanLimitModal`
  - `WordLimitModal`
  - `ProjectNameModal`
  - `ProcessingModal`
- `ProjectNameModal` close時はmodalを閉じ、upload status、pending files、project icon draft、未linked pending cardをclearする。
- `ProcessingModal` はerror stepがある場合だけclose handlerを渡し、closeでpending card、processing、stepsをclearする。

## 既に外へ出ているhelper

### `src/lib/image-utils.ts`

- PDF判定: `isPdfFile(file)`。
- PDF展開: `expandFilesForScan(files)` -> `convertPdfToImageFiles(file)`。
- HEIC/HEIF変換: `convertHeicToJpeg(file)`。
- 画像圧縮: `compressImage(file, profile)`。
- immediate scan用base64: `processImageToBase64(file, profile)`。
- project icon処理: `processProjectIconFile(file)`。

注意点:

- Home immediate scanは `processImageToBase64()` を使っている。
- Home background uploadは `compressImage()` を使わず、inline canvasで別圧縮している。

### `src/lib/scan/scan-session-storage.ts`

- `/scan/confirm` 用のresult payload、project draft、existing project idをStorage-like helperとして管理している。
- `saveScanConfirmResultPayload()` はwords/sourceLabels/lexiconEntriesをJSON保存する。
- `saveScanConfirmProjectDraft()` はproject name/iconを保存し、iconなしならicon keyを削除する。
- `setScanConfirmExistingProject()` はexisting project idを保存し、project name/iconを削除する。
- `prepareScanConfirmForExistingProject()` はProject detail側向けにsourceLabels/lexiconEntriesも削除する。
- `getScanConfirmProjectDraft()` はexisting project idがある場合はnullを返す。

注意点:

- Home existing project flowは `setScanConfirmExistingProject()` を使っており、`prepareScanConfirmForExistingProject()` ではない。成功時にresult payloadは上書きされるが、失敗時のstale key扱いは後続タスクで固定してから触る。

### `src/lib/home/home-session-storage.ts`

- Home専用keyをStorage-like helperとして管理している。
- `scanvocab_selected_project_id` の保存/読込。
- `scanvocab_generating_wordbook` の読込、JSON parse、読込後削除、invalid payloadのnull扱い。
- legacy `scanvocab_project_id` の削除。

### `src/lib/home/home-scan-job-notifications.ts`

- scan job local notificationの本文生成をpure helper化済み。
- grouping key、`job.result` JSON parse、`wordCount` 抽出、`grammar_not_found` warning判定、completed/failed/grammar warningのtitle/body/tag生成を担当する。
- Notification API、permission request、service worker fallback、Push subscription有無判定、acknowledgeはまだ `src/app/page.tsx` に残っている。

## `page.tsx` に残る保守性リスク

- scan mode選択、auth/word limit gating、PDF expansion、existing/new project分岐、immediate scan、background upload、Storage cleanup、modal/progress stateが1つのcomponentに残っている。
- PDFをfile選択直後に展開するため、後続branchで「元PDFだったか」を判断しにくい。
- single/multiple immediate scanで `/api/extract` request、response parse、limit handling、scanInfo更新、result payload保存が重複している。
- multiple immediate scanはfile単位の失敗をcontinueするため、progress表示、最終error、partial successのcontractを固定してからhelper化する必要がある。
- background uploadの画像圧縮は `image-utils` と別実装で、圧縮サイズ/quality/profileの意味が分散している。
- Supabase session取得、Web Push permission request、Storage upload、cleanup、`/api/scan-jobs/create` がUI stateと同じ関数にある。
- `/api/extract` と `/api/scan-jobs/create` のrequest/response shapeがHome inlineで組み立てられている。
- existing project追加はProject name modalをskipし、Proでもbackground uploadへ行かない。これを変える場合は画面遷移、sessionStorage handoff、scan job create contractに影響する。
- pending generating cardはimmediate flow、Home background flow、`/scan` page handoffの3入口で使われるため、clear条件を無自覚に変えるとphantom cardや早消えが起きやすい。
- Notification message builderは外へ出たが、permission request、service worker fallback、Push subscription有無判定はHomeに残る。

## 次の実装候補

1. immediate scan progress step builderをpure helperへ出す
   - 対象: single/multipleの初期step、file active/complete/error、navigate step、error message反映。
   - 置き場所候補: `src/lib/home/home-scan-progress.ts`。
   - 触らない: `/api/extract` 呼び出し、sessionStorage、PDF、file upload、UI文言。
   - 検証: helper testで既存label/statusを固定し、`git diff --check` と対象testを実行する。

2. immediate scan result accumulatorをpure helperへ出す
   - 対象: `/api/extract` success resultの `words`, `sourceLabels`, `lexiconEntries` 累積と、empty words判定。
   - 置き場所候補: `src/lib/home/home-immediate-scan-results.ts`。
   - 触らない: `/api/extract` request/response shape、fetch、usage increment、prompt、DB migration。
   - 検証: helper testでsingle/multiple、sourceLabels merge、lexiconEntries merge、empty wordsを固定する。

3. `/api/extract` client response handlingを小さく整理する
   - 対象: `limitReached`, `scanInfo`, error message候補、success payload保存前の判定。
   - 先にTask 1/2でpure部分を固定してから進める。
   - 触らない: API route、request body、response body、toast/modal文言。

4. `/api/scan-jobs/create` request payload builderをpure helperへ出す
   - 対象: `imagePaths`, `projectTitle`, `projectIcon`, `scanMode`, `eikenLevel` のbody作成。
   - 置き場所候補: `src/lib/home/home-background-scan-job.ts`。
   - 触らない: endpoint、headers、Authorization、Storage bucket名、API response handling。

5. background upload image preparationを専用helperへ出す
   - 対象: Home inline canvas圧縮、contentType、extension、path suffix前のblob準備。
   - `src/lib/image-utils.ts` との責務重複を解消する候補だが、file/blob/canvasを触るためTask 1-4より後にする。
   - 触らない: Storage bucket名、upload path形式、cleanup条件、`/api/scan-jobs/create` body。

6. background upload orchestrationをhook/helperへ出す
   - 対象: Supabase session取得、Web Push subscription request、Storage upload、cleanup、job create、jobId反映。
   - 認証、Storage、API、UI stateが絡むため、最後に小さく切る。
   - 触らない: Pro判定、save_mode、scan API、DB migration、package-lock。

## 最初に実装するべき一番安全なタスク

最初に実装するべきタスクは「immediate scan progress step builderをpure helperへ出す」です。

理由:

- API、file upload、PDF処理、Storage、認証、課金、同期、DB migrationに触れない。
- UI文言を変えずに、既存label/statusをtestで固定できる。
- `processImage()` / `processMultipleImages()` の読解負荷を下げ、次のresult accumulator抽出へ進みやすくなる。
- 失敗しても影響範囲がprogress state作成に限定される。

実装時の最小条件:

- `src/app/page.tsx` はhelper呼び出しへの置換だけにする。
- progress label、step id、status遷移、modal close条件を変えない。
- `/api/extract` request/response、sessionStorage、PDF expansion、background upload、Storage bucket名、toast/modal文言は触らない。
- helper test、`git diff --check`、必要に応じて `npm run lint:web` を実行する。
