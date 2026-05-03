# Merken Web Redesign API Gaps

The web redesign includes UI-first screens for correction and parser workflows. These screens are intentionally wired with mock data until the following APIs exist.

## Correction

- `POST /api/correction/analyze`
  - Input: typed text or uploaded scan reference, purpose (`eiken`, `daily`, `business`, `exam`), optional target level.
  - Output: score, summary, corrected text diff segments, issue list, wordbook candidates, usage counters.
- `GET /api/correction/history`
  - Output: current user's correction history with title, score, word count, issue counts, created date.
- `GET /api/correction/[id]`
  - Output: persisted correction result payload for the result screen.
- `POST /api/correction/[id]/save-words`
  - Input: selected correction issues or generated vocabulary candidates.
  - Output: created words or target project update result.

## Parser

- `POST /api/parser/analyze`
  - Input: typed text or uploaded scan reference, analysis depth (`svo`, `clauses`, `tree`).
  - Output: tokenized original sentence, S/V/O/M tags, clause bands, tree nodes, Japanese translation.
- `GET /api/parser/history`
  - Output: user's parser history with sentence preview, word count, clause count, created date.
- `GET /api/parser/[id]`
  - Output: persisted parser result payload for the result screen.

## Scan Flow

- Extend `/api/extract` and `/api/scan-jobs/create` scan modes from vocabulary-only extraction to workflow routing:
  - `wordbook`
  - `correction`
  - `parser`
- Add per-token/per-word OCR confidence data for `/scan/confirm`, including low-confidence flags and source text spans.

## Preferences

The settings redesign references preference groups that are not fully covered by the current `/api/user-preferences` shape:

- daily study goal
- weak-word threshold
- auto speech playback
- dark mode and text density
- export/delete-account operations

## Wrong-answers (苦手) — DS `wrong-answers.jsx` / `wrong-answers-quiz.jsx`

The DS introduces a dedicated 苦手 (weak-word) experience that the current API only partially supports through the `Word.isFavorite` flag.

- `GET /api/words/weak`
  - Output: cross-project list of words flagged as 苦手 with: `word`, last quiz outcome, miss-count, days-since-last-correct, source project name. Currently we approximate via `repository.getWords(projectId).filter(w => w.isFavorite)` which only knows about per-project favourites.
- `POST /api/words/weak/[wordId]/review-result`
  - Input: `{ correct: boolean, sessionId, durationMs }`.
  - Output: updated weak-word stats (streak, miss-count) so the DS UI can render the "残り N 個 / 連続正答 M" copy.
- `GET /api/words/weak/stats`
  - Output: top-level summary cards used in `wrong-answers.jsx` ("登録 N 語", "今週復習 M 回", "克服率 X%").

## Sentence-quiz — DS `sentence-quiz.jsx`

`POST /api/sentence-quiz` and `POST /api/sentence-quiz/lite` already exist, but the DS sentence-quiz screen requires:

- A list-mode response shape: `{ items: Array<{ wordId, sentenceWithBlank, blankIndex, distractors[], correct, contextHintJa }> }`. The current routes return one question at a time; we need either a `count` parameter or a new `POST /api/sentence-quiz/batch` for the quiz session list.
- Persisted attempt result: `POST /api/sentence-quiz/result` with `{ sessionId, items: Array<{ wordId, correct, durationMs }> }` so streaks and 苦手 promotion happen server-side.

## Word detail — DS `word-detail.jsx`

The DS notebook-card view shows etymology, multiple example sentences, related collocations, IPA, and "AI-generated insight" copy in distinct sections. Today `Word` only carries `english`, `japanese`, `distractors`, optionally `exampleSentence`/`exampleSentenceJa`. To match DS we need:

- Extend `GET /api/words/[id]` (or add `/api/word-insights/[wordId]`) with: `etymology`, `partOfSpeech`, `ipa`, `synonyms[]`, `antonyms[]`, `collocations[]`, multiple `examples[]` with `{ en, ja, source }`, plus an `insightFootnote` string.
- A `POST /api/words/[id]/regenerate-insight` endpoint to refresh just the etymology / insight block (the existing `regenerate-distractors` only covers quiz options).

## Correction / Parser stats summary — DS `correction-history.jsx` / `parser-history.jsx`

The DS history screens show a 3-column stats grid above the list. They need:

- `GET /api/correction/stats`: `{ total, monthDelta, avgScore, savedWordsTotal }`.
- `GET /api/parser/stats`: `{ totalAnalyses, monthDelta, avgClauseCount, savedWordsTotal }`.

## Parser result — clause tree response

DS `parser-result.jsx` renders a recursive `TreeNode` with main / subordinate / relative clauses, dashed connectors, and per-node S/V/O/M chips. The currently-planned `POST /api/parser/analyze` returns a flat list; expand its output to include a `tree` field shaped as:

```jsonc
{
  "kind": "main" | "sub" | "relative",
  "label": "MAIN CLAUSE",
  "tokens": [{ "text": "delivered", "tag": "V", "band": "main" }],
  "children": [/* recursive */]
}
```

## Scan modes for correction / parser

(Already noted in **Scan Flow** above; restating here so the new feature owners see the dependency.) `/api/extract` and `/api/scan-jobs/create` need a `mode` discriminator (`wordbook | correction | parser`) so the OCR pipeline routes each capture to the right downstream analyser.
