# 言い換えクイズ (paraphrase)

英単語を見て、**同じ意味の英単語**を 4 択から選ぶ解き方。`plummet → drop`、
`play a trick on → deceive` のように、英語を英語で言い換える力を測る。

四択 (`normal`) / 記述 (`typing`) / 音読 (`voice`) と並ぶ 4 つめの解き方で、選択画面
(`QuizModeChooser`) の 3 番目の札。`QuizMode` に `'paraphrase'` を足し、`QuizAnswerFormat`
(四択クイズ画面の中で解ける形式) にも含まれるので、四択・記述と同じ `/quiz/[projectId]` で動く。

## 出題材料はオープンデータ (AI は使わない)

同義語と誤答は `src/lib/paraphrase/dataset.json` という事前生成の辞書から引く。
生成は `scripts/paraphrase/build_dataset.py` (詳細は `scripts/paraphrase/README.md`)。

| データ | ライセンス |
|---|---|
| Open English WordNet | CC BY 4.0 |
| Moby Thesaurus II | パブリックドメイン |
| gwordlist (Google Books Ngram 由来の頻度表) | CC BY 3.0 |
| Princeton WordNet 3.1 (語義ごとの使用回数) | WordNet License |
| Japanese WordNet (NICT、語義ごとの日本語訳) | Japanese WordNet License |

帰属表示は `dataset.json` の `sources` に持ち、`/api/paraphrase/lookup` の応答にも載せる。

## 流れ

1. クイズ画面が単語帳の語を読むと、英語の見出し語がある語について
   `POST /api/paraphrase/lookup` を先回りして呼ぶ (`fetchParaphraseMaterials`、200 語ずつ、
   同じページ内では english ごとにメモリに覚える)。応答は材料のある語だけ:
   `{ wordId, headword, pos, answers[], distractors[] }`。
2. 選択画面の「言い換えで解く」には、材料が届いた語の数を出す (届くまでは語数を出さない)。
3. 選ぶと `generateParaphraseQuestions` が `MultipleChoiceQuizQuestion` (`type: 'paraphrase'`) を組む。
   正解は良い順の上位 3 語から重みつき (0.5 / 0.3 / 0.2) で 1 つ、誤答は 6 語から 3 つ。
   同じ見出し語の行が複数あっても 1 問にまとめる。
4. 回答・採点・SM-2・途中保存 (`sessionStorage`) は四択と同じ経路 (`handleSelect` → `applyAnswerOutcome`)。

## 画面の約束

- 出題文は英語をそのまま見せる。イディオムの前置詞を伏せる処理 (`promptIdiomSegments`) は
  言い換えでは切る (同義語を選ぶ手がかりが消える)。
- **答えるまで訳は見せない** (訳から選べてしまう)。答えたら確認用に訳を小さく出す。
- 出題する語は **語彙モード (A / P) と無関係**。分かれ目は「辞書に同義語があるか」だけ
  (`matchesAnswerFormat(word, 'paraphrase', { isParaphraseEligible })`)。
- 英語の見出し語が 1 つも無い単語帳 (古典語) では札そのものを隠す。
- 材料の取得に失敗したら、空の出題画面ではなく「取得できませんでした」と再試行を出す。
  言い換えはオンライン専用 (辞書はサーバーにだけある)。

## 単語詳細の「言い換え」

単語詳細 (モバイル `WordDetailView`、デスクトップ `DesktopWordDetailModal`) にも同じ辞書の
同義語を「言い換え」として出す。`useParaphraseSynonyms` が語源のバックフィル
(`useMorphologyBackfill`) と同じく表示時に `/api/paraphrase/lookup` を引く。
単語行には保存しない —— 辞書は決定的で同じ語には毎回同じ答えが返るので、保存しても
同期の手間が増えるだけ。辞書に無い語・古典語・オフラインでは節ごと出ない。
出典の一行 (Open English WordNet CC BY 4.0 ほか) を節の下に添える。

## 関係するファイル

| ファイル | 役割 |
|---|---|
| `scripts/paraphrase/build_dataset.py` | データセット生成 |
| `src/lib/paraphrase/dataset.json` | 生成物 (コミットする) |
| `src/lib/paraphrase/dataset.ts` | 形の検査・見出し語の解決・品詞ヒント |
| `src/lib/paraphrase/headword.ts` | 単語帳の `english` を辞書の見出し語に寄せる |
| `src/lib/paraphrase/server.ts` | サーバーだけが持つ辞書の実体 (`server-only`) |
| `src/app/api/paraphrase/lookup/route.ts` | 材料を返す API (ログイン必須・AI もコインも無し) |
| `src/lib/paraphrase/client.ts` | クライアントからの取得とキャッシュ |
| `src/lib/paraphrase/question.ts` | 問題の組み立て |
| `src/lib/quiz/answer-format-words.ts` | 解き方ごとの出題対象 (言い換えは材料の有無) |
| `src/hooks/use-paraphrase-synonyms.ts` | 単語詳細に出す同義語の取得 |
| `src/components/quiz/QuizModeChooser.tsx` | 選択画面の札 |

## 知っておくこと

- 語義は **単語帳の日本語訳で選ぶ**。`/api/paraphrase/lookup` に `japanese` と `translations`
  (語義ごとの訳) も送り、辞書側の語義ごとの日本語訳 (Japanese WordNet) と突き合わせて、合う語義だけの
  正解候補を返す (mundane = 平凡な → everyday。「この世の」の terrestrial は出さない)。合う語義が
  無ければ品詞全体の候補。品詞タグ (`partOfSpeechTags`) があれば品詞も合わせる。
  日本語 WordNet に無い語義 (約 4 割の synset) は選べないので、そこは従来どおり。
- 候補の良し悪しは `build_dataset.py` の重みで決まる。WordNet に忠実なだけの同義語
  (`plummet → plump`) をどこまで許すかはそこで調整する。
