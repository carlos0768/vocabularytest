# Home Page Maintainability Audit

> Current UI rescue note: この文書は旧 `codex/prelaunch-safety-baseline` 上での棚卸し記録です。最新UIブランチでは、最新 `src/app/page.tsx` の見た目・文言・レイアウトを正として、helper抽出候補だけを再評価してください。

作成日: 2026-05-09

目的: `src/app/page.tsx` の保守性棚卸し。今回はコード変更、リファクタ、機能追加は行わず、次に実装へ進む場合の小タスクへ分解する。

## 前提

- 公開前方針は、大規模リファクタよりも「公開後に安全に直し続けられる足場」を優先する。
- P2-C Task 1-15 は完了済み。`P2C_CHECKPOINT.md` が入口。
- `SCAN_PROCESS_NEXT_PLAN.md` Task 1-7 は完了済み。`SCAN_PROCESS_CHECKPOINT.md` が入口。
- 危険領域は、認証、課金、スキャンAPI、同期、DB migration、PWA/offline。今回の棚卸しでは触っていない。
- `src/app/page.tsx` は 1934 行。Home巨大ファイルの次作業は、実装前に1責務ずつ切る必要がある。

## 事前確認

実行した確認:

- `git status --short --branch`
  - `## main...origin/main [ahead 40, behind 259]`
- `wc -l src/app/page.tsx`
  - `1934 src/app/page.tsx`
- `find src/components/home src/lib/scan src/hooks -maxdepth 2 -type f | sort`
  - `src/components/home/InlineFlashcard.tsx`
  - `src/components/home/ProcessingModal.tsx`
  - `src/components/home/ProjectModals.tsx`
  - `src/components/home/ProjectSelectionSheet.tsx`
  - `src/components/home/ScanModeModal.tsx`
  - `src/components/home/StudyModeCard.tsx`
  - `src/components/home/WordList.tsx`
  - `src/components/home/index.ts`
  - `src/hooks/index.ts`
  - `src/hooks/use-auth.ts`
  - `src/hooks/use-collections.ts`
  - `src/hooks/use-online-status.ts`
  - `src/hooks/use-profile.ts`
  - `src/hooks/use-projects.ts`
  - `src/hooks/use-scan-jobs.ts`
  - `src/hooks/use-stats-sync.ts`
  - `src/hooks/use-user-preferences.ts`
  - `src/hooks/use-word-count.ts`
  - `src/hooks/use-words.ts`
  - `src/lib/scan/example-generation.test.ts`
  - `src/lib/scan/example-generation.ts`
  - `src/lib/scan/image-extraction.test.ts`
  - `src/lib/scan/image-extraction.ts`
  - `src/lib/scan/job-create-contract.ts`
  - `src/lib/scan/job-result-payload.test.ts`
  - `src/lib/scan/job-result-payload.ts`
  - `src/lib/scan/job-side-effects.test.ts`
  - `src/lib/scan/job-side-effects.ts`
  - `src/lib/scan/mode-provider.test.ts`
  - `src/lib/scan/mode-provider.ts`
  - `src/lib/scan/post-processing.test.ts`
  - `src/lib/scan/post-processing.ts`
  - `src/lib/scan/quiz-prefill.test.ts`
  - `src/lib/scan/quiz-prefill.ts`
  - `src/lib/scan/scan-session-storage.test.ts`
  - `src/lib/scan/scan-session-storage.ts`
  - `src/lib/scan/server-cloud-persistence.contract.test.ts`
  - `src/lib/scan/server-cloud-persistence.ts`
  - `src/lib/scan/server-cloud-result-payload.test.ts`
  - `src/lib/scan/server-cloud-result-payload.ts`
- `rg -n "scan|sessionStorage|upload|pdf|project|words|repository|useState|useEffect|useMemo|useCallback|offline|PWA|toast|router" src/app/page.tsx src/components/home src/lib/scan src/hooks`
  - `src/app/page.tsx` 側で scan、sessionStorage、upload、pdf、project、words、repository、PWA通知、toast、router が広く混在していることを確認。
  - hook数の目安: `const [` は 48 hits、`useEffect(` は 10 hits、`useMemo(` は 10 hits、`useCallback(` は 2 hits。

## `page.tsx` に残る責務

| 分類 | `page.tsx` に残っていること | 主な位置 |
|---|---|---|
| 画面表示 | session expired、loading、empty、通常Homeの3系統のreturn、ヘッダー、今日の目標、習得ドーナツ、共有/マイ単語帳、モーダル配置 | lines 1497-1934 |
| scan開始 | scan mode modal起動、Pro-only mode gating、file input起動、未ログイン/word limit gating、既存project追加か新規作成かの分岐 | lines 984-1049 |
| file upload | Pro background scan用にSupabase session取得、Web Push登録要求、canvas圧縮、Storage upload、失敗時Storage cleanup、`/api/scan-jobs/create` 呼び出し | lines 1293-1420 |
| PDF expansion | `isPdfFile()` / `expandFilesForScan()` 呼び出し、PDF処理失敗toast、ProでもPDF時は通常解析へfallbackする分岐 | lines 1025-1037, 1299-1436 |
| sessionStorage handoff | scan confirm payload/draft helper呼び出し、selected project id、generating wordbook placeholder、legacy `scanvocab_project_id` 削除 | lines 135-159, 472-503, 667-727, 1042-1045, 1059-1068, 1120-1129, 1169-1178, 1261-1274, 1442-1443, 1633, 1854 |
| repository / project / words操作 | repository選択、local-first/remote background load、home cache更新、word load、project/word CRUD、manual word追加、favorite、share id生成、distractor再生成 | lines 221-396, 721-982 |
| offline / PWA寄り処理 | `SyncStatusIndicator` 表示、push subscription同期、scan job polling結果のsystem notification、service worker / PushManager判定、home cacheのstorage restore | lines 135-159, 439-465, 553-665, 1669-1684 |
| toast / notification | `useToast()` によるscan/CRUD/share/limit通知、Notification APIによるscan job完了/失敗/grammar warning通知本文生成 | lines 104, 553-665, 740-982, 1006-1049, 1131-1153, 1276-1290, 1409-1436 |
| UI state | project selection、filters、modals、delete/edit/manual word、scan progress、pending files、scan mode、generating card、share stateなど多数のstateを単一componentで保持 | lines 113-219 |

## 既に外へ出ているもの

Homeで直接使っている抽出済みcomponent:

- `src/components/home/ScanModeModal.tsx`: scan mode / EIKEN level選択UI。
- `src/components/home/ProjectModals.tsx`: project name、edit project name、manual word input modal。
- `src/components/home/ProcessingModal.tsx`: scan processing progress表示。
- `src/components/home/ProjectSelectionSheet.tsx`: project選択、favorites/wrong/all projects切替UI。
- `src/components/project/ProjectCard.tsx`, `src/components/project/GeneratingProjectCard.tsx`: Homeの単語帳カード表示。
- `src/components/pwa/SyncStatusIndicator.tsx`: Pro時のsync表示。

Home周辺で再利用されているが、現在の `src/app/page.tsx` では直接使っていないcomponent:

- `src/components/home/StudyModeCard.tsx`: favorites / collections側で利用。
- `src/components/home/WordList.tsx`: project words / favorites / collections側で利用。`NotionCheckbox` はProject detailにも使われている。
- `src/components/home/InlineFlashcard.tsx`: sentence quiz loadingなどで利用。

Homeで直接使っているhook/helper:

- `src/hooks/use-auth.ts`: auth/subscription/session expired。
- `src/hooks/use-word-count.ts`: free word limit状態。`src/lib/home-cache.ts` を購読。
- `src/hooks/use-scan-jobs.ts`: scan job polling、realtime subscription、acknowledge。
- `src/hooks/use-collections.ts`: collections取得。ただし現在のHome JSXでは取得値が使われていない。
- `src/lib/home-cache.ts`: in-memory + session/local storage snapshot、Home cache更新/無効化。
- `src/lib/projects/load-helpers.ts`: project id群からwords mapを取得。
- `src/lib/image-utils.ts`: PDF判定/展開、画像base64化、project icon処理。
- `src/lib/scan/scan-session-storage.ts`: `/scan/confirm` 向け result payload / project draft / existing project id のStorage-like helper。
- `src/lib/notifications/push-client.ts`: Web Push subscription登録。
- `shared/source-labels.ts`, `shared/lexicon.ts`: scan resultのsource labels / lexicon entries merge。

存在するがHome本体へ未適用の汎用hook:

- `src/hooks/use-projects.ts`, `src/hooks/use-words.ts`: repository選択つきの基本CRUD hookはあるが、Home固有のlocal-first、remote background merge、home cache、stats/favorites集計までは置き換えていない。
- `src/hooks/use-online-status.ts`: online/offline検出と復帰時sync hookはあるが、Home本体では直接使っていない。

`src/lib/scan/` で既に固定済みのscan helper:

- `mode-provider`, `job-create-contract`, `scan-session-storage`, `job-result-payload`, `server-cloud-persistence`, `job-side-effects`, `server-cloud-result-payload`, `quiz-prefill`, `example-generation`, `image-extraction`, `post-processing`。
- これらは主に API route / scan process の責務を固定している。Home側に残るclient orchestration、upload、notification、UI stateはまだ別問題として残る。

## 保守性リスク

- Home data loadが、auth解決、local IndexedDB、remote Supabase、home cache、wrong answers、statsを1つの `loadProjects()` で扱っている。repository切替やcache invalidationを動かすと初回表示とProデータに影響しやすい。
- scan開始導線が、mode選択、file input、PDF展開、word limit、existing/new project、immediate `/api/extract`、background `/api/scan-jobs/create` を同じcomponent内で分岐している。
- Pro background uploadの画像圧縮とStorage uploadがinline実装で、`src/lib/image-utils.ts` の通常画像処理とは別のcanvas処理になっている。Storage cleanup条件も同じブロックにある。
- `/scan/confirm` 用keyはhelper化済みだが、selected project id、generating wordbook placeholder、legacy `scanvocab_project_id` はまだ直書き。
- local notification本文生成、Notification permission、service worker fallback、Push subscription有無判定がHomeに残っている。PWA/offline寄り変更とscan job UXが結合している。
- project/word mutationはrepository呼び出し後にReact state、home cache、word count refreshを個別更新している。操作ごとにcache更新範囲が揃っていないため、後続の抽出前に現行挙動固定が必要。
- 画面表示用のderive処理、たとえばword status counts、shared/my projects並び替え、review due linkがJSX直前に残っている。副作用はないが、巨大componentの読解負荷を上げている。
- `useCollections()` の戻り値、`accuracyPercent`、`filteredWords`、share/manual/word-list系stateやhandlerなど、現在のHome JSXからは実質的に到達しにくい可能性があるものが残っている。削除判断は挙動確認後に分けるべき。
- empty stateと通常stateで、file input、ProcessingModal、ScanModeModal、ProjectNameModal close処理が重複している。見た目変更なしで触るには小さなcomponent抽出かprops整理が必要。

## 次の実装小タスク案

1. Home表示selectorを純粋helperへ出す
   - 対象: `masteredTotal` / `learningTotal` / `unlearnedTotal`、`homeSharedProjects` / `homeMyProjects` のsort/filter。
   - 置き場所候補: `src/lib/home/home-page-selectors.ts`。
   - 検証: helper test + `git diff --check`。コードを触るため、範囲が小さくても対象testを追加する。
   - 触らない: scan、repository、auth、課金、同期、DB migration、UI文言。
2. Home専用sessionStorage keyを小さくhelper化する
   - 対象: `scanvocab_selected_project_id`, `scanvocab_generating_wordbook`, legacy `scanvocab_project_id` 削除。
   - 既存 `src/lib/scan/scan-session-storage.ts` に混ぜるか、Home専用helperに分けるかは実装前に決める。
   - 触らない: `/scan/confirm` payload shape、file upload、API呼び出し。
3. scan job local notificationのmessage builderを純粋helperへ出す
   - 対象: completed/failed/grammar warningのgrouping、title/body/tag生成。
   - Notification API呼び出し自体は後続に残し、まず本文とgroupingだけ固定する。
   - 触らない: Web Push/APNS、service worker、permission request、acknowledge。
4. immediate scan client flowを棚卸ししてからhook/helper化する
   - 対象: `processImage()` / `processMultipleImages()` のprogress step、`/api/extract` response handling、result merge。
   - 先にsuccess、limit reached、per-file failure、no words、HEIC/PDF error文言のcontractを決める。
   - 触らない: `/api/extract` route、prompt、usage increment、DB migration。
5. background upload flowを専用helper/hookへ出す
   - 対象: Supabase session取得、push subscription request、image compression、Storage upload、cleanup、`/api/scan-jobs/create`。
   - immediate scanとは別タスクにする。
   - 触らない: scan job create API contract、save_mode、Storage bucket名、課金/Pro判定の意味。
6. Home data loader hookを最後に検討する
   - 対象: local-first、remote background merge、home cache、favorites/total counts、auth解決後reload。
   - 影響が広いため、上記の副作用分離後に行う。
   - 触らない: repository選択invariant、sync queue、remote/local schema。

## 推薦する最初のタスク

最初にやるべき一番安全なタスクは「Home表示selectorを純粋helperへ出す」です。

理由:

- 副作用がないため、認証、課金、スキャンAPI、同期、DB migration、package-lockに触れない。
- 現在の `page.tsx` から表示用計算だけを切り出せる。
- helper testでsort順、shared/my分離、status countを固定できる。
- その後のscan / PWA / repository分離に入る前に、Home本体の読解負荷を少し下げられる。

実装時の最小条件:

- UI文言、並び順、表示件数、空状態は変えない。
- `src/app/page.tsx` ではhelper呼び出しへの置換だけにする。
- 変更後は helper test と `npm run lint:web` か、少なくとも対象test + `git diff --check` を実行する。広がった場合は `npm run verify`。
