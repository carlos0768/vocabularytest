#!/usr/bin/env python3
"""言い換えクイズ用データセット (src/lib/paraphrase/dataset.json) を生成する。

出題「plummet の言い換えは?」→ 正解「drop / decline / fall」、誤答 3 語、という 4 択の材料を
オープンデータだけから作る。AI は使わない。

データ源 (すべて再配布可):
  - Open English WordNet (CC BY 4.0)      … 同義語集合 (synset)・上位語・類似語・語義の順序
      https://github.com/globalwordnet/english-wordnet  (src/yaml/*.yaml)
  - Moby Thesaurus II (パブリックドメイン) … 連想的な広い同義語リスト
      npm パッケージ moby (zeke/moby) の words.txt
  - gwordlist (CC BY 3.0, Google Books Ngram 由来) … 語の頻度順位
      https://github.com/hackerb9/gwordlist  frequency-alpha-alldicts.txt
  - Princeton WordNet 3.1 (WordNet License) … 語義ごとの使用回数 (SemCor のタグ数, index.sense)
      npm パッケージ wordnet-db の dict/index.sense。「jaw は名詞としては使うが動詞 (叱る) では
      ほぼ使わない」のような品詞・語義ごとの使われ方を見るのに使う
  - Japanese WordNet (NICT, Japanese WordNet License) … synset ごとの日本語訳
      Open Multilingual Wordnet の wns/jpn/wn-data-jpn.tab。単語帳の日本語訳 (平凡な) と突き合わせて
      どの語義の言い換えを出すか (mundane → everyday であって terrestrial ではない) を選ぶのに使う

使い方:
  python3 scripts/paraphrase/build_dataset.py [--cache-dir .cache/paraphrase-sources]
  python3 scripts/paraphrase/build_dataset.py --inspect plummet,deceive,"play a trick on"

生成物の形式は src/lib/paraphrase/dataset.ts の ParaphraseDataset を参照。詳しくは同じ
ディレクトリの README.md。
"""

from __future__ import annotations

import argparse
import bisect
import datetime as dt
import json
import math
import random
import re
import string
import sys
import tarfile
import urllib.request
from collections import defaultdict
from pathlib import Path

try:
    import yaml  # PyYAML
except ImportError:  # pragma: no cover
    sys.exit("PyYAML が必要です: pip install pyyaml")

try:
    from yaml import CSafeLoader as YamlLoader  # type: ignore
except ImportError:  # pragma: no cover
    from yaml import SafeLoader as YamlLoader  # type: ignore

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "src" / "lib" / "paraphrase" / "dataset.json"
DATASET_VERSION = 2

OEWN_RAW_BASE = "https://raw.githubusercontent.com/globalwordnet/english-wordnet/main/src/yaml/"
OEWN_SYNSET_FILES = [
    "adj.all", "adj.pert", "adj.ppl", "adv.all",
    "noun.Tops", "noun.act", "noun.animal", "noun.artifact", "noun.attribute", "noun.body",
    "noun.cognition", "noun.communication", "noun.event", "noun.feeling", "noun.food",
    "noun.group", "noun.location", "noun.motive", "noun.object", "noun.person",
    "noun.phenomenon", "noun.plant", "noun.possession", "noun.process", "noun.quantity",
    "noun.relation", "noun.shape", "noun.state", "noun.substance", "noun.time",
    "verb.body", "verb.change", "verb.cognition", "verb.communication", "verb.competition",
    "verb.consumption", "verb.contact", "verb.creation", "verb.emotion", "verb.motion",
    "verb.perception", "verb.possession", "verb.social", "verb.stative", "verb.weather",
]
# 見出し語ごとの語義の並び (よく使う語義が先) を持つファイル
OEWN_ENTRY_FILES = ["entries-0"] + [f"entries-{letter}" for letter in string.ascii_lowercase]
MOBY_TARBALL_URL = "https://registry.npmjs.org/moby/-/moby-1.1.2.tgz"
GWORDLIST_URL = "https://raw.githubusercontent.com/hackerb9/gwordlist/master/frequency-alpha-alldicts.txt"
WORDNET_DB_TARBALL_URL = "https://registry.npmjs.org/wordnet-db/-/wordnet-db-3.1.14.tgz"
OMW_JPN_TAB_URL = "https://raw.githubusercontent.com/omwn/omw-data/main/wns/jpn/wn-data-jpn.tab"
# WordNet 3.0 のオフセット -> 英語メンバー (定義文で決まらない synset の対応付けに使う)
OMW_ENG_TAB_URL = "https://raw.githubusercontent.com/omwn/omw-data/main/wns/eng/wn-data-eng.tab"
# 語義ごとに持つ日本語訳と正解候補の上限
JAPANESE_LEMMAS_PER_SENSE = 8
# 言い換えの無い語義にも日本語訳は残す (単語帳の訳がその語義なら「言い換え無し」と判定できるように)。
# 出題には使わないので少なめに
JAPANESE_LEMMAS_PER_EMPTY_SENSE = 6
# 上位語が見出し語の synset の語から否定の接頭辞を取っただけなら、意味は逆なので言い換えにしない
# (mistake / misidentify の上位語 identify、misjudge の上位語 judge)
NEGATIVE_PREFIXES = ("mis", "un", "dis", "non", "de", "in", "im", "ir", "il")
ANSWERS_PER_SENSE = 3

# ---- 選定のしきい値 -------------------------------------------------------
# 正解・誤答に使う語は「学習者が知っていてよい語」に限る。頻度順位 (gwordlist) で切る。
ANSWER_MAX_RANK = 30000
DISTRACTOR_MAX_RANK = 20000
# 誤答に使わない「あまりに一般的な語」の順位 (take / get / down のような語は誤答にもならない)。
GENERIC_MAX_RANK = 300
# 正解候補として、その品詞での使われ方がこの割合より少ない語は捨てる (fox の動詞用法など)。
ANSWER_MIN_POS_SHARE = 0.3
# 誤答は正解と同じくらいの頻度帯から取る (難しさをそろえる)。順位の比で幅を決める。
DISTRACTOR_RANK_RATIO = 4.0
ANSWERS_PER_ENTRY = 3
DISTRACTORS_PER_ENTRY = 6
# いとこ (同じ祖父語の下の語: plummet と plunge) を近縁とみなすのは、祖父語の家族が小さいときだけ。
# move / change のような巨大な家族まで広げると、動詞の大半が近縁になってしまう。
COUSIN_FAMILY_MAX = 40
# 候補の重み。小さいほど良い。根拠の強さ (tier) と、一般的すぎず難しすぎない頻度帯を合算する。
# 2つの独立した資料 (WordNet と Moby) が一致する候補を最優先し、片方だけの候補は
# WordNet の珍しい語義 (modify → season) や Moby の連想 (plummet → reduce) を拾いがちなので下げる。
TIER_PENALTY = {
    "synset+moby": 0.0,       # WordNet の同じ synset (形容詞は similar 含む) にあり、Moby も挙げる
    "hypernym+moby": 0.5,     # WordNet の直接の上位語で、Moby も挙げる (plummet → drop)
    "moby_mutual+wn": 0.5,    # Moby で双方向に挙がり、WordNet でも直接の関係 (上位/下位/also) がある
    "synset": 0.9,            # WordNet の同じ synset だけ
    "hypernym": 1.3,          # WordNet の直接の上位語だけ
    "moby_mutual+far": 1.3,   # Moby で双方向に挙がり、WordNet では兄弟・いとこ程度の近さ
    "moby+wn": 1.4,           # Moby で片方向に挙がり、WordNet でも直接の関係がある
}
# Moby だけが挙げる語 (WordNet に関係なし) は正解候補にしない。Moby は連想辞典なので、
# 双方向に挙がっていても navigation ↔ geography のような「関連はあるが同義ではない」組を
# 大量に含む。誤答から同義語を外す用途 (excluded) にだけ使う。
# WordNet と Moby の両方にあり、しかも Moby で双方向なら、いちばん確かな言い換え。
MUTUAL_BONUS = -0.3
# 形容詞の similar 先は同じ synset より遠い (happy → golden / blessed)。
SIMILAR_PENALTY = 0.8
# WordNet と Moby (双方向) の両方が挙げる語は、WordNet の語義順が後ろでも主要な言い換えとみなす
# (happy → glad は WordNet では 3 番目の語義、abandon → desert は 5 番目)。
MUTUAL_SENSE_PENALTY_CAP = 0.3
# 語義ごとの使用回数 (SemCor タグ数)。頻度順位は品詞をまたいだ合計なので、名詞としてよく使う語が
# 動詞の同義語としても「よく使う語」に見えてしまう (tell off → jaw / rag)。その品詞で一度も
# タグ付けされていない語は下げ、まさにその語義でタグ付けされている語は少し上げる。
POS_UNUSED_MIN_TOTAL_TAGS = 2     # 他の品詞ではこれ以上使われているのに
POS_UNUSED_PENALTY = 1.2          # この品詞では 0 回
SENSE_TAGGED_BONUS = -0.5         # 同じ synset のこの語義に使用例がある
SENSE_UNTAGGED_PENALTY = 1.8      # 同じ synset の他の語には使用例があるのに、この語のこの語義には無い (jaw = 叱る)
# 見出し語よりずっと珍しい語 (tiny → diminutive) は言い換えとして役に立ちにくいので下げる。
RARER_THAN_HEAD_RATIO = 2.0
RARER_THAN_HEAD_PENALTY = 0.8
# 1 位から離れすぎた候補は出さない (plummet → plump のような珍しい同義語)。
ANSWER_SCORE_WINDOW = 1.5
# 見出し語の何番目の語義を通して見つかった候補か。珍しい語義の同義語 (happy → golden) を下げる。
SENSE_ORDER_PENALTY_STEP = 0.6
SENSE_ORDER_PENALTY_MAX = 1.8
# 多義語 (pass / cover / set) は言い換えとしてぼやけるので少し下げる。
POLYSEMY_PENALTY_PER_SYNSET = 0.015
POLYSEMY_PENALTY_MAX = 0.4
SEED = 20261005

POS_CODE = {"n": "n", "v": "v", "a": "a", "s": "a", "r": "r"}
SINGLE_WORD_RE = re.compile(r"^[a-z]{3,}$")
HEADWORD_RE = re.compile(r"^[a-z][a-z' -]*[a-z]$")
# 誤答に出すには見た目が語らしくないもの (ローマ数字・略語風・母音なし)
ROMAN_NUMERAL_RE = re.compile(r"^[ivxlcdm]+$")
VOWEL_RE = re.compile(r"[aeiouy]")


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def download(url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 0:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    log(f"download {url}")
    with urllib.request.urlopen(url, timeout=300) as response:
        data = response.read()
    target.write_bytes(data)


def normalize_lemma(lemma: str) -> str:
    return re.sub(r"\s+", " ", lemma.replace("_", " ").strip().lower())


# ---- Open English WordNet ---------------------------------------------------

def load_oewn_synsets(cache_dir: Path) -> dict:
    """synset id -> {pos, members[], hypernym[], similar[], also[]} を返す (JSON キャッシュ付き)。"""
    cached = cache_dir / "oewn-synsets-v2.json"
    if cached.exists():
        return json.loads(cached.read_text())
    synsets: dict[str, dict] = {}
    for name in OEWN_SYNSET_FILES:
        path = cache_dir / "oewn" / f"{name}.yaml"
        download(OEWN_RAW_BASE + f"{name}.yaml", path)
        log(f"parse {path.name}")
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.load(handle, Loader=YamlLoader)
        for synset_id, body in data.items():
            definitions = body.get("definition", [])
            synsets[synset_id] = {
                "pos": POS_CODE.get(body.get("partOfSpeech", ""), None),
                "definition": definitions[0] if definitions else "",
                "members": list(body.get("members", [])),
                "hypernym": list(body.get("hypernym", [])),
                "similar": list(body.get("similar", [])),
                "also": list(body.get("also", [])),
            }
    cached.write_text(json.dumps(synsets))
    return synsets


def load_oewn_sense_order(cache_dir: Path) -> tuple[dict[str, dict[str, list[str]]], dict[str, str]]:
    """(lemma -> pos -> [synset id ...] を見出し語の語義の並び (よく使う順) で, sense key -> synset id) を返す。

    sense key ('scold%2:32:00::') は Princeton WordNet と共通で、index.sense のタグ数を引く鍵になる。
    """
    cached = cache_dir / "oewn-sense-order-v2.json"
    if cached.exists():
        data = json.loads(cached.read_text())
        return data["order"], data["sense_keys"]
    order: dict[str, dict[str, list[str]]] = {}
    sense_keys: dict[str, str] = {}
    for name in OEWN_ENTRY_FILES:
        path = cache_dir / "oewn-entries" / f"{name}.yaml"
        download(OEWN_RAW_BASE + f"{name}.yaml", path)
        log(f"parse {path.name}")
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.load(handle, Loader=YamlLoader)
        for lemma, by_pos in data.items():
            if not isinstance(by_pos, dict) or lemma != lemma.lower():
                continue
            key = normalize_lemma(lemma)
            for pos_raw, body in by_pos.items():
                pos = POS_CODE.get(pos_raw)
                if pos is None or not isinstance(body, dict):
                    continue
                synset_ids = [sense["synset"] for sense in body.get("sense", []) if "synset" in sense]
                if synset_ids:
                    order.setdefault(key, {}).setdefault(pos, []).extend(synset_ids)
                for sense in body.get("sense", []):
                    if "synset" in sense and "id" in sense:
                        sense_keys[sense["id"]] = sense["synset"]
    cached.write_text(json.dumps({"order": order, "sense_keys": sense_keys}))
    return order, sense_keys


def load_sense_tag_counts(cache_dir: Path) -> dict[str, int]:
    """Princeton WordNet の index.sense から sense key -> タグ数 (SemCor での出現回数)。"""
    tarball = cache_dir / "wordnet-db-3.1.14.tgz"
    download(WORDNET_DB_TARBALL_URL, tarball)
    with tarfile.open(tarball, "r:gz") as archive:
        member = archive.extractfile("package/dict/index.sense")
        assert member is not None
        text = member.read().decode("utf-8", errors="replace")
    counts: dict[str, int] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 4 and parts[3].isdigit():
            counts[parts[0]] = int(parts[3])
    return counts


def _normalize_definition(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def load_japanese_lemmas(cache_dir: Path, synsets: dict) -> dict[str, list[str]]:
    """OEWN synset id -> 日本語訳のリスト (日本語 WordNet)。

    日本語 WordNet は WordNet 3.0 のオフセットで引くが、OEWN の synset id は別物なので、
    同じファイルに入っている英語の定義文 (eng:def) を OEWN の定義文と突き合わせて対応を取る。
    定義文で決まらない synset は (品詞, メンバー集合) の一致で補う。
    """
    cached = cache_dir / "oewn-japanese-lemmas.json"
    if cached.exists():
        return json.loads(cached.read_text())
    path = cache_dir / "omw-wn-data-jpn.tab"
    download(OMW_JPN_TAB_URL, path)
    definitions: dict[str, str] = {}
    lemmas: dict[str, list[str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        offset, kind = parts[0], parts[1]
        # 定義文の行は「offset  eng:def  語義番号  本文」の 4 列
        if kind == "eng:def" and len(parts) >= 4 and offset not in definitions:
            definitions[offset] = _normalize_definition(parts[3])
        elif kind == "jpn:lemma":
            lemmas.setdefault(offset, []).append(parts[2].replace("+", ""))

    by_definition: dict[tuple[str, str], str] = {}
    for offset, definition in definitions.items():
        pos = offset[-1]
        key = (pos, definition)
        by_definition[key] = "" if key in by_definition else offset  # 同じ定義が複数あれば使わない
    by_members: dict[tuple[str, frozenset[str]], str] = {}
    members_of_offset: dict[str, set[str]] = {}
    eng_path = cache_dir / "omw-wn-data-eng.tab"
    download(OMW_ENG_TAB_URL, eng_path)
    for line in eng_path.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and parts[1] == "lemma":
            members_of_offset.setdefault(parts[0], set()).add(normalize_lemma(parts[2]))
    for offset, members in members_of_offset.items():
        key = (offset[-1], frozenset(members))
        by_members[key] = "" if key in by_members else offset

    result: dict[str, list[str]] = {}
    matched_by_definition = 0
    for synset_id, body in synsets.items():
        pos = body["pos"]
        if pos is None:
            continue
        offset = by_definition.get((pos, _normalize_definition(body.get("definition", ""))))
        if offset:
            matched_by_definition += 1
        else:
            members = frozenset(normalize_lemma(m) for m in body["members"])
            offset = by_members.get((pos, members))
        if not offset or offset not in lemmas:
            continue
        unique: list[str] = []
        for lemma in lemmas[offset]:
            if lemma and lemma not in unique:
                unique.append(lemma)
        result[synset_id] = unique
    log(f"japanese lemmas: {len(result)} synsets (by definition: {matched_by_definition})")
    cached.write_text(json.dumps(result, ensure_ascii=False))
    return result


# ---- Moby Thesaurus ----------------------------------------------------------

def load_moby(cache_dir: Path) -> dict[str, set[str]]:
    tarball = cache_dir / "moby-1.1.2.tgz"
    download(MOBY_TARBALL_URL, tarball)
    with tarfile.open(tarball, "r:gz") as archive:
        member = archive.extractfile("package/words.txt")
        assert member is not None
        text = member.read().decode("utf-8", errors="replace")
    thesaurus: dict[str, set[str]] = {}
    for line in text.splitlines():
        parts = [normalize_lemma(part) for part in line.split(",")]
        if not parts or not parts[0]:
            continue
        head, *synonyms = parts
        thesaurus.setdefault(head, set()).update(s for s in synonyms if s and s != head)
    return thesaurus


# ---- 頻度 --------------------------------------------------------------------

def load_frequency_ranks(cache_dir: Path) -> dict[str, int]:
    path = cache_dir / "gwordlist-frequency-alpha-alldicts.txt"
    download(GWORDLIST_URL, path)
    ranks: dict[str, int] = {}
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            word = parts[1].lower()
            if not SINGLE_WORD_RE.match(word) or word in ranks:
                continue
            ranks[word] = int(parts[0])
    return ranks


# ---- 語幹の近さ (活用形・派生語を同義語/誤答から外す) -------------------------

_SUFFIXES = sorted(
    ["ingly", "edly", "ness", "ment", "tion", "sion", "ally", "ful", "less", "ous",
     "ive", "ity", "ing", "ed", "er", "est", "ly", "es", "s", "e", "y"],
    key=len, reverse=True,
)


def stem(word: str) -> str:
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def is_variant(left: str, right: str) -> bool:
    """同じ語の活用・派生とみなすか。plummet/plummeting, trick/tricky は真、plump/plummet は偽。"""
    if left == right:
        return True
    left_tokens = left.split()
    right_tokens = right.split()
    if len(left_tokens) > 1 or len(right_tokens) > 1:
        # 句は語ごとに見る: 片方の全語が他方に含まれるなら同じ語の変形あつかい
        # (play a trick on → trick は言い換えにならない)。
        left_set = {stem(t) for t in left_tokens}
        right_set = {stem(t) for t in right_tokens}
        return left_set <= right_set or right_set <= left_set
    if stem(left) == stem(right):
        return True
    common = 0
    for a, b in zip(left, right):
        if a != b:
            break
        common += 1
    return common >= 5 and common >= min(len(left), len(right)) - 1


# ---- 本体 --------------------------------------------------------------------

KANJI_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")


def select_japanese_lemmas(lemmas: list[str], limit: int) -> list[str]:
    """語義の日本語訳を limit 個まで選ぶ。日本語 WordNet は 1 語義に「取ちがえする / 取りちがえする /
    取りあやまる / …」と送り仮名違いが並ぶので、先頭から切ると漢字の種類が偏り、後ろの「間ちがう」
    「かん違いする」が落ちる。実行時の比較は文字列の包含と漢字の集合なので、漢字の集合が新しい語を
    先に採り、余りは元の順で埋める。"""
    chosen: list[str] = []
    seen: set[frozenset[str]] = set()
    for lemma in lemmas:
        kanji = frozenset(KANJI_RE.findall(lemma))
        if kanji in seen:
            continue
        seen.add(kanji)
        chosen.append(lemma)
        if len(chosen) >= limit:
            return chosen
    for lemma in lemmas:
        if len(chosen) >= limit:
            break
        if lemma not in chosen:
            chosen.append(lemma)
    return chosen


class Builder:
    def __init__(
        self,
        synsets: dict,
        sense_order: dict[str, dict[str, list[str]]],
        moby: dict[str, set[str]],
        ranks: dict[str, int],
        sense_keys: dict[str, str] | None = None,
        tag_counts: dict[str, int] | None = None,
        japanese: dict[str, list[str]] | None = None,
    ):
        self.synsets = synsets
        self.moby = moby
        self.ranks = ranks
        self.japanese = japanese or {}
        # (lemma, pos) -> その品詞での使用回数、(lemma, pos, synset) -> その語義での使用回数、lemma -> 合計
        self.pos_tags: dict[tuple[str, str], int] = defaultdict(int)
        self.sense_tags: dict[tuple[str, str, str], int] = defaultdict(int)
        self.total_tags: dict[str, int] = defaultdict(int)
        for sense_key, synset_id in (sense_keys or {}).items():
            count = (tag_counts or {}).get(sense_key, 0)
            if count <= 0:
                continue
            lemma_part, _, rest = sense_key.partition("%")
            lemma = normalize_lemma(lemma_part)
            pos = {"1": "n", "2": "v", "3": "a", "4": "r", "5": "a"}.get(rest[:1])
            if pos is None:
                continue
            self.pos_tags[(lemma, pos)] += count
            self.sense_tags[(lemma, pos, synset_id)] += count
            self.total_tags[lemma] += count
        # lemma -> pos -> [synset ids] (語義の並び順。entries に無い synset は末尾)
        self.lemma_synsets: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
        # synset -> hyponym synsets (hypernym の逆)
        self.hyponyms: dict[str, list[str]] = defaultdict(list)
        for synset_id, body in synsets.items():
            pos = body["pos"]
            if pos is None:
                continue
            for member in body["members"]:
                if member != member.lower():
                    continue  # 固有名詞は扱わない
                self.lemma_synsets[normalize_lemma(member)][pos].append(synset_id)
            for hyper in body["hypernym"]:
                self.hyponyms[hyper].append(synset_id)
        for lemma, by_pos in self.lemma_synsets.items():
            ordered = sense_order.get(lemma, {})
            for pos, ids in by_pos.items():
                preferred = [s for s in ordered.get(pos, []) if s in ids]
                rest = [s for s in ids if s not in preferred]
                by_pos[pos] = preferred + rest
        self.synset_count: dict[str, int] = {
            lemma: sum(len(ids) for ids in by_pos.values()) for lemma, by_pos in self.lemma_synsets.items()
        }
        # pos -> 誤答に使える単語 (頻度順) と、その順位列 (頻度帯を二分探索で切り出すため)
        self.distractor_pool: dict[str, list[str]] = {}
        self.distractor_pool_ranks: dict[str, list[int]] = {}
        for pos in ("n", "v", "a", "r"):
            pool = [
                lemma for lemma, by_pos in self.lemma_synsets.items()
                if pos in by_pos and self.is_presentable_distractor(lemma, pos)
            ]
            pool.sort(key=lambda lemma: self.ranks[lemma])
            self.distractor_pool[pos] = pool
            self.distractor_pool_ranks[pos] = [self.ranks[lemma] for lemma in pool]

    def is_presentable_distractor(self, lemma: str, pos: str) -> bool:
        if not SINGLE_WORD_RE.match(lemma) or len(lemma) < 4:
            return False
        if not VOWEL_RE.search(lemma) or ROMAN_NUMERAL_RE.match(lemma):
            return False
        rank = self.ranks.get(lemma)
        if rank is None or not (GENERIC_MAX_RANK < rank <= DISTRACTOR_MAX_RANK):
            return False
        if self.pos_share(lemma, pos) < 0.5:
            return False
        if self.is_pos_unused(lemma, pos):
            return False
        if pos == "a" and (lemma.endswith("ed") or lemma.endswith("ing")):
            # 分詞由来の形容詞 (treated / increasing) は選択肢として浮く
            base = stem(lemma)
            if any(base == stem(v) for v in (lemma[:-2], lemma[:-3], lemma[:-3] + "e") if v in self.lemma_synsets and "v" in self.lemma_synsets[v]):
                return False
        return True

    def synset_tagged(self, synset_id: str, pos: str) -> bool:
        """その synset のどれかの語に使用例があるか (= その語義自体は実際に使われている)。"""
        return any(self.sense_tags.get((m, pos, synset_id), 0) > 0 for m in self.members_of([synset_id], pos))

    def is_pos_unused(self, lemma: str, pos: str) -> bool:
        """他の品詞では使われているのに、この品詞では一度もタグ付けされていない語か (jaw の動詞)。"""
        return self.total_tags.get(lemma, 0) >= POS_UNUSED_MIN_TOTAL_TAGS and self.pos_tags.get((lemma, pos), 0) == 0

    def pos_share(self, lemma: str, pos: str) -> float:
        """その語の synset のうち、この品詞のものの割合。品詞が従 (fox の動詞など) の語は言い換えに向かない。"""
        by_pos = self.lemma_synsets.get(lemma)
        if not by_pos:
            return 0.0
        total = self.synset_count.get(lemma, 0)
        return len(by_pos.get(pos, [])) / total if total else 0.0

    @staticmethod
    def commonness_penalty(rank: int, pos: str) -> float:
        """一般的すぎる語 (take / get / good) を強く、難しい語を少し避ける。
        old / large のような基本語は形容詞・名詞の正解として自然なので、動詞 (take / put / set の
        ような軽動詞が多い) 以外はごく上位だけを強く下げる。"""
        if rank <= 100:
            return 3.0
        if rank <= GENERIC_MAX_RANK:
            return 1.6 if pos == "v" else 0.6
        if rank <= 1000:
            return 0.5 * (1000 - rank) / (1000 - GENERIC_MAX_RANK)
        if rank <= 5000:
            return 0.0
        return (math.log10(rank) - math.log10(5000)) * 1.7

    def polysemy_penalty(self, lemma: str) -> float:
        return min(POLYSEMY_PENALTY_MAX, POLYSEMY_PENALTY_PER_SYNSET * self.synset_count.get(lemma, 0))

    def members_of(self, synset_ids, pos: str) -> set[str]:
        result: set[str] = set()
        for synset_id in synset_ids:
            body = self.synsets.get(synset_id)
            if not body or body["pos"] != pos:
                continue
            for member in body["members"]:
                if member == member.lower():
                    result.add(normalize_lemma(member))
        return result

    def related_lemmas(self, head: str, pos: str, own: list[str] | None = None):
        """見出し語の近縁語を 4 つの辞書 (lemma -> 語義順の罰点) で返す。

        same      … 同じ synset (形容詞は similar 先も含む)
        hypernyms … 直接の上位語 (名詞では Moby も挙げるものだけ正解の根拠にする。amphibian → plane は分類であって言い換えではない)
        direct    … also (関連語)
        far       … 直接の下位語・兄弟語 (同じ上位語の下)・祖父語・いとこ (小さな家族のときだけ)

        前の 3 つは「言い換えの根拠」に使う。far は正解の根拠にはならないが、Moby で双方向に
        挙がる語の裏取りと、誤答から外すのに使う (誤答に出すと答えが割れる)。
        値は、その語がどの語義 (何番目) を通して見つかったかの罰点。小さいほど主要な語義。
        """
        if own is None:
            own = self.lemma_synsets[head][pos]
        same: dict[str, float] = {}
        # lemma -> その語が見つかった synset (語義ごとの使用回数を引くため。同じ synset・上位語・also のどれでも)
        connecting_synset: dict[str, str] = {}
        similar_only: set[str] = set()
        hypernyms: dict[str, float] = {}
        direct: dict[str, float] = {}
        far: dict[str, float] = {}
        # 直接の下位語 (amphibian → frog)。どの品詞でも言い換えの根拠にはせず、誤答から外すためだけに持つ
        hyponym_words: dict[str, float] = {}

        def add(target: dict[str, float], synset_ids, penalty: float) -> None:
            for synset_id in synset_ids:
                for lemma in self.members_of([synset_id], pos):
                    if lemma == head:
                        continue
                    if lemma not in target or penalty < target[lemma]:
                        target[lemma] = penalty
                    if target is not far and target is not hyponym_words:
                        connecting_synset.setdefault(lemma, synset_id)

        for index, synset_id in enumerate(own):
            penalty = min(SENSE_ORDER_PENALTY_MAX, SENSE_ORDER_PENALTY_STEP * index)
            body = self.synsets[synset_id]
            add(same, [synset_id], penalty)
            before = set(same)
            add(same, body["similar"], penalty)
            similar_only |= set(same) - before
            add(hypernyms, body["hypernym"], penalty)
            add(hyponym_words, self.hyponyms.get(synset_id, []), penalty)
            add(direct, body["also"], penalty)
            for hyper in body["hypernym"]:
                add(far, self.hyponyms.get(hyper, []), penalty)
                for grand in self.synsets[hyper]["hypernym"]:
                    add(far, [grand], penalty)
                    cousins = self.hyponyms.get(grand, [])
                    if len(cousins) <= COUSIN_FAMILY_MAX:
                        add(far, cousins, penalty)
        # 同じ synset にも居る語は similar 扱いにしない
        similar_only -= {lemma for lemma in similar_only if any(lemma in self.members_of([s], pos) for s in own)}
        self._last_connecting_synset = connecting_synset
        self._last_hyponyms = hyponym_words
        return same, hypernyms, direct, far, similar_only

    def collect_answers(self, head: str, pos: str, own: list[str] | None = None) -> list[str]:
        """正解候補を良い順に。`own` を渡すとその synset (語義) だけを根拠にする。"""
        same, hypernyms, direct, far, similar_only = self.related_lemmas(head, pos, own)
        connecting_synset = self._last_connecting_synset
        moby_fwd = self.moby.get(head, set())
        head_rank = self.ranks.get(head)

        candidates: dict[str, float] = {}
        # 同じ synset に「その品詞で使われる」言い換えがあるか (fox の動詞用法のように
        # 別品詞でしか使用例の無い語しか無いときは、上位語を最後の手段として出す)
        has_firm_synset_candidate = False

        def consider(lemma: str, tier: str, sense_penalty: float, extra: float = 0.0) -> None:
            nonlocal has_firm_synset_candidate
            if not SINGLE_WORD_RE.match(lemma):
                return
            rank = self.ranks.get(lemma)
            if rank is None or rank > ANSWER_MAX_RANK:
                return
            synset_id = connecting_synset.get(lemma)
            # その語義で実際に使われている証拠 (SemCor のタグ) があれば、品詞の割合で切らない
            # (sweat は名詞の synset が多いが、動詞「汗をかく」の語義には使用例がある)
            sense_attested = bool(synset_id) and self.sense_tags.get((lemma, pos, synset_id), 0) > 0
            share = self.pos_share(lemma, pos)
            if share < ANSWER_MIN_POS_SHARE and not sense_attested:
                return  # その品詞で主に使われない語は言い換えにならない
            if is_variant(head, lemma):
                return
            score = TIER_PENALTY[tier] + sense_penalty + extra + self.commonness_penalty(rank, pos) + self.polysemy_penalty(lemma)
            # その品詞で一度も使用例の無い語 (fox の動詞用法) は、同じ synset にあっても
            # 「確かな言い換え」には数えない (上位語を最後の手段として出すかの判断に使う)
            firm = not self.is_pos_unused(lemma, pos)
            if not firm:
                score += POS_UNUSED_PENALTY
            if synset_id:
                if sense_attested:
                    score += SENSE_TAGGED_BONUS
                elif self.synset_tagged(synset_id, pos):
                    score += SENSE_UNTAGGED_PENALTY
            if head_rank is not None and rank > head_rank * RARER_THAN_HEAD_RATIO:
                score += RARER_THAN_HEAD_PENALTY
            if share < 0.5 and not sense_attested:
                score += 0.6
            if lemma not in candidates or score < candidates[lemma]:
                candidates[lemma] = score
            if firm and tier in ("synset", "synset+moby"):
                has_firm_synset_candidate = True

        def is_mutual(lemma: str) -> bool:
            return lemma in moby_fwd and head in self.moby.get(lemma, set())

        for lemma, sense_penalty in same.items():
            extra = SIMILAR_PENALTY if lemma in similar_only else 0.0
            if is_mutual(lemma):
                consider(lemma, "synset+moby", min(sense_penalty, MUTUAL_SENSE_PENALTY_CAP), extra + MUTUAL_BONUS)
            elif lemma in moby_fwd:
                consider(lemma, "synset+moby", sense_penalty, extra)
            else:
                consider(lemma, "synset", sense_penalty, extra)
        # 名詞の上位語は分類 (amphibian → plane / vertebrate) になりがちで言い換えとは限らない。
        # Moby も挙げるものだけ候補にする (disease → illness、river → stream は残り、別の語義の
        # 上位語 plane は落ちる)。動詞・形容詞・副詞の上位語 (plummet → drop) はそのまま残す。
        answer_hypernyms = hypernyms if pos != "n" else {
            lemma: penalty for lemma, penalty in hypernyms.items() if lemma in moby_fwd
        }
        # 名詞の兄弟語・いとこ (amphibian → reptile) も分類の隣であって言い換えではない。動詞では
        # 同じ上位語の下の語が近い意味になりやすい (plummet / plunge) ので残す。
        answer_far = far if pos != "n" else {}
        own_members: set[str] = set()
        for synset_id in (own or self.lemma_synsets[head][pos]):
            own_members.update(self.synsets[synset_id]["members"])
        answer_hypernyms = {
            lemma: penalty for lemma, penalty in answer_hypernyms.items()
            if not any(prefix + lemma in own_members for prefix in NEGATIVE_PREFIXES)
        }
        for lemma, sense_penalty in answer_hypernyms.items():
            if is_mutual(lemma):
                consider(lemma, "hypernym+moby", min(sense_penalty, MUTUAL_SENSE_PENALTY_CAP))
            elif lemma in moby_fwd:
                consider(lemma, "hypernym+moby", sense_penalty)
            elif not has_firm_synset_candidate:
                # Moby の裏付けの無い上位語は、同じ synset に確かな言い換えが無いときの最後の手段
                # (perspire に sweat があるなら、上位語の eliminate は出さない。play a trick on は
                # 同じ synset に別品詞が主の fox しか無く、trick は見出し語に含まれるので候補に
                # ならないから、上位語の deceive を出す)
                consider(lemma, "hypernym", sense_penalty)
        for lemma in moby_fwd:
            # Moby は連想が広いので、Moby で相互に挙がるか、WordNet でも直接の関係があるものだけ採る。
            mutual = is_mutual(lemma)
            if lemma in answer_hypernyms or lemma in direct:
                sense_penalty = min(p for p in (answer_hypernyms.get(lemma), direct.get(lemma)) if p is not None)
                consider(lemma, "moby_mutual+wn" if mutual else "moby+wn", sense_penalty)
            elif mutual and lemma in answer_far:
                consider(lemma, "moby_mutual+far", answer_far[lemma])

        if not candidates:
            return []
        ranked = sorted(candidates.items(), key=lambda item: item[1])
        best_score = ranked[0][1]
        return [lemma for lemma, score in ranked if score <= best_score + ANSWER_SCORE_WINDOW][:ANSWERS_PER_ENTRY]

    def collect_senses(self, head: str, pos: str) -> list[tuple[list[str], list[str]]]:
        """語義ごとの (日本語訳, その語義だけを根拠にした正解候補)。日本語訳の無い語義は省く。

        単語帳の日本語訳と突き合わせて、学習者が覚えた語義の言い換えだけを出すために使う
        (mundane = 平凡な → everyday。「この世の」の語義の terrestrial は出さない)。
        """
        senses: list[tuple[list[str], list[str]]] = []
        for synset_id in self.lemma_synsets[head][pos]:
            japanese = self.japanese.get(synset_id, [])
            if not japanese:
                continue
            answers = self.collect_answers(head, pos, [synset_id])[:ANSWERS_PER_SENSE]
            # 言い換えの無い語義も日本語訳だけは残す。単語帳の訳がその語義に合うなら、
            # 他の語義の言い換えを出すより「無し」が正しい (mistake for = 〜と間違える に slip を出さない)
            limit = JAPANESE_LEMMAS_PER_SENSE if answers else JAPANESE_LEMMAS_PER_EMPTY_SENSE
            senses.append((select_japanese_lemmas(japanese, limit), answers))
        return senses

    def build_entry(self, head: str, pos: str, rng: random.Random):
        answers = self.collect_answers(head, pos)
        if not answers:
            return None
        same, hypernyms, direct, far, _ = self.related_lemmas(head, pos)
        hyponym_words = self._last_hyponyms
        moby_fwd = self.moby.get(head, set())

        # 誤答: 正解のどれとも同義・近縁でない同品詞の語を、正解と同じ頻度帯から。
        # 語義ごとの正解候補も全部外す (どの語義で出題しても答えが割れないように)。
        senses = self.collect_senses(head, pos)
        excluded: set[str] = set(same) | set(hypernyms) | set(direct) | set(far) | set(hyponym_words) | moby_fwd | {head}
        for _, sense_answers in senses:
            excluded |= set(sense_answers)
        for answer in answers:
            a_same, a_hyper, a_direct, a_far, _ = self.related_lemmas(answer, pos)
            excluded |= set(a_same) | set(a_hyper) | set(a_direct) | set(a_far) | set(self._last_hyponyms)
            excluded |= self.moby.get(answer, set())
        anchor_rank = self.ranks[answers[0]]
        low = anchor_rank / DISTRACTOR_RANK_RATIO
        high = min(DISTRACTOR_MAX_RANK, anchor_rank * DISTRACTOR_RANK_RATIO)
        pool = self.distractor_pool[pos]
        pool_ranks = self.distractor_pool_ranks[pos]

        def acceptable(lemma: str) -> bool:
            return lemma not in excluded and not any(is_variant(lemma, other) for other in (head, *answers))

        def draw(indices: list[int], picked: list[str]) -> None:
            # 全部を調べずに、無作為に見ていって足りるまで拾う (見出し語ごとに数千語を総当たりしない)
            rng.shuffle(indices)
            for index in indices:
                lemma = pool[index]
                if lemma in picked or not acceptable(lemma):
                    continue
                picked.append(lemma)
                if len(picked) >= DISTRACTORS_PER_ENTRY:
                    return

        distractors: list[str] = []
        band_start = bisect.bisect_left(pool_ranks, low)
        band_end = bisect.bisect_right(pool_ranks, high)
        draw(list(range(band_start, band_end)), distractors)
        if len(distractors) < DISTRACTORS_PER_ENTRY:
            draw([i for i in range(len(pool)) if i < band_start or i >= band_end], distractors)
        if len(distractors) < 3:
            return None
        return answers, distractors, senses

    POS_TIE_ORDER = {"v": 0, "a": 1, "n": 2, "r": 3}

    def pos_order(self, head: str) -> list[str]:
        """品詞は synset の多い順 (その語の主な使われ方)。同数なら動詞・形容詞を名詞より先にする
        (cope / plunge のように、名詞の語義は WordNet にはあっても学習者が覚えるのは動詞)。"""
        by_pos = self.lemma_synsets[head]
        return sorted(by_pos.keys(), key=lambda p: (-len(by_pos[p]), self.POS_TIE_ORDER.get(p, 9)))

    def build(self):
        rng = random.Random(SEED)
        vocab: dict[str, int] = {}

        def index_of(word: str) -> int:
            if word not in vocab:
                vocab[word] = len(vocab)
            return vocab[word]

        entries: dict[str, list] = {}
        for head in sorted(self.lemma_synsets.keys()):
            if not HEADWORD_RE.match(head):
                continue
            built = []
            for pos in self.pos_order(head):
                if self.pos_share(head, pos) < ANSWER_MIN_POS_SHARE:
                    continue  # 従属的な品詞 (plummet の名詞など) は出題しない
                result = self.build_entry(head, pos, rng)
                if result is None:
                    continue
                answers, distractors, senses = result
                built.append([
                    pos,
                    [index_of(a) for a in answers],
                    [index_of(d) for d in distractors],
                    [[japanese, [index_of(a) for a in sense_answers]] for japanese, sense_answers in senses],
                ])
            if built:
                entries[head] = built
        return {
            "version": DATASET_VERSION,
            "generatedAt": dt.date.today().isoformat(),
            "sources": [
                {"name": "Open English WordNet", "license": "CC BY 4.0", "url": "https://github.com/globalwordnet/english-wordnet"},
                {"name": "Princeton WordNet 3.1 (sense tag counts)", "license": "WordNet License", "url": "https://wordnet.princeton.edu/"},
                {"name": "Moby Thesaurus II", "license": "Public Domain", "url": "https://github.com/zeke/moby"},
                {"name": "gwordlist (Google Books Ngram)", "license": "CC BY 3.0", "url": "https://github.com/hackerb9/gwordlist"},
                {"name": "Japanese WordNet (NICT)", "license": "Japanese WordNet License", "url": "https://github.com/omwn/omw-data"},
            ],
            "vocab": [word for word, _ in sorted(vocab.items(), key=lambda item: item[1])],
            "entries": entries,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", default=str(REPO_ROOT / ".cache" / "paraphrase-sources"))
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    parser.add_argument("--inspect", default="", help="カンマ区切りの見出し語。生成結果を表示して終わる")
    args = parser.parse_args()
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    synsets = load_oewn_synsets(cache_dir)
    log(f"synsets: {len(synsets)}")
    sense_order, sense_keys = load_oewn_sense_order(cache_dir)
    log(f"lemmas with sense order: {len(sense_order)}")
    moby = load_moby(cache_dir)
    log(f"moby headwords: {len(moby)}")
    ranks = load_frequency_ranks(cache_dir)
    log(f"frequency ranks: {len(ranks)}")
    tag_counts = load_sense_tag_counts(cache_dir)
    log(f"sense tag counts: {len(tag_counts)}")
    japanese = load_japanese_lemmas(cache_dir, synsets)

    builder = Builder(synsets, sense_order, moby, ranks, sense_keys, tag_counts, japanese)

    if args.inspect:
        rng = random.Random(SEED)
        for head in [normalize_lemma(h) for h in args.inspect.split(",") if h.strip()]:
            if head not in builder.lemma_synsets:
                print(f"{head}: (WordNet に無い)")
                continue
            for pos in builder.pos_order(head):
                if builder.pos_share(head, pos) < ANSWER_MIN_POS_SHARE:
                    continue
                result = builder.build_entry(head, pos, rng)
                if result is None:
                    print(f"{head} [{pos}] -> None")
                    continue
                answers, distractors, senses = result
                print(f"{head} [{pos}] -> {answers} / 誤答 {distractors}")
                for japanese, sense_answers in senses:
                    print(f"    語義 {japanese} -> {sense_answers}")
        return

    dataset = builder.build()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # 日本語訳を含むので UTF-8 のまま書く (\uXXXX にすると 6 倍に膨らむ)
    output.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    log(f"entries: {len(dataset['entries'])}, vocab: {len(dataset['vocab'])}, bytes: {output.stat().st_size}")


if __name__ == "__main__":
    main()
