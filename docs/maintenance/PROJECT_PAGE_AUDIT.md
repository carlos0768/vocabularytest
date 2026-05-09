# Project Page Maintainability Audit

> Current UI rescue note: この文書は旧 `codex/prelaunch-safety-baseline` 上での棚卸し記録です。最新UIブランチでは、最新 `src/app/project/[id]/page.tsx` の見た目・文言・レイアウトを正として、helper抽出候補だけを再評価してください。

作成日: 2026-05-09

目的: `src/app/project/[id]/page.tsx` の保守性棚卸し。今回はコード変更、リファクタ、機能追加は行わず、次に実装へ進む場合の小タスクへ分解する。

## 前提

- 公開前方針は、大規模リファクタよりも「公開後に安全に直し続けられる足場」を優先する。
- P2-C Task 1-15 は完了済み。`P2C_CHECKPOINT.md` が入口。
- `SCAN_PROCESS_NEXT_PLAN.md` Task 1-7 は完了済み。`SCAN_PROCESS_CHECKPOINT.md` が入口。
- Home巨大ファイルは棚卸しと複数の小さなhelper化が完了済み。Project detailはまだ巨大client componentとして、表示、repository選択、scan-to-add、share、bulk delete、modal stateを同時に持っている。
- 危険領域は、認証、課金、スキャンAPI、同期、DB migration、share公開範囲、bulk delete、favorite / wrong answer / spaced repetition。今回の棚卸しでは触っていない。

## 事前確認

実行した確認:

- `git status --short --branch`
  - `## main...origin/main [ahead 48, behind 259]`
- `wc -l src/app/project/[id]/page.tsx`
  - `1571 src/app/project/[id]/page.tsx`
- `rg -n "useState|useEffect|useMemo|useCallback|fetch|router|scan|share|delete|favorite|collection|repository|sessionStorage" src/app/project/[id]/page.tsx`
  - importsで `localRepository`, `remoteRepository`, `scan-session-storage` を参照。
  - stateはproject/words/loading、share、word/project delete、manual word、scan mode/progress、filter/search/sort、select/bulk deleteに集中。
  - data loadはHome cache、local preload、remote updateの3段階。
  - `fetch` は `/api/extract` と `/api/regenerate-distractors`。
  - `sessionStorage` はscroll復元、scan confirm handoff、quiz state削除。
  - `router` はsubscription、scan confirm、home、word detail遷移。

## 責務分類

| 分類 | `page.tsx` に残っていること | 主な位置 |
|---|---|---|
| データ取得 | Home cacheからの即時復元、auth解決後のlocal preload、Pro/online時のremote update、guest fallback、project visit記録、offline cache保存 | lines 130-288 |
| words / project 表示 | loading / not found /通常表示、ヘッダー、stats card、word table、bottom action bar、safe area / standalone背景補正 | lines 819-900, 902-1350 |
| filter / sort / search | 検索文字列、bookmark、active/passive、品詞filter、sort order、filteredWords、availablePartsOfSpeech、filter panel UI | lines 112-119, 827-868, 1006-1299 |
| word操作 | 単語削除、手動追加、単語更新、訳変更時のdistractor再生成、favorite、vocabulary type変更、status変更、word detail遷移時のscroll保存 | lines 488-676, 1221-1284 |
| project操作 | project名編集、project削除、home cache invalidation、word count refresh、homeへ遷移 | lines 775-817, 1388-1487 |
| scan-to-add | Pro-only scan mode gating、PDF expansion、image processing、FileReader base64化、`/api/extract` 呼び出し、single/multiple progress、sourceLabels / lexiconEntries merge、`/scan/confirm` handoff | lines 304-486, 1416-1426, 1488-1509, 1526-1567 |
| share | Pro/user限定のshare sheet起動、shareId生成、private初期化、shareScope更新、invite code copy、sheet props | lines 678-773, 957-967, 1511-1523 |
| bulk delete | select mode、selectedWordIds、select all、選択中bottom bar、確認modal、逐次 `deleteWord()`、state/cache/word count更新 | lines 121-125, 513-549, 1302-1321, 1379-1386 |
| modal / toast / UI state | delete word/project、bulk delete、manual word、word limit、edit name、add method sheet、scan mode modal、processing modal、toast | lines 79-125, 493-817, 1352-1567 |

## 危険領域

- repository選択
  - `defaultRepository` はsubscription状態から選ばれ、`activeRepository` はlocal/remote表示元として切り替わる。
  - `mutationRepository` はPro active時に常に `hybridRepository` を使う特別扱いがある。コメント上も、Proでremoteだけへ書くとIndexedDBを読むクイズ等が古くなるための安全策。
  - local-first / remote update / fallbackの順序を動かすと、Pro同期、offline表示、guest data leakage防止に影響しやすい。
- scan-to-add sessionStorage
  - `prepareScanConfirmForExistingProject(sessionStorage, project.id)` と `saveScanConfirmResultPayload()` が `/scan/confirm` への受け渡し境界。
  - Project側は既存project追加として扱うため、staleなproject draftやsource/lexicon payloadの削除条件を壊すと、別projectへの追加や新規作成扱いの混入が起きやすい。
  - scroll復元用 `project-scroll-${projectId}`、quiz state削除用 `quiz_state_${projectId}` も同じcomponentにあるため、Storage helper化時は用途を混ぜない。
- share公開範囲
  - shareId生成は `remoteRepository.generateShareId()`、share scope更新は `mutationRepository.updateProject(project.id, { shareScope })`。
  - UIではPro/user条件で起動し、scopeは `public` / `private` のみへ正規化している。
  - 公開範囲変更は外部閲覧面へ直結するため、表示component抽出とrepository mutationの抽出を同時に行わない。
- bulk delete
  - `selectedWordIds` をSetで保持し、filteredWordsからselect allし、選択IDを逐次 `mutationRepository.deleteWord()` している。
  - 途中失敗時の部分削除、local state更新、home cache invalidation、word count refreshの関係が未固定。
  - favorite / status / spaced repetition / wrong answerの関連データ削除がrepository側でどう扱われるかを、画面だけ見て判断しない。
- favorite / wrong answer / spaced repetition
  - Project detailはfavorite (`isFavorite`)、status (`new` / `review` / `mastered`)、vocabulary type (`active` / `passive`) を直接更新する。
  - wrong answerやspaced repetitionの本体処理はQuiz側・repository側に寄っているが、この画面のstatus / vocabulary type / distractor更新がQuiz導線と同じwordsを読む。
  - `quiz_state_${projectId}` 削除はvocabulary type変更時だけ。spaced repetitionやwrong answerに近い変更を同時に触ると残存quiz stateとの整合リスクがある。
- 認証、課金、同期、DB migrationに影響しそうな箇所
  - 認証: `useAuth()` の `user`, `subscription`, `isPro`, `authLoading` によってload、scan mode gating、share可否が変わる。
  - 課金: Pro-only scan mode、share button、repository選択、word limit modalがsubscription状態に依存する。
  - 同期: Pro active時の `hybridRepository` mutation、`cacheProjectForOffline()`, `invalidateHomeCache()`, `refreshWordCount()` が画面操作に散在している。
  - DB migration: この画面からはmigrationを直接触らないが、project / word / shareScope / shareId / vocabularyType / distractors / status / favoriteのschema意味に依存する。

## 既に外へ出ているもの

- `src/lib/scan/scan-session-storage.ts`
  - Project scan-to-addのexisting project id準備とscan result payload保存に使われている。
- `src/components/home/ScanModeModal.tsx`
  - scan mode / EIKEN level選択UI。
- `src/components/home/ProjectModals.tsx`
  - `ManualWordInputModal` をProject detailでも利用。
- `src/components/project/ProjectShareSheet.tsx`
  - share sheet表示、scope選択、invite copy UI。
- `src/components/project/VocabularyTypeButton.tsx`
  - active/passive切替UI。
- `src/components/home/WordList.tsx`
  - `NotionCheckbox` をstatus切替UIとして再利用。
- `src/lib/vocabulary-type.ts`
  - vocabulary typeの次値計算。
- `src/lib/home-cache.ts`
  - Home cache復元、project words cache取得、cache invalidation。
- `src/lib/offline/recent-project-offline.ts`
  - 最近開いたprojectのoffline cache。

## 保守性リスク

- `ProjectDetailPage` がdata load、mutation、scan client flow、share、bulk delete、table UI、modal群を一括で持っているため、1変更の影響範囲が読みにくい。
- data loadはHome cache、local repository、remote repository、default repository fallbackを同一effect群で扱う。auth解決前後とuser切替時の条件を不用意に変更しやすい。
- `mutationRepository` のPro active時 `hybridRepository` 強制は重要なinvariant。抽出時に単純な `activeRepository` へ置き換えるとQuiz/IndexedDB側が古くなる可能性がある。
- scan-to-addはHome immediate scan flowと近いが、existing project追加、sessionStorage key、PDF展開、progress label、single/multiple処理がProject内に残る。Home helperを流用する場合もProject固有のexisting project準備を壊さない確認が必要。
- shareはremote shareId生成とscope更新が画面に近い。shareScopeのpublic/privateは外部公開に直結するため、UI整理だけのつもりでrepository更新条件を動かさない。
- bulk deleteは逐次削除で、途中失敗時の挙動が明文化されていない。部分成功時のUI state/cache/word countが現状通りか、実装前にcontract化した方がよい。
- word更新は訳変更時だけ `/api/regenerate-distractors` をbest-effortで呼ぶ。AI preference、API失敗時の握りつぶし、distractor上書き条件を他のword mutationと混ぜない。
- favorite/status/vocabulary type更新はQuiz導線と同じwordデータに作用する。特にvocabulary type変更だけquiz stateを消す現行条件は、抽出前に固定しないと退行しやすい。
- `editingWordId` はstate宣言だけで、現行JSXからは到達していないように見える。削除や整理は今回しない。後続で使われていないstate整理をするなら、UI導線確認を別タスクにする。
- `headerTo` と `safeProjectIcon` も現行JSXでは実質未使用に見える。これも削除判断は別タスク。

## 次の実装小タスク案

1. Project表示selectorを純粋helperへ出す
   - 対象: stats、filteredWords、availablePartsOfSpeech、`posLabel` 相当。
   - 置き場所候補: `src/lib/project/project-page-selectors.ts`。
   - 触らない: repository、scan、share、bulk delete、word mutation、認証、課金、同期、DB migration。
2. Project scan progress step builderをpure helperへ出す
   - 対象: single/multiple scanのprogress step初期値、active/complete/error label更新。
   - `/api/extract` 呼び出し、FileReader、PDF expansion、sessionStorage保存は残す。
   - Homeの `home-scan-progress.ts` と似ているが、Project固有の文言とflow差分を先にtestで固定する。
3. Project scan result accumulatorをpure helperへ出す
   - 対象: multiple scanのwords/sourceLabels/lexiconEntries蓄積、0件判定、confirm payload作成前のデータ形。
   - 触らない: sessionStorage key、existing project id準備、router遷移、`/api/extract`。
4. Project word filter/sort selectorを先にcontract化する
   - Task 1をさらに小さく切る場合の候補。検索、bookmark、active/passive、品詞、sort orderだけを固定する。
   - bulk selectのselect allが `filteredWords` に依存するため、bulk delete実装整理より先に安全柵になる。
5. Bulk deleteの現行挙動をcontract testまたは文書で固定してからhelper化する
   - 対象: selected IDs、filteredWords select all、逐次削除、途中失敗時、cache invalidation、word count refresh。
   - 触らない: repository削除の意味、関連テーブル削除、DB migration、sync queue。

## 推薦する最初のタスク

最初にやるべき一番安全なタスクは「Project表示selectorを純粋helperへ出す」です。

理由:

- 副作用がないため、認証、課金、スキャンAPI、同期、DB migration、package-lockに触れない。
- stats / filter / sort / parts of speech / pos label は現在の巨大componentの読解負荷を下げやすい。
- bulk deleteのselect allが `filteredWords` に依存するため、後続でbulk deleteを触る前の安全柵になる。
- helper testで検索、bookmark、active/passive、品詞、sort順、元配列非破壊を固定できる。

実装時の最小条件:

- UI文言、表示順、filter条件、sort条件、空状態は変えない。
- `src/app/project/[id]/page.tsx` ではhelper呼び出しへの置換だけにする。
- scan-to-add、share、bulk delete、repository選択、favorite/status/vocabulary type更新には触れない。
- 変更後は helper test と `git diff --check` を実行する。範囲が広がった場合は `npm run lint:web` 以上を実行する。
