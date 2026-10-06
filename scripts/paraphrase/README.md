# 言い換えクイズのデータセット生成

`src/lib/paraphrase/dataset.json` を作るパイプライン。言い換えクイズ (英単語 → 同じ意味の英単語を
4 択で選ぶ。`plummet → drop`、`play a trick on → deceive`) の出題材料を、AI を使わず
オープンデータだけから事前に組み立ててコミットする。

```bash
python3 scripts/paraphrase/build_dataset.py            # .cache/paraphrase-sources にデータ源を落として生成
python3 scripts/paraphrase/build_dataset.py --inspect plummet,deceive,"play a trick on"   # 個別に確認
```

PyYAML が必要 (`pip install pyyaml`)。初回はデータ源のダウンロードと YAML の解釈で数分かかる
(解釈結果は JSON でキャッシュされる)。生成は決定的 (固定シード) なので、同じデータ源からは同じ
JSON ができる。

## データ源とライセンス

| データ | 用途 | ライセンス |
|---|---|---|
| [Open English WordNet](https://github.com/globalwordnet/english-wordnet) (`src/yaml/*.yaml`) | 同義語集合 (synset)・上位語・形容詞の類似語・語義の順序 | CC BY 4.0 (Princeton WordNet 由来) |
| [Moby Thesaurus II](https://github.com/zeke/moby) (npm `moby` の `words.txt`) | 連想的な広い同義語リスト。WordNet の裏取りと、誤答から同義語を外すのに使う | パブリックドメイン |
| [gwordlist](https://github.com/hackerb9/gwordlist) (`frequency-alpha-alldicts.txt`) | 語の頻度順位 (Google Books Ngram 由来) | CC BY 3.0 |
| [Princeton WordNet 3.1](https://wordnet.princeton.edu/) (npm `wordnet-db` の `dict/index.sense`) | 語義ごとの使用回数 (SemCor のタグ数)。品詞・語義ごとの使われ方を見る | WordNet License |
| [Japanese WordNet](https://github.com/omwn/omw-data) (NICT、Open Multilingual Wordnet の `wns/jpn/wn-data-jpn.tab`) | synset ごとの日本語訳。単語帳の日本語訳と突き合わせて語義を選ぶ | Japanese WordNet License |

いずれも帰属表示が条件 (Moby は不要) なので、`dataset.json` の `sources` に載せ、API の応答にも返す。

## 選び方

見出し語 × 品詞ごとに:

1. **正解候補** を集める。根拠の強い順に
   - WordNet の同じ synset にあり Moby も挙げる (双方向ならさらに優先)
   - WordNet の直接の上位語で Moby も挙げる (`plummet → drop`、`disease → illness`)
   - Moby で双方向に挙がり WordNet でも直接の関係 (also) がある
   - WordNet の同じ synset だけ / 直接の上位語だけ (上位語だけは動詞・形容詞・副詞のみ)
   - **下位語は根拠にしない** (`amphibian → frog` は一種であって言い換えではない)。誤答から外すためだけに使う
   - **否定の接頭辞を取っただけの上位語は根拠にしない** (`mistake` / `misidentify` の上位語 `identify`、
     `miscount → count`、`abuse → use`)。WordNet では「誤って識別する」の上位語が「識別する」なので、
     上位語経由だと意味が逆の語が出る
   - **Moby の裏付けの無い上位語は、同じ synset に確かな言い換えが無いときだけ** (`perspire` に `sweat`
     があるなら上位語の `eliminate` は出さない)。同じ synset に弱い候補 (主に別の品詞で使う `fox`) しか
     無ければ上位語を出す (`play a trick on → deceive`。`trick` は見出し語に含まれるので候補にしない)
   - 品詞の割合で切る前に、**その語義に使用例 (SemCor) があれば通す** (`sweat` は名詞の synset が多いが
     動詞「汗をかく」には使用例がある)
   - **名詞では上位語・兄弟語・いとこを慎重に扱う**。名詞の上位語は分類 (`amphibian → vertebrate`、
     別の語義の `amphibian → plane`) になりがちなので Moby も挙げるものだけ採り、兄弟語・いとこ
     (`amphibian → reptile`) は採らない。動詞では同じ上位語の下の語が近い意味になりやすい
     (`plummet` / `plunge`) ので残す
   - Moby だけが挙げる語 (WordNet に関係なし) は候補にしない。Moby は連想辞典なので
     navigation ↔ geography のような「関連はあるが同義ではない」組を含む
2. 候補を **語義ごとの使用回数** で調整する。頻度順位は品詞をまたいだ合計なので、名詞としてよく使う語が
   動詞の同義語としても「よく使う語」に見えてしまう (`tell off → jaw / rag`)。他の品詞では使われているのに
   この品詞では一度もタグ付けされていない語、同じ synset の他の語には使用例があるのにこの語のこの語義には
   無い語は強く下げ、まさにその語義で使用例のある語は少し上げる。
3. 候補を **頻度帯** で調整する。一般的すぎる語 (take / get / good) と難しすぎる語は下げ、
   見出し語よりずっと珍しい語 (`tiny → diminutive`) も下げる。WordNet の後ろの語義 (珍しい語義)
   を通して見つかった候補は下げるが、Moby も双方向に挙げるなら主要な語義とみなす
   (`happy → glad` は WordNet では 3 番目の語義)。
4. 上位 3 語を正解候補にする (クライアントは重みつきでそのうち 1 つを出す)。
5. **誤答** は同じ品詞・同じ頻度帯の語から、見出し語と正解候補のどれとも WordNet (2 ホップ以内)・
   Moby で関係のない語を 6 語選ぶ。見出し語の活用・派生 (`plummet → plummeting`) も外す。

正解にも誤答にも、主に別の品詞で使う語 (`fox` の動詞用法)、その品詞で一度も使用例の無い語 (`jaw` の動詞用法)、
ローマ数字・母音の無い略語風の語は使わない。
品詞は synset の多い順に並べ、従属的な品詞 (`plummet` の名詞) は出題しない。

## 語義の選択 (日本語訳との突き合わせ)

多義語では、品詞をまとめた正解候補だと別の語義の同義語が混ざる (`mundane` = 平凡な に
`terrestrial` = この世の)。そこで見出し語 × 品詞ごとに、**語義 (synset) ごとの日本語訳と
その語義だけを根拠にした正解候補** も持たせる (`senses`)。日本語訳は Japanese WordNet から取り、
WordNet 3.0 のオフセットと OEWN の synset id は英語の定義文 (同じファイルの `eng:def`) と
メンバー集合で対応付ける。

実行時 (`src/lib/paraphrase/dataset.ts` の `matchJapaneseSense`) は、単語帳の日本語訳を番号・区切りで
刻み、語義の訳語と包含で比べて (「平凡な」⊇「平凡」)、一致数が最も多い語義の候補を出す。
訳語の漢字がすべて含まれる場合も弱く合わせる (「間ちがう」「かん違いする」⊆「間違える」。日本語 WordNet は
送り仮名・交ぜ書きの揺れが多い)。合う語義が無ければ品詞全体の候補に戻る。

**言い換えの無い語義も、日本語訳があれば `senses` に残す** (正解候補は空、訳語は少なめ)。単語帳の訳が
その語義に合うなら、他の語義の言い換えを出すより「材料無し」が正しい (`mistake for` = 〜と間違える に
「しくじる」の語義の `slip` を出さない)。

## 出力形式

```jsonc
{
  "version": 1,
  "generatedAt": "2026-10-05",
  "sources": [{ "name": "...", "license": "...", "url": "..." }],
  "vocab": ["drop", "decline", ...],              // 語は一度だけ置く
  "entries": {
    // [品詞, 正解候補の添字 (良い順), 誤答の添字, 語義ごとの [日本語訳, その語義の正解候補の添字]]
    "plummet": [["v", [0, 1, 2], [10, 11, 12, 13, 14, 15], [[["急落する"], [0, 1, 2]]]]],
    "mistake": [["v", [20], [...], [[["取りちがえる", "間ちがう"], []]]]],   // 言い換えの無い語義は候補が空
    "play a trick on": [["v", [...], [...]]]
  }
}
```

読み手は `src/lib/paraphrase/dataset.ts` (`resolveParaphraseMaterial`)。単語帳の `english` は
`src/lib/paraphrase/headword.ts` で見出し語の形に寄せてから引く (`play a trick on sb` → `play a trick on`、
`cope with` → `cope`、`plummeted` → `plummet`)。

## 調整するとき

重みは `build_dataset.py` 冒頭の定数にまとまっている。変えたら `--inspect` で代表語
(plummet / deceive / play a trick on / happy / abandon / huge / tiny など) を見比べ、
`src/lib/paraphrase/dataset.test.ts` が通ることを確かめてから JSON を作り直す。
