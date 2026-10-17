# スキャンの例文ストックの生成

`src/lib/open-examples/dataset.json` を作るパイプライン。スキャンでは例文を AI で作らない
(`SCAN_EXAMPLE_GENERATION_ENABLED = false`) ので、例文はこの表と、辞書 (`lexicon_entries`) に
以前から貯まっている例文だけから付く。オープンデータの例文を優先する。

```bash
python3 scripts/open-examples/build_dataset.py                         # .cache/open-examples-sources に落として生成
python3 scripts/open-examples/build_dataset.py --inspect run,"give up",bank   # 候補を確認 (書き出さない)
```

Python 3.10 以上と `node` が必要 (外部の Python パッケージは不要)。生成は決定的なので、同じ
データ源からは同じ JSON ができる。生成した `dataset.json` はコミットする。

## データ源とライセンス

| データ | 用途 | ライセンス |
|---|---|---|
| [Tatoeba](https://tatoeba.org/) (`exports/per_language/` の英文・和文・英日リンク、`exports/tags.tar.bz2`) | 例文と和訳。「要ネイティブ確認」などの印の付いた文は使わない | CC BY 2.0 FR |
| [Princeton WordNet 3.1](https://wordnet.princeton.edu/) (npm `wordnet-db` の `dict/index.*`) | 見出し語の一覧 (熟語を含む) | WordNet License |
| [wink-lexicon](https://github.com/winkjs/wink-lexicon) (npm、`src/wn-*-exceptions.js`) | 不規則変化 (ran → run、children → child)。WordNet の例外表由来 | MIT |

Tatoeba は帰属表示が条件なので、`dataset.json` の `sources` に載せている。画面での表示は別途。

## 選び方

1. 英文を語に切り、各語を WordNet の見出し語へ戻す (例外表 + WordNet の morphy と同じ語尾規則)。
   熟語は先頭の語から引き、続く語も原形で突き合わせる (`made up her mind` → `make up one's mind`)
2. 文頭以外で大文字始まりが多い語 (Tom, Mary) は固有名詞とみなして見出し語にしない
3. 見出し語ごとに、学習向きの長さ (5–12 語) の文を優先して **5 件** 残す。同じ和訳・同じ英文は重ねない
   (多義語の語義を実行時に選べるよう、和訳がばらけるようにする)

実行時 (`selectOpenExample`) は、単語帳の日本語訳 (`japanese` と `word_translations`) が和文に
現れる最初の候補を使う。訳が和文に現れない語には付けない —— 別の語義の例文 (bank = 土手 の語に
「銀行にお金を預けた」) を付けるくらいなら付けない。
