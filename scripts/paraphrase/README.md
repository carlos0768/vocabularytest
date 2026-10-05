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

いずれも帰属表示が条件 (Moby は不要) なので、`dataset.json` の `sources` に載せ、API の応答にも返す。

## 選び方

見出し語 × 品詞ごとに:

1. **正解候補** を集める。根拠の強い順に
   - WordNet の同じ synset にあり Moby も挙げる (双方向ならさらに優先)
   - WordNet の直接の上位語で Moby も挙げる (`plummet → drop`)
   - Moby で双方向に挙がり WordNet でも直接の関係がある
   - WordNet の同じ synset だけ / 直接の上位語だけ
   - Moby だけが挙げる語 (WordNet に関係なし) は候補にしない。Moby は連想辞典なので
     navigation ↔ geography のような「関連はあるが同義ではない」組を含む
2. 候補を **頻度帯** で調整する。一般的すぎる語 (take / get / good) と難しすぎる語は下げ、
   見出し語よりずっと珍しい語 (`tiny → diminutive`) も下げる。WordNet の後ろの語義 (珍しい語義)
   を通して見つかった候補は下げるが、Moby も双方向に挙げるなら主要な語義とみなす
   (`happy → glad` は WordNet では 3 番目の語義)。
3. 上位 3 語を正解候補にする (クライアントは重みつきでそのうち 1 つを出す)。
4. **誤答** は同じ品詞・同じ頻度帯の語から、見出し語と正解候補のどれとも WordNet (2 ホップ以内)・
   Moby で関係のない語を 6 語選ぶ。見出し語の活用・派生 (`plummet → plummeting`) も外す。

正解にも誤答にも、主に別の品詞で使う語 (`fox` の動詞用法) と、ローマ数字・母音の無い略語風の語は使わない。
品詞は synset の多い順に並べ、従属的な品詞 (`plummet` の名詞) は出題しない。

## 出力形式

```jsonc
{
  "version": 1,
  "generatedAt": "2026-10-05",
  "sources": [{ "name": "...", "license": "...", "url": "..." }],
  "vocab": ["drop", "decline", ...],              // 語は一度だけ置く
  "entries": {
    "plummet": [["v", [0, 1, 2], [10, 11, 12, 13, 14, 15]]],   // [品詞, 正解候補の添字 (良い順), 誤答の添字]
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
