# 派生語フィルタ (derived-words gate)

`src/lib/derived-words/dataset.json` を生成するオフラインパイプライン。

派生語生成は1語1コインの有料機能なので、「その単語に派生語を生成する価値があるか」を
**AIに聞く前に**決める必要がある。判定は綴りと頻度だけから教師なしで行い、
結果を静的データセットに焼き込んでアプリ側から O(1) で引く。

## なぜ焼き込むのか

判定器は Python + `wordfreq` に依存しており、Next.js のランタイムでは動かせない。
判定は入力語だけに依存する純関数なので、語彙全体 (上位56,675語) について
事前計算しておけば実行時と完全に等価になる。語彙外の語は頻度が下限を割るため
どのみち不合格で、取りこぼしはない。

## 2つのトラック

| | 軸 | 例 | 実装 |
|---|---|---|---|
| **track A** | 接頭辞-語根族 | `receive` → 語根 `cept/ceiv` (accept, concept, exception...) | `rootminer.py` + `decide.py` |
| **track B** | 接尾辞-派生族 | `analyze` → `analysis` / `analytical` | `derivminer.py` |

どちらか一方を通れば合格。2軸あるのは互いの盲点を埋めるため:

- `maintain` は接尾辞軸では落ちる (maintenance は綴りが不規則で繋がらない) が、
  track A の `ten/tin/tent/tain` 族 (全体1位) で拾える。
- `analyze` は接頭辞を持たないので track A では落ちるが、track B で拾える。

track A のみだと学術語彙の 31% しか通らず、`analyze` / `establish` / `identify` /
`significant` のような受験・TOEFL の中核語が軒並み対象外になる。2軸の和で 76% になる。

### track A (rootminer / decide)

4段の早期棄却フィルタ。前段で落ちたら後段は評価しない。

| 段 | 検査 | 棄却される典型 |
|---|---|---|
| T1 | 可視性 (頻度が学習価値帯にあるか) | `obfuscate` (Zipf 2.3), `defenestrate` (1.0) |
| T2 | 分解可能性 (接頭辞+語根に割れるか) | `pine`, `happiness`, `understand` |
| T3 | 生産性 (語根が他の接頭辞とも結合するか) | 語根が2種以下としか結合しない語 |
| T4 | 回収量 (語族の効用和が打ち切り線を超えるか) | `OPTIONAL` 判定 |

### track B (derivminer)

接尾辞を「派生 (品詞を変える)」と「屈折 (変えない)」に分けるのが要点。
`pine` → `pines`/`pined`/`pining` は屈折のみ = 派生語なし = 学ぶ価値なし、と落ちる。

幹の比較は「接尾辞を剥がした幹どうしを対で比較し、末尾1字の交替 (`decid`/`decis`)
だけ許す」方式。交替は幹長 5 以上でのみ許可することで `cond`/`cons` 型の偶然の衝突を
防いでいる (初期版は幹を1つの正規化キーに畳んでいたため
`consist`/`condition`/`condor` を同族にしてしまった)。

`-able` / `-er` / `-ly` / `-ness` はラテン系の証拠に数えない。native 語幹にも自由に
付くため、`understand` → `understandable` を「学ぶ価値のある派生」と誤認するのを防ぐ。

## 出力に語のリストを含めない理由

track B はコーパス上の派生語リストを**出力しない**。合否と幹だけを残している。

コーパスは不規則派生 (`receive` → `reception`, `maintain` → `maintenance`) を拾えず、
逆に無関係な語を混ぜてしまう (`analyze` の最尤幹は `anal` になる)。
不完全なリストをAIに候補として渡すとかえって出力が悪くなるため、
派生語の列挙はAIに委ね、このパイプラインは**足切りに徹する**。

track A の語根族 (`cept/ceiv` など200族) は rootminer が正しく統合できているので、
語根の意味を固定する文脈としてプロンプトに載せている。

## 再生成

```bash
pip install wordfreq
cd scripts/derived-words
python3 rootminer.py          # 語根ランキングを確認 (任意)
python3 decide.py receive pine analyze   # 単語判定を確認 (任意)
python3 export_dataset.py     # derived-words-dataset.json を生成
cp derived-words-dataset.json ../../src/lib/derived-words/dataset.json
```

`export_dataset.py` は語彙全体を走査するので15秒程度かかる。
データセットを差し替えたら `src/lib/derived-words/eligibility.test.ts` を実行し、
`pine` / `dog` が不合格、`receive` / `analyze` が合格のままであることを確認すること。
