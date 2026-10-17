#!/usr/bin/env python3
"""スキャンで付ける例文のストック (src/lib/open-examples/dataset.json) を生成する。

見出し語 → 英文と和訳の対、の表をオープンデータだけから作る。AI は使わない。
単語帳の日本語訳に合う例文を選ぶのは実行時 (src/lib/open-examples/dataset.ts) なので、
ここでは見出し語ごとに候補を数件ずつ (できるだけ違う和訳で) 残すだけにする。

データ源:
  - Tatoeba (CC BY 2.0 FR)              … 英文・和文と、その対訳リンク
      https://downloads.tatoeba.org/exports/per_language/{eng,jpn}/...
  - Princeton WordNet 3.1 (WordNet License) … 見出し語の一覧 (熟語を含む)
      npm パッケージ wordnet-db の dict/index.{noun,verb,adj,adv}
  - wink-lexicon (MIT, WordNet の例外表由来) … 不規則変化 (ran → run, children → child)
      npm パッケージ wink-lexicon の src/wn-*-exceptions.js (node で読み出す)

使い方:
  python3 scripts/open-examples/build_dataset.py [--cache-dir .cache/open-examples-sources]
  python3 scripts/open-examples/build_dataset.py --inspect run,"give up",bank

詳しくは同じディレクトリの README.md。
"""

from __future__ import annotations

import argparse
import bz2
import datetime as dt
import json
import re
import subprocess
import sys
import tarfile
import urllib.request
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "src" / "lib" / "open-examples" / "dataset.json"
DATASET_VERSION = 1

TATOEBA_BASE = "https://downloads.tatoeba.org/exports/per_language/"
TATOEBA_ENG_SENTENCES_URL = TATOEBA_BASE + "eng/eng_sentences.tsv.bz2"
TATOEBA_JPN_SENTENCES_URL = TATOEBA_BASE + "jpn/jpn_sentences.tsv.bz2"
TATOEBA_ENG_JPN_LINKS_URL = TATOEBA_BASE + "eng/eng-jpn_links.tsv.bz2"
# 言語対ごとのリンクが取れないときの予備 (全言語ぶん。大きい)
TATOEBA_ALL_LINKS_URL = "https://downloads.tatoeba.org/exports/links.tar.bz2"
# 「要ネイティブ確認」などの印。無くても作れる (取れなければ使わない)
TATOEBA_TAGS_URL = "https://downloads.tatoeba.org/exports/tags.tar.bz2"
WORDNET_DB_TARBALL_URL = "https://registry.npmjs.org/wordnet-db/-/wordnet-db-3.1.14.tgz"
WINK_LEXICON_TARBALL_URL = "https://registry.npmjs.org/wink-lexicon/-/wink-lexicon-2.2.0.tgz"

SOURCES = [
    {"name": "Tatoeba", "license": "CC BY 2.0 FR", "url": "https://tatoeba.org/"},
    {"name": "Princeton WordNet 3.1 (headwords)", "license": "WordNet License", "url": "https://wordnet.princeton.edu/"},
    {"name": "wink-lexicon (WordNet exception lists)", "license": "MIT", "url": "https://github.com/winkjs/wink-lexicon"},
]

# 見出し語ごとに残す候補の数。和訳との突き合わせは実行時なので、多義語でも当たるよう
# できるだけ違う和訳を残す。増やすと dataset.json が太る。
CANDIDATES_PER_HEADWORD = 5
# 同じ英文から残す和訳の数 (英文 1 つに和訳が何本も付いていることがある)
TRANSLATIONS_PER_SENTENCE = 2
# 学習に向く長さ (語数)。外れるものは点を下げる (捨てはしない)
IDEAL_MIN_WORDS = 5
IDEAL_MAX_WORDS = 12
HARD_MAX_WORDS = 25
HARD_MAX_JA_CHARS = 80
# これより多く大文字始まり (文頭以外) で出る語は固有名詞とみなす (tom, mary, …)
PROPER_NOUN_RATIO = 0.5
# 印の付いた文は使わない (Tatoeba のタグ名)
BAD_TAGS = {"@needs native check", "@change", "@check", "@delete", "@neg", "@fragment", "@not a sentence"}
# 熟語の所有格の置き場所 (WordNet の one's)
POSSESSIVES = {"my", "your", "his", "her", "its", "our", "their", "one's"}

TOKEN_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
LEMMA_RE = re.compile(r"^[a-z][a-z'_-]*[a-z]$|^[a-z]$")


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def download(url: str, target: Path) -> None:
    if target.exists():
        return
    log(f"download {url}")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as response, tmp.open("wb") as out:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    tmp.rename(target)


# ---------- WordNet: 見出し語と不規則変化 ----------

def load_headwords(cache_dir: Path) -> set[str]:
    """WordNet の全見出し語 (小文字、熟語は空白区切り)。"""
    tarball = cache_dir / "wordnet-db-3.1.14.tgz"
    download(WORDNET_DB_TARBALL_URL, tarball)
    headwords: set[str] = set()
    with tarfile.open(tarball) as archive:
        for pos in ("noun", "verb", "adj", "adv"):
            member = archive.extractfile(f"package/dict/index.{pos}")
            assert member is not None
            for raw in member.read().decode("utf-8").splitlines():
                if not raw or raw.startswith(" "):
                    continue
                lemma = raw.split(" ", 1)[0].lower()
                if not LEMMA_RE.match(lemma) or any(ch.isdigit() for ch in lemma):
                    continue
                # 本文の語切りはハイフンでも切るので、well-known も well known として持つ
                headwords.add(re.sub(r"[_-]+", " ", lemma))
    return headwords


def load_exceptions(cache_dir: Path) -> dict[str, set[str]]:
    """変化形 → 原形 (複数ありうる)。wink-lexicon の JS を node で JSON にして読む。"""
    cached = cache_dir / "wink-exceptions.json"
    if not cached.exists():
        tarball = cache_dir / "wink-lexicon-2.2.0.tgz"
        download(WINK_LEXICON_TARBALL_URL, tarball)
        extract_dir = cache_dir / "wink-lexicon"
        if not extract_dir.exists():
            with tarfile.open(tarball) as archive:
                try:
                    archive.extractall(extract_dir, filter="data")
                except TypeError:  # Python < 3.12
                    archive.extractall(extract_dir)
        src = extract_dir / "package" / "src"
        script = (
            "const out={};"
            "for (const f of ['wn-noun-exceptions','wn-verb-exceptions','wn-adjective-exceptions']) {"
            f"  const m=require({json.dumps(str(src))}+'/'+f+'.js');"
            "  for (const [k,v] of Object.entries(m)) { (out[k] ||= []).push(...[].concat(v)); }"
            "}"
            "process.stdout.write(JSON.stringify(out));"
        )
        result = subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True)
        cached.write_text(result.stdout)
    raw = json.loads(cached.read_text())
    return {form.lower(): {base.lower() for base in bases if isinstance(base, str)} for form, bases in raw.items()}


# WordNet の morphy と同じ規則 (語尾の付け替え)。品詞をまたいでまとめて試す。
_DETACHMENT_RULES = [
    ("s", ""), ("ses", "s"), ("xes", "x"), ("zes", "z"), ("ches", "ch"), ("shes", "sh"),
    ("men", "man"), ("ies", "y"),
    ("es", "e"), ("es", ""), ("ed", "e"), ("ed", ""), ("ing", "e"), ("ing", ""),
    ("er", ""), ("est", ""), ("er", "e"), ("est", "e"),
]


def base_forms(token: str, headwords_single: set[str], exceptions: dict[str, set[str]]) -> set[str]:
    """語形 token の原形の候補 (WordNet にある語だけ)。token 自身も含む。"""
    forms: set[str] = set()
    if token in headwords_single:
        forms.add(token)
    forms.update(base for base in exceptions.get(token, ()) if base in headwords_single)
    for suffix, replacement in _DETACHMENT_RULES:
        if token.endswith(suffix) and len(token) > len(suffix) + 1:
            stem = token[: -len(suffix)] + replacement
            if stem in headwords_single:
                forms.add(stem)
            # running → runn → run, bigger → bigg → big
            if replacement == "" and len(stem) >= 3 and stem[-1] == stem[-2] and stem[:-1] in headwords_single:
                forms.add(stem[:-1])
    return forms


# ---------- Tatoeba ----------

def read_sentences(path: Path) -> dict[int, str]:
    sentences: dict[int, str] = {}
    with bz2.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            try:
                sentences[int(parts[0])] = parts[2].strip()
            except ValueError:
                continue
    return sentences


def read_links(cache_dir: Path, eng_ids: set[int], jpn_ids: set[int]) -> list[tuple[int, int]]:
    pair_path = cache_dir / "tatoeba-eng-jpn_links.tsv.bz2"
    try:
        download(TATOEBA_ENG_JPN_LINKS_URL, pair_path)
        opener = lambda: bz2.open(pair_path, "rt", encoding="utf-8")  # noqa: E731
    except Exception as error:  # 言語対のリンクが無ければ全言語のリンクから拾う
        log(f"eng-jpn links unavailable ({error}); falling back to links.tar.bz2")
        all_path = cache_dir / "tatoeba-links.tar.bz2"
        download(TATOEBA_ALL_LINKS_URL, all_path)

        def opener():
            archive = tarfile.open(all_path)
            member = next(m for m in archive.getmembers() if m.name.endswith("links.csv"))
            import io
            return io.TextIOWrapper(archive.extractfile(member), encoding="utf-8")  # type: ignore[arg-type]

    links: set[tuple[int, int]] = set()
    with opener() as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 2:
                continue
            try:
                left, right = int(parts[0]), int(parts[1])
            except ValueError:
                continue
            if left in eng_ids and right in jpn_ids:
                links.add((left, right))
            elif right in eng_ids and left in jpn_ids:
                links.add((right, left))
    return sorted(links)


def read_bad_sentence_ids(cache_dir: Path) -> set[int]:
    path = cache_dir / "tatoeba-tags.tar.bz2"
    try:
        download(TATOEBA_TAGS_URL, path)
    except Exception as error:
        log(f"tags unavailable ({error}); continuing without tag filtering")
        return set()
    bad: set[int] = set()
    import io
    with tarfile.open(path) as archive:
        member = next((m for m in archive.getmembers() if m.name.endswith("tags.csv")), None)
        if member is None:
            return bad
        with io.TextIOWrapper(archive.extractfile(member), encoding="utf-8") as handle:  # type: ignore[arg-type]
            for line in handle:
                parts = line.rstrip("\n").split("\t")
                if len(parts) >= 2 and parts[1].strip().lower() in BAD_TAGS:
                    try:
                        bad.add(int(parts[0]))
                    except ValueError:
                        pass
    return bad


# ---------- 突き合わせ ----------

def sentence_score(english: str, japanese: str, word_count: int) -> float:
    """小さいほど良い。長さが学習向きか、記号が少ないか。"""
    score = 0.0
    if word_count < IDEAL_MIN_WORDS:
        score += (IDEAL_MIN_WORDS - word_count) * 0.6
    elif word_count > IDEAL_MAX_WORDS:
        score += (word_count - IDEAL_MAX_WORDS) * 0.4
    if '"' in english or "“" in english or ";" in english:
        score += 1.0
    if not english[:1].isupper():
        score += 1.0
    if english[-1:] not in ".!?":
        score += 1.0
    if len(japanese) > 45:
        score += (len(japanese) - 45) * 0.05
    return score


def build(cache_dir: Path, inspect: list[str] | None) -> dict:
    headwords = load_headwords(cache_dir)
    headwords_single = {headword for headword in headwords if " " not in headword}
    exceptions = load_exceptions(cache_dir)
    log(f"headwords: {len(headwords)} (single {len(headwords_single)}), exception forms: {len(exceptions)}")

    eng_path = cache_dir / "tatoeba-eng_sentences.tsv.bz2"
    jpn_path = cache_dir / "tatoeba-jpn_sentences.tsv.bz2"
    download(TATOEBA_ENG_SENTENCES_URL, eng_path)
    download(TATOEBA_JPN_SENTENCES_URL, jpn_path)
    eng = read_sentences(eng_path)
    jpn = read_sentences(jpn_path)
    links = read_links(cache_dir, set(eng), set(jpn))
    bad_ids = read_bad_sentence_ids(cache_dir)
    log(f"eng {len(eng)} / jpn {len(jpn)} / eng-jpn links {len(links)} / tagged-bad {len(bad_ids)}")

    translations: dict[int, list[int]] = defaultdict(list)
    for eng_id, jpn_id in links:
        if eng_id in bad_ids or jpn_id in bad_ids:
            continue
        japanese = jpn[jpn_id]
        if not japanese or len(japanese) > HARD_MAX_JA_CHARS:
            continue
        translations[eng_id].append(jpn_id)

    # 固有名詞らしさ: 文頭以外で大文字始まりの割合
    capitalized = defaultdict(int)
    mid_total = defaultdict(int)
    tokenized: dict[int, list[str]] = {}
    for eng_id in translations:
        raw_tokens = TOKEN_RE.findall(eng[eng_id])
        if not raw_tokens or len(raw_tokens) > HARD_MAX_WORDS:
            continue
        tokenized[eng_id] = raw_tokens
        for index, raw in enumerate(raw_tokens):
            if index == 0:
                continue
            lower = raw.lower()
            mid_total[lower] += 1
            if raw[0].isupper():
                capitalized[lower] += 1
    proper_like = {
        token for token, total in mid_total.items()
        if total >= 3 and capitalized[token] / total > PROPER_NOUN_RATIO
    }

    # 熟語を先頭の語の原形から引けるようにする
    multiword_by_first: dict[str, list[list[str]]] = defaultdict(list)
    for headword in headwords:
        if " " in headword:
            parts = headword.split(" ")
            multiword_by_first[parts[0]].append(parts)

    form_cache: dict[str, set[str]] = {}

    def forms_of(token: str) -> set[str]:
        cached = form_cache.get(token)
        if cached is None:
            cached = base_forms(token, headwords_single, exceptions)
            form_cache[token] = cached
        return cached

    def part_matches(part: str, token: str) -> bool:
        if part == "one's":
            return token in POSSESSIVES
        return token == part or part in forms_of(token)

    # 見出し語 → [(点, 英文ID, 和文ID)]
    candidates: dict[str, list[tuple[float, int, int]]] = defaultdict(list)
    for eng_id, raw_tokens in tokenized.items():
        english = eng[eng_id]
        tokens = [raw.lower() for raw in raw_tokens]
        found: set[str] = set()
        for index, token in enumerate(tokens):
            if index > 0 and raw_tokens[index][0].isupper() and token in proper_like:
                continue
            for base in forms_of(token):
                if base not in proper_like:
                    found.add(base)
                for parts in multiword_by_first.get(base, ()):
                    window = tokens[index:index + len(parts)]
                    if len(window) == len(parts) and all(part_matches(p, t) for p, t in zip(parts[1:], window[1:])):
                        found.add(" ".join(parts))
        if not found:
            continue
        for jpn_id in translations[eng_id][:TRANSLATIONS_PER_SENTENCE]:
            score = sentence_score(english, jpn[jpn_id], len(tokens))
            for headword in found:
                candidates[headword].append((score, eng_id, jpn_id))

    # 見出し語ごとに上位を残す。同じ和訳・同じ英文が並ばないようにする
    # (実行時に単語帳の訳で語義を選ぶので、和訳のばらつきが当たりやすさになる)
    entries: dict[str, list[int]] = {}
    pair_index: dict[tuple[int, int], int] = {}
    pairs: list[list] = []
    for headword in sorted(candidates):
        chosen: list[tuple[int, int]] = []
        seen_eng: set[int] = set()
        seen_ja: set[str] = set()
        ranked = sorted(candidates[headword], key=lambda item: (item[0], item[1], item[2]))
        for _, eng_id, jpn_id in ranked:
            japanese = jpn[jpn_id]
            if eng_id in seen_eng or japanese in seen_ja:
                continue
            chosen.append((eng_id, jpn_id))
            seen_eng.add(eng_id)
            seen_ja.add(japanese)
            if len(chosen) >= CANDIDATES_PER_HEADWORD:
                break
        refs: list[int] = []
        for key in chosen:
            if key not in pair_index:
                pair_index[key] = len(pairs)
                pairs.append([key[0], eng[key[0]], key[1], jpn[key[1]]])
            refs.append(pair_index[key])
        entries[headword] = refs

    if inspect:
        for word in inspect:
            refs = entries.get(word.strip().lower(), [])
            print(f"== {word} ({len(refs)})")
            for ref in refs:
                print(f"  {pairs[ref][1]}  /  {pairs[ref][3]}")

    log(f"headwords with examples: {len(entries)}, pairs: {len(pairs)}")
    return {
        "version": DATASET_VERSION,
        "generatedAt": dt.date.today().isoformat(),
        "sources": SOURCES,
        "pairs": pairs,
        "entries": entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache-dir", default=str(REPO_ROOT / ".cache" / "open-examples-sources"))
    parser.add_argument("--inspect", help="カンマ区切りの見出し語の候補を表示する (書き出しはしない)")
    args = parser.parse_args()
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    inspect = [word for word in args.inspect.split(",") if word.strip()] if args.inspect else None
    dataset = build(cache_dir, inspect)
    if inspect:
        return
    OUTPUT_PATH.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    log(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
