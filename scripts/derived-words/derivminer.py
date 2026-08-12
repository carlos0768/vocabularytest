"""
derivminer.py — 派生語 (同一レンマの品詞変化形) の族を綴り+頻度だけから教師なしで抽出する。

rootminer.py が「接頭辞軸」(re-/con-/pro- + 同一語根) を掘るのに対し、
こちらは「接尾辞軸」(analyze / analysis / analytical / analyst) を掘る。
受験・TOEFL・IELTS で言う「派生語」は後者なので、判定器にはこの軸が要る。

v1 は「幹を1つの正規化キーに畳む」方式だったが、短い幹で過剰併合し
(cons: consist/condition/condor)、不規則交替で併合漏れした (analyze/analysis)。
v2 は rootminer の Stage3 と同じ発想に戻し、
  「接尾辞を剥がした幹どうしを対で比較し、末尾1字の交替だけ許す」
方式にする。交替は幹長 >= 5 のときだけ許可することで cond/cons 型の
偶然の衝突を落とす (decid/decis は通る)。
"""
from __future__ import annotations
from collections import defaultdict

import rootminer as R

# ─────────────────────────────────────────────────────────────
# 1. 接尾辞インベントリ: 派生 (品詞を変える) と屈折 (変えない) を分ける
#    pine -> pines/pined/pining は屈折のみ = 派生語なし = 学ぶ価値なし。
#    この区別が pine を落とす主機構。
# ─────────────────────────────────────────────────────────────
INFLECTION = ("s", "es", "ed", "ing", "ings")

DERIV_POS = {
    "noun": ("ication", "ification", "ability", "ibility", "ation", "ition", "ution",
             "ment", "ance", "ence", "ancy", "ency", "ity", "ness", "ship", "hood",
             "ism", "ist", "ant", "ent", "ure", "age", "sion", "tion", "ion",
             "sis", "or", "er", "ee", "cy", "ty", "al", "y"),
    "verb": ("ize", "ise", "ify", "ate", "yze", "yse", "en", "ze"),
    "adjective": ("ational", "ative", "itive", "able", "ible", "ive", "ous", "ious",
                  "eous", "ful", "less", "ical", "ic", "al", "ary", "ory", "ual",
                  "ial", "ant", "ent", "ile", "ish"),
    "adverb": ("ically", "ally", "ly"),
}
SUF2POS = defaultdict(set)
for pos, sufs in DERIV_POS.items():
    for s in sufs:
        SUF2POS[s].add(pos)
DERIV_SUFFIXES = sorted(SUF2POS, key=len, reverse=True)

MIN_STEM = 4          # 幹の最短長 (完全一致で併合してよい下限)
MIN_ALT_STEM = 5      # 末尾交替を許すのはこの長さ以上 (cond/cons 衝突の防止線)

# ラテン系の現在幹/完了幹交替。末尾1字だけを対で見る。
ALT_PAIRS = {
    frozenset("ds"), frozenset("ts"), frozenset("zs"), frozenset("ct"),
    frozenset("vb"), frozenset("bp"), frozenset("gc"),
}
ALT_CHARS = set("".join("".join(p) for p in ALT_PAIRS))


def stems(word: str) -> set[str]:
    """word が取りうる幹の集合 (屈折->派生の順に最大2層ずつ剥がす)。"""
    out = set()
    frontier = {word}
    for suffixes, rounds in ((INFLECTION, 1), (DERIV_SUFFIXES, 2)):
        for _ in range(rounds):
            nxt = set()
            for body in frontier:
                for sf in suffixes:
                    if not body.endswith(sf):
                        continue
                    base = body[: -len(sf)]
                    if len(base) < MIN_STEM:
                        continue
                    nxt.add(base)
                    # 綴り復元: 語尾 e の復活 / y<->i
                    nxt.add(base + "e")
                    if base.endswith("i"):
                        nxt.add(base[:-1] + "y")
            frontier |= nxt
    for body in frontier:
        if len(body) >= MIN_STEM:
            out.add(body)
            if body.endswith("e") and len(body) - 1 >= MIN_STEM:
                out.add(body[:-1])
    return out


def suffix_between(word: str, stem: str) -> str | None:
    """word が stem からどの派生接尾辞で作られたか (最長一致)。屈折のみなら None。"""
    for sf in DERIV_SUFFIXES:
        if not word.endswith(sf):
            continue
        base = word[: -len(sf)]
        if len(base) < MIN_STEM:
            continue
        for cand in (base, base + "e", base[:-1] + "y" if base.endswith("i") else base):
            if cand == stem:
                return sf
            # 末尾交替 (decid/decis)
            if (len(cand) >= MIN_ALT_STEM and len(stem) == len(cand)
                    and cand[:-1] == stem[:-1]
                    and frozenset(cand[-1] + stem[-1]) in ALT_PAIRS):
                return sf
    return None


# ─────────────────────────────────────────────────────────────
# 2. 語彙全体の索引。完全一致幹と「末尾1字を伏せた幹」の2本を張る。
# ─────────────────────────────────────────────────────────────
BAND = [w for w in R.WORDS if R.ZIPF.get(w, 0) >= R.FLOOR_ZIPF]

exact_idx = defaultdict(set)   # stem -> words
alt_idx = defaultdict(set)     # stem[:-1] -> (word, lastchar)
WORD_STEMS = {}

for w in BAND:
    ss = stems(w)
    WORD_STEMS[w] = ss
    for s in ss:
        exact_idx[s].add(w)
        if len(s) >= MIN_ALT_STEM and s[-1] in ALT_CHARS:
            alt_idx[s[:-1]].add((w, s[-1]))


def related_words(word: str) -> set[str]:
    """word と同一派生族になりうる語 (綴り証拠のみ)。"""
    out = set()
    for s in WORD_STEMS.get(word, stems(word)):
        out |= exact_idx.get(s, set())
        if len(s) >= MIN_ALT_STEM and s[-1] in ALT_CHARS:
            for other, ch in alt_idx.get(s[:-1], ()):
                if frozenset(ch + s[-1]) in ALT_PAIRS:
                    out.add(other)
    out.discard(word)
    return out


def is_native_ish(word: str) -> bool:
    """rootminer の綴り証拠を流用した native 判定 (推測可能な派生を落とす)。"""
    return (any(x in word for x in R.NATIVE_ORTH)
            or any(word.endswith(x) for x in R.NATIVE_SUF))


# 判定器は「派生語を列挙する器」ではなく「AIに聞く価値があるかを決める器」。
# 実際の派生語生成は AI が行い、不規則形 (receive->reception, analyze->analytical)
# も AI 側が知っている。したがって閾値は「派生的に生産的である証拠が1つでもあるか」
# で足り、コーパスに全派生形が揃っている必要はない。
MIN_DERIV = 1
MIN_NATIVE_POS = 3     # native 系はより厳しく (品詞3種)

# ラテン系派生の証拠となる接尾辞。
# -able/-er/-ly/-ness は native 語幹にも自由に付くので証拠から除く
# (understand -> understandable を「学ぶ価値のある派生」と誤認しないため)。
LATINATE_EVIDENCE = {
    "ication", "ification", "ability", "ibility", "ation", "ition", "ution",
    "ment", "ance", "ence", "ancy", "ency", "ity", "ism", "ist", "ure",
    "sion", "tion", "ion", "sis", "ize", "ise", "ify", "ate", "yze", "yse",
    "ative", "itive", "ive", "ous", "ious", "eous", "ical", "ic", "ary", "ory",
    "ual", "ial", "ant", "ent", "ational", "al", "ally",
}
# 注: -y は幹の切り出し (economy -> econom) には使うが、証拠には数えない。
# water -> watery のような native 派生を拾ってしまうため。


def deriv_family(word: str):
    """(幹, [(派生語, 接尾辞, 品詞)], 品詞集合, 効用和) を返す。"""
    cands = related_words(word)
    if not cands:
        return None

    best = None
    for stem in WORD_STEMS.get(word, stems(word)):
        rows, poses = [], set()
        for other in cands:
            sf = suffix_between(other, stem)
            if sf is None:
                continue                    # 屈折のみ / 対応づかない = 派生語ではない
            pc = SUF2POS.get(sf)
            if not pc:
                continue
            rows.append((other, sf, sorted(pc)[0]))
            poses |= pc
        if not rows:
            continue
        y = sum(R.utility(m) for m, _, _ in rows)
        # 同点時はラテン系派生を持つ族を優先する。
        # evident は幹 "evident"->evidently(-ly) と幹 "evid"->evidence(-ence) の
        # 2解を持つが、学習価値があるのは後者。
        n_lat = sum(1 for _, sf, _ in rows if sf in LATINATE_EVIDENCE)
        score = (n_lat, len(rows), y)
        if best is None or score > best[4]:
            best = (stem, rows, poses, y, score)
    return best[:4] if best else None


def decide_deriv(word: str) -> dict:
    w = word.lower().strip()
    z = R.zipf_frequency(w, "en")
    out = {"word": w, "zipf": round(z, 2)}
    if z < R.FLOOR_ZIPF:
        return {**out, "ok": False, "why": f"頻度が低すぎる (Zipf {z:.1f})"}

    fam = deriv_family(w)
    if fam is None:
        return {**out, "ok": False, "why": "派生語が見つからない (屈折変化のみ)"}
    stem, rows, poses, y = fam

    band = [r for r in rows if R.ZIPF.get(r[0], 0) >= R.FLOOR_ZIPF]
    if len(band) < MIN_DERIV:
        return {**out, "ok": False, "stem": stem,
                "why": f"学習価値帯の派生語が {len(band)} 語のみ"}
    if is_native_ish(w) and len(poses) < MIN_NATIVE_POS:
        return {**out, "ok": False, "stem": stem,
                "why": f"native系で派生が推測可能 (品詞 {sorted(poses)})"}
    if not any(sf in LATINATE_EVIDENCE for _, sf, _ in band):
        return {**out, "ok": False, "stem": stem,
                "why": "ラテン系の品詞変化がない (-able/-er/-ly 程度で推測可)"}

    rows.sort(key=lambda r: -R.ZIPF.get(r[0], 0))
    return {**out, "ok": True, "stem": stem, "yield": round(y, 1),
            "pos": sorted(poses), "family": rows[:14]}


if __name__ == "__main__":
    import sys
    tests = sys.argv[1:] or [
        "analyze", "establish", "identify", "significant", "evident", "respond",
        "decide", "produce", "receive", "consist", "maintain", "compete",
        "pine", "tree", "dog", "happiness", "beautiful", "understand", "run", "cat",
    ]
    for t in tests:
        d = decide_deriv(t)
        print(f"\n■ {'OK ' if d['ok'] else 'NG '} {d['word']} (Zipf {d['zipf']})")
        if d["ok"]:
            print(f"   幹={d['stem']}  品詞={d['pos']}  回収量={d['yield']}")
            print("   派生語: " + ", ".join(f"{m}({sf})" for m, sf, _ in d["family"][:10]))
        else:
            print(f"   却下: {d['why']}")
