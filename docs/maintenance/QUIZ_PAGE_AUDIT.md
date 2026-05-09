# Quiz Page Maintainability Audit

> Current UI rescue note: この文書は旧 `codex/prelaunch-safety-baseline` 上での棚卸し記録です。最新UIブランチでは、最新 `src/app/quiz/[projectId]/page.tsx` の見た目・文言・レイアウトを正として、helper抽出候補だけを再評価してください。

作成日: 2026-05-09

対象: `src/app/quiz/[projectId]/page.tsx`

今回の棚卸しは docs-only。コード、API、型、schema、package-lock、migration は変更していない。

## 確認した現状

- `git status --short --branch`: `## main...origin/main [ahead 52, behind 259]`
- `src/app/quiz/[projectId]/page.tsx`: 1147 行
- 既に `src/lib/quiz/quiz-state.ts` へ question/storage key 周辺の純粋処理が一部切り出し済み

## 現在の責務分類

### データ取得

- URL / route state: `projectId`, `count`, `from`, `review`, `collectionId` を読み、通常クイズ、復習クイズ、collectionクイズを分岐している。
- repository選択: `subscription.status` と過去Pro状態から `getRepository(subscriptionStatus, wasPro)` を選ぶ。
- 通常クイズ: local/hybrid repositoryでproject ownershipを確認し、必要に応じてremote fallbackでproject/wordsを読む。
- 復習クイズ: 全projectを取得し、bulk word取得があれば使い、なければprojectごとにwordsを読む。`getWordsDueForReview()` で対象を絞る。
- collectionクイズ: `loadCollectionWords(collectionId)` でcollection横断の単語を取得する。
- background remote sync: login中かつ通常project時に `remoteRepository.getWords(projectId)` を読み、remoteの未mastered語がlocal stateより多い場合だけ `allWords` を差し替える。
- storage復元後の補正: sessionStorageに古い `vocabularyType` が残るケースを、repositoryの最新wordsで1回だけ上書きする。

### クイズ問題生成

- 初期ロード、restart、問題数選択で `generateQuizQuestions()` を呼ぶ。
- 出題数は `MAX_NORMAL_QUIZ_QUESTION_COUNT = 20` と実word数で丸める。
- 非reviewではmastered以外を優先し、全語masteredの場合のみfull listを維持する。
- `sortWordsByPriority()` による優先順が、対象選定とquestion生成の両方に関わる。
- 英→日はAI distractorがなくても即時にローカル選択肢で開始し、AIはbackground品質改善に回す。
- 日→英はAI distractorを使わず `generateQuizQuestions()` だけで開始する。

### 回答判定

- Passive 4択: `selectedIndex === currentQuestion.correctIndex` で判定する。
- Active type-in: `vocabularyType === 'active'` の時に日本語表示、英語入力。入力値と正解をtrim + lower-caseで完全一致判定する。
- Passive type-in fallbackの分岐も残っており、`quizDirection` に応じて英語/日本語の正解を選ぶ。
- 回答後に `selectedIndex`, `isRevealed`, `typeInResult`, `results` を更新する。

### 進捗/スコア表示

- Header progress barは `(currentIndex + 1) / questions.length`。
- 結果は `{ correct, total }` を回答時に加算し、完了画面でpercentageと文言を出す。
- `moveToNext()` が最後の問題で `isComplete` にし、それ以外はindexと回答UI stateを初期化する。
- review mode完了時は `goToNextReviewQuiz()` で同一ページへ `_rs` つき再遷移する。

### spaced repetition保存

- 4択とtype-inの両回答処理で、`getStatusAfterAnswer()` と `calculateNextReview()` を実行する。
- `repository.updateWord(word.id, updates)` で `status` とSM-2系fieldを保存する。
- 保存成功後、`questions` と `allWords` の該当wordへ同じupdatesを反映する。
- 保存失敗はconsole errorのみで、画面上は回答済みとして進む。

### wrong answer記録

- 不正解時に `recordWrongAnswer(word.id, word.english, word.japanese, recordProjectId, word.distractors)` を呼ぶ。
- review modeでは `word.projectId`、通常modeではrouteの `projectId` を使う。
- 正解時は `recordCorrectAnswer(false)`、全回答で `recordActivity()` を呼ぶ。

### distractor生成/API

- `needsDistractors()` はdistractorsなし、またはplaceholder `選択肢1` を不足扱いにする。
- `startQuizWithDistractors()` は先にローカル生成questionを表示し、英→日の不足分だけbackgroundで `/api/generate-quiz-distractors` にPOSTする。
- API requestは20語chunk、25秒timeout、最大3回attempt。
- 成功したdistractorsとexample sentenceを `repository.updateWord()` で保存し、`allWords` にも反映する。
- background改善は `questions` には直接反映しないため、現在進行中の4択は即時生成時点の選択肢のまま。
- `distractorError` stateとエラー画面は残っているが、現在のbackground改善pathでは主にconsole errorで継続する。

### storage復元

- `getQuizStorageKey(projectId, reviewMode)` で通常 `quiz_state_${projectId}`、review `quiz_state_review` を使う。
- `QuizPersistState` はquestions、currentIndex、selectedIndex、isRevealed、results、questionCount、quizDirection、timestampを保持する。
- state変更時、visibility hidden時にsessionStorageへ保存し、完了時とrestart時に削除する。
- 復元時は `isQuizStateExpired()` の30分TTLを見て、expiredまたはparse失敗時は削除する。
- 復元したquestionsから `allWords` を再構成し、後続effectで `vocabularyType` だけlocal DBの最新へ補正する。

### modal / toast / UI state

- この画面にtoastは見当たらない。error表示はloading、AI disabled、distractor error、question count selection、complete、main quizの条件分岐で表現している。
- UI stateは `loading`, `distractorError`, `inputCount`, `isTransitioning`, `quizDirection`, `typeInAnswer`, `typeInResult` などが画面分岐と入力制御を担当する。
- favorite toggleはmain quiz内buttonのinline handlerで `repository.updateWord(word.id, { isFavorite })` を実行し、`questions` / `allWords` を更新する。
- `backToProject()` は `router.back()` のみで、return path自体はreview next URL生成に使われる。

## 危険領域

### spaced repetition

- 4択とtype-inに同じ保存処理が重複している。片方だけ変更すると、status / SM-2 / local state反映の差分が出やすい。
- `repository.updateWord()` 失敗時も結果表示は進むため、DB保存とユーザー体感がずれる可能性がある。
- review modeでは出題対象が `getWordsDueForReview()` に依存する。status、interval、nextReviewAt相当の計算を変えると復習導線全体に影響する。

### wrong answer

- 不正解記録はlocal utilityに寄っており、recordProjectIdの選び方が通常/reviewで違う。
- `word.distractors` を渡しているため、background distractor改善やstorage復元の古いword snapshotと絡む。
- prompts側には wrong-answer domain が存在するため、将来AI wrong answer処理を触る場合はprompt contractも確認が必要。

### distractor API

- 画面から `/api/generate-quiz-distractors` を直接叩き、API response shapeをこのpageが解釈している。
- backgroundでrepository更新まで行うため、UI表示、AI API、DB/local syncが1つのcallback内に混在している。
- timeout、chunk size、retry、example sentence保存も同じ場所にあり、API仕様変更の影響範囲が広い。
- 現在進行中のquestionsは更新しないため、allWordsとquestionsでdistractors/exampleの新旧が一時的に分かれる。

### quiz state storage

- sessionStorageに `QuizQuestion[]` ごと保存するため、Word型やquestion shapeの変更が古いsnapshot復元に影響する。
- TTL、key、復元validation、復元後local補正がpage内に残る。storage helperはkey/TTLのみで、persist/restore payload全体は未分離。
- review mode keyが全project共通の `quiz_state_review` なので、review条件変更時に古い復元が混ざらないよう注意が必要。

### repository更新

- このpageはspaced repetition、distractors/example、favoriteを直接 `repository.updateWord()` で更新する。
- repositoryはsubscription状態でhybrid/local/remoteが変わるため、同期、offline、remote fallbackの前提を崩しやすい。
- background remote syncはallWordsだけを差し替え、questionsは差し替えない。進行中quizの一貫性を前提に変更する必要がある。

### 認証、課金、同期、DB migrationへの影響

- 認証: `useAuth()` のuser有無、guest user id、project ownership check、remote fallback条件に依存する。ここを変えると未ログイン/ログイン/オフラインのアクセス挙動に影響する。
- 課金: `subscription.status` / `wasPro` がrepository選択に関わる。課金状態によるlocal/hybrid/remote挙動を変えない。
- 同期: `remoteRepository` fallback、background remote sync、hybrid repository updateが同じ画面にある。sync queueやremote empty safetyの前提を崩さない。
- DB migration: Wordのspaced repetition fields、distractors、exampleSentence、vocabularyType、isFavoriteに依存する。schema/型変更なしで進める。
- API: `/api/generate-quiz-distractors` response shapeを暗黙に期待している。API route側の変更と同時にpageを動かさない。

## `src/lib/quiz/quiz-state.ts` の担当

既に切り出し済みの責務:

- `QuizDirection`: `en-to-ja` / `ja-to-en` の型。
- `QUIZ_STATE_TTL_MS`: quiz storage TTLを30分として固定。
- `getQuizStorageKey()`: 通常project keyとreview共通keyを生成。
- `isQuizStateExpired()`: TTL境界判定。30分ちょうどは有効、30分超過でexpired。
- `GENERIC_JA_DISTRACTOR_POOL` / `GENERIC_EN_DISTRACTOR_POOL`: distractor不足時のfallback pool。
- `generateQuizQuestions()`: priority順の出題選定、en-to-ja / ja-to-enの4択生成、stored distractors利用、placeholder時の他単語fallback、重複除外、generic fallback、correctIndex計算。

まだpage側に残る責務:

- sessionStorageへの保存/復元payload全体。
- questionCount clampやrestart/select countの進行制御。
- background distractor API呼び出しとrepository保存。
- 回答判定、score更新、wrong answer記録、spaced repetition保存。
- active vocab type-in modeの正解選択。

## 次に実装するなら安全そうな小タスク

1. Quiz progress / score selectorをpure helperへ出す
   - percentage、completion message、progress width、question count clampだけを対象にする。
   - repository、spaced repetition、wrong answer、distractor API、storageには触れない。

2. Type-in answer判定helperをpure helperへ出す
   - active/passive、quizDirection、trim/lower-case完全一致の判定だけを固定する。
   - recordWrongAnswer、repository.updateWord、UI componentには触れない。

3. Quiz sessionStorage persist/restore parserをStorage-like helperへ出す
   - `QuizPersistState` のserialize/parse、TTL、count clamp、invalid snapshot削除判断を固定する。
   - sessionStorage key名と既存payload shapeは変えない。spaced repetition、distractor API、repository更新には触れない。

4. Answer side-effect plan builderをpure helperへ出す
   - 正解/不正解から `recordProjectId`、wrong answer記録要否、spaced repetition update payloadを作るだけにする。
   - 実際の `repository.updateWord()` と `recordWrongAnswer()` 呼び出し順はpage側に残す。

5. Background distractor response parserをpure helperへ出す
   - API responseからdistractor/example mapとsucceeded idsを作るだけにする。
   - fetch、timeout、retry、repository.updateWord、API route、promptには触れない。

## 次回作業時の注意

- 1回1責務で進める。
- `spaced repetition`, `wrong answer`, `distractor API`, `quiz state storage`, `repository update` を同時に触らない。
- 認証、課金、同期、DB migration、API response shapeの変更は今回の候補から外す。
- 実装へ進む場合は、先に対象helperの小さなtestを追加し、page側は呼び出し置換に留める。
