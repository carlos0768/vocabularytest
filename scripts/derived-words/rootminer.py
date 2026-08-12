"""
rootminer.py
高投資対効果な「語根 (root)」を、綴り(文字列)情報と頻度情報だけから教師なしで抽出する。

Pipeline
  Stage 0: 語彙・頻度のロード
  Stage 1: 接辞候補による過剰生成パース (over-generation)
  Stage 2: 語根の支持度によるフィルタ (MDL 的な圧縮判定)
  Stage 3: 異形態 (allomorph) の教師なし統合  ← duc/duct, mit/miss ...
  Stage 4: 束縛語根判定 (native ①  vs  Latinate ②) の純綴り分類
  Stage 5: 重み付き最大被覆の貪欲解 → 学習順序の決定
"""
from __future__ import annotations
import math, json, re
from collections import defaultdict
from wordfreq import top_n_list, zipf_frequency

# ─────────────────────────────────────────────────────────────
# Stage 0. 語彙
# ─────────────────────────────────────────────────────────────
N_VOCAB = 60000
WORDS = [w for w in top_n_list("en", N_VOCAB) if w.isalpha() and len(w) >= 3]
WORDSET = set(WORDS)
ZIPF = {w: zipf_frequency(w, "en") for w in WORDS}

# 学習者が既知と仮定する帯域。Zipf>=KNOWN は投資対象外(既に知っている)
KNOWN_ZIPF = 5.0
# 下限。これ以下は稀すぎて入試/学術文でも回収できない
FLOOR_ZIPF = 2.6

def utility(w: str) -> float:
    """語 w を理解できるようになることの効用。中頻度帯にピークを持たせる。"""
    z = ZIPF.get(w, 0.0)
    if z < FLOOR_ZIPF or z >= KNOWN_ZIPF:
        return 0.0
    # Zipf は対数尺度。効用は出現回数の対数に比例させ、既知帯に近づくほど減衰
    return (z - FLOOR_ZIPF) * (KNOWN_ZIPF - z)

# ─────────────────────────────────────────────────────────────
# Stage 1. 接辞インベントリ (同化形 assimilation を表層形として列挙)
# ─────────────────────────────────────────────────────────────
# surface -> canonical
PREFIX = {}
def _reg(canon, *forms):
    for f in forms:
        PREFIX[f] = canon

_reg("ad-", "ad", "ac", "af", "ag", "al", "an", "ap", "ar", "as", "at")
_reg("con-", "con", "com", "col", "cor", "co")
_reg("in(not/into)-", "in", "im", "il", "ir")
_reg("sub-", "sub", "suc", "suf", "sug", "sup", "sus", "sur")
_reg("ob-", "ob", "oc", "of", "op")
_reg("ex-", "ex", "ef", "ec")
_reg("dis-", "dis", "dif", "di")
_reg("re-", "re")
_reg("pro-", "pro")
_reg("pre-", "pre")
_reg("de-", "de")
_reg("trans-", "trans", "tra")
_reg("inter-", "inter", "intel")
_reg("per-", "per", "pel")
_reg("se-", "se")
_reg("ab-", "ab", "abs")
_reg("circum-", "circum")
_reg("contra-", "contra", "counter", "contro")
_reg("post-", "post")
_reg("super-", "super", "sur")
_reg("retro-", "retro")
_reg("intro-", "intro", "intra")
_reg("ultra-", "ultra")
_reg("mal-", "mal")
_reg("bene-", "bene")
_reg("∅-", "")          # 無接頭辞。過剰分割を打ち消す対抗仮説として必須

# 長い順に試す
PREFIX_SORTED = sorted(PREFIX, key=len, reverse=True)

SUFFIX = [
    "ationally", "ification", "abilities", "ibilities",
    "ational", "ivenessly", "ability", "ibility", "aciously", "iciously",
    "ization", "isation", "ational", "atively", "itively",
    "ations", "ations", "ations",
    "ation", "ition", "ution", "ution", "ement", "ments", "ivity", "ative",
    "itive", "ically", "iously", "eously", "ariness",
    "ance", "ence", "ancy", "ency", "ants", "ents", "ment", "sion", "tion",
    "ious", "eous", "able", "ible", "ical", "ance", "ture", "sure", "cion",
    "ize", "ise", "ify", "ity", "ive", "ous", "ant", "ent", "ate", "ary",
    "ory", "ual", "ial", "ism", "ist", "ure", "age", "ion", "ade", "ile",
    "ingly", "ings", "ing", "ness", "ship", "hood", "ful", "less",
    "al", "ic", "ly", "or", "er", "ed", "es", "es", "ty", "cy",
    "e", "s",
]
SUFFIX_SORTED = sorted(set(SUFFIX), key=len, reverse=True)

MIN_ROOT = 3
MAX_STRIP_SUF = 3   # 接尾辞は最大3層まで剥がす (national+ly, ize+ation ...)


def parses(w: str):
    """(canonical_prefix, root, suffix_chain) を過剰生成する。"""
    out = []
    for sp in PREFIX_SORTED:
        if not w.startswith(sp):
            continue
        rest = w[len(sp):]
        if len(rest) < MIN_ROOT:
            continue
        # 接尾辞を 0..MAX_STRIP_SUF 層剥がす
        stack = [(rest, ())]
        seen = set()
        for _ in range(MAX_STRIP_SUF + 1):
            nxt = []
            for body, chain in stack:
                if len(body) >= MIN_ROOT and (body, chain) not in seen:
                    seen.add((body, chain))
                    out.append((PREFIX[sp], sp, body, chain))
                    # 末尾 e の復元/削除も語根候補に
                    if body.endswith("e") and len(body) - 1 >= MIN_ROOT:
                        out.append((PREFIX[sp], sp, body[:-1], chain + ("-e",)))
                for sf in SUFFIX_SORTED:
                    if body.endswith(sf) and len(body) - len(sf) >= MIN_ROOT:
                        nxt.append((body[: -len(sf)], chain + (sf,)))
            stack = nxt
            if not stack:
                break
    return out


# ─────────────────────────────────────────────────────────────
# Stage 2. 語根の支持度: 「異なる接頭辞と結合する」語根だけを残す
#   単なる頻度ではなく "接頭辞の多様性" を使うのが要点。
#   port が 4 接頭辞と結合 → 生産的語根。 tato が 1 つだけ → 偶然の切片。
# ─────────────────────────────────────────────────────────────
def is_free(root: str) -> bool:
    """自立語 (free morpheme) か。束縛語根 (sist, ceive, duct...) は False。"""
    return root in WORDSET or (root + "e") in WORDSET

TARGETS = [w for w in WORDS if len(w) >= 5]
ALL_PARSES = {w: parses(w) for w in TARGETS}

# --- Pass 1: 生の支持度を推定 (全パースを等価に数える) ---
raw_div, raw_cnt = defaultdict(set), defaultdict(int)
for w, ps in ALL_PARSES.items():
    for canon, surf, root, chain in ps:
        if canon != "∅-":
            raw_div[root].add(canon)
        raw_cnt[root] += 1

# --- Pass 2: 語ごとに最尤パースを1つだけ選ぶ (MDL 的) ---
#   対立仮説「無接頭辞」を用意することで extra→ex+tra 型の過剰分割を抑制する。
def parse_score(canon, surf, root, chain):
    s  = 2.0 * math.log(1 + len(raw_div[root]))     # 語根の生産性
    s += 0.5 * math.log(1 + raw_cnt[root])          # 語根の出現量
    s -= 0.75 * len(chain)                          # 形態素数のコスト
    s -= 0.6 if canon != "∅-" else 0.0              # 接頭辞を仮定するコスト
    # 自立語ボーナスは「その自立語がどれだけ本物か」で割り引く。
    # rec, tre のような周辺的な語で receive/tree が誤分解されるのを防ぐ。
    if is_free(root):
        rz = max(ZIPF.get(root, 0.0), ZIPF.get(root + "e", 0.0))
        s += 1.6 * min(1.0, max(0.0, (rz - 3.0) / 1.5))
    if len(root) <= 3 and not is_free(root): s -= 1.2
    return s

root_prefix = defaultdict(set)
root_words  = defaultdict(set)
BEST = {}
for w, ps in ALL_PARSES.items():
    if not ps:
        continue
    best = max(ps, key=lambda p: parse_score(*p))
    BEST[w] = best
    canon, surf, root, chain = best
    if canon == "∅-":
        continue                     # 無接頭辞語は語根族に寄与させない
    root_prefix[root].add(canon)
    root_words[root].add(w)

MIN_PREFIX_DIVERSITY = 3
cands = {r for r, ps in root_prefix.items() if len(ps) >= MIN_PREFIX_DIVERSITY}


# ─────────────────────────────────────────────────────────────
# Stage 3. 異形態の教師なし統合
#   仮説: 同一ラテン語根の異形態は「同じ接頭辞集合と共起し」「綴り頭が一致」する。
#   例 duc:{con,de,in,pro,intro,re}  duct:{con,de,in,pro}  → 統合
# ─────────────────────────────────────────────────────────────
def common_prefix_len(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n

class DSU:
    def __init__(self): self.p = {}
    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb: self.p[ra] = rb

dsu = DSU()
cl = sorted(cands)
by_head = defaultdict(list)
for r in cl:
    by_head[r[:3]].append(r)

MERGES = []
for head, group in by_head.items():
    for i in range(len(group)):
        for j in range(i + 1, len(group)):
            a, b = group[i], group[j]
            cpl = common_prefix_len(a, b)
            if cpl < 3:
                continue
            # 綴り上の近さ: 語幹長に対して共通部分が十分
            if cpl / max(len(a), len(b)) < 0.55:
                continue
            Pa, Pb = root_prefix[a], root_prefix[b]
            jac = len(Pa & Pb) / len(Pa | Pb)
            if jac >= 0.34 and len(Pa & Pb) >= 2:
                dsu.union(a, b)
                MERGES.append((a, b, round(jac, 2)))

# 追加: 供給音幹交替 (現在幹/完了幹) の綴り規則。純粋な文字列規則として書ける。
ALTERNATION = [
    (r"(.*)ceive$", r"\1cept"), (r"(.*)cept$", r"\1ceive"),
    (r"(.*)ceiv$",  r"\1cept"), (r"(.*)cept$", r"\1ceiv"),
    (r"(.*)mit$",   r"\1miss"), (r"(.*)miss$", r"\1mit"),
    (r"(.*)mit$",   r"\1mis"),  (r"(.*)mis$",  r"\1mit"),
    (r"(.*)ces$",   r"\1ced"),  (r"(.*)ced$",  r"\1ces"),
    (r"(.*)cept$",  r"\1cip"),  (r"(.*)cap$",  r"\1cip"),
    (r"(.*)duc$",   r"\1duct"), (r"(.*)duct$", r"\1duc"),
    (r"(.*)cede$",  r"\1cess"), (r"(.*)cess$", r"\1cede"),
    (r"(.*)vert$",  r"\1vers"), (r"(.*)vers$", r"\1vert"),
    (r"(.*)tend$",  r"\1tens"), (r"(.*)tens$", r"\1tend"),
    (r"(.*)clud$",  r"\1clus"), (r"(.*)clus$", r"\1clud"),
    (r"(.*)scrib$", r"\1script"), (r"(.*)script$", r"\1scrib"),
    (r"(.*)solv$",  r"\1solut"), (r"(.*)volv$", r"\1volut"),
    (r"(.*)pon$",   r"\1pos"),  (r"(.*)pos$",  r"\1pon"),
    (r"(.*)fer$",   r"\1lat"),
    (r"(.*)flect$", r"\1flex"), (r"(.*)flex$", r"\1flect"),
    (r"(.*)sent$",  r"\1sens"), (r"(.*)sens$", r"\1sent"),
    (r"(.*)tain$",  r"\1ten"),  (r"(.*)ten$",  r"\1tin"),
    (r"(.*)press$", r"\1prim"), (r"(.*)spect$", r"\1spic"),
    (r"(.*)sequ$",  r"\1secut"),(r"(.*)ven$",  r"\1vent"),
    (r"(.*)stru$",  r"\1struct"),(r"(.*)grad$", r"\1gress"),
    (r"(.*)pel$",   r"\1puls"), (r"(.*)cur$",  r"\1curs"),
    (r"(.*)fund$",  r"\1fus"),  (r"(.*)mov$",  r"\1mot"),
    (r"(.*)vid$",   r"\1vis"),  (r"(.*)claim$", r"\1clam"),
]
for r in cl:
    for pat, rep in ALTERNATION:
        if re.fullmatch(pat, r):
            alt = re.sub(pat, rep, r)
            if alt in cands:
                dsu.union(r, alt)

family = defaultdict(set)     # class_id -> {root variants}
for r in cl:
    family[dsu.find(r)].add(r)


# ─────────────────────────────────────────────────────────────
# Stage 4. ①native / ②Latinate 判定 (綴りのみ)
# ─────────────────────────────────────────────────────────────
NATIVE_SUF = ("ness", "ship", "hood", "dom", "ful", "less", "wise", "like")
NATIVE_ORTH = ("wh", "kn", "gh", "ght", "wr", "dg", "tch", "ck", "ee", "oo", "aw", "ow")
LATINATE_SUF = ("tion", "sion", "ment", "ity", "ive", "ous", "ence", "ance",
                "ate", "ify", "ize", "ism", "ist", "ory", "ary", "ure", "al", "ic")

def latinate_score(word: str, root: str, n_prefix: int) -> float:
    s = 0.0
    if not is_free(root):     s += 3.0   # 束縛語根 = 最強の証拠
    s += min(n_prefix, 6) * 0.6          # 接頭辞多様性
    if any(word.endswith(x) for x in LATINATE_SUF): s += 1.2
    if any(word.endswith(x) for x in NATIVE_SUF):   s -= 2.5
    if any(x in word for x in NATIVE_ORTH):         s -= 1.0
    if len(word) >= 8: s += 0.6
    return s


# ─────────────────────────────────────────────────────────────
# Stage 5. 重み付き最大被覆 (Weighted Max Coverage) の貪欲解
#   U   = 学習価値のある語の集合 (utility>0)
#   S_r = 語根 r が説明する語の集合
#   目的: |R|=k で Σ_{w ∈ ∪S_r} utility(w) を最大化
#   → 貪欲法は (1-1/e) 近似。同時に「学習順序」を与える。
# ─────────────────────────────────────────────────────────────
fam_words, fam_prefix, fam_lat = {}, {}, {}
for cid, roots in family.items():
    ws, ps = set(), set()
    for r in roots:
        ws |= root_words[r]; ps |= root_prefix[r]
    ws = {w for w in ws if utility(w) > 0}
    if len(ws) < 4:
        continue
    rep = min(roots, key=lambda r: (len(r), r))
    lat = sum(latinate_score(w, rep, len(ps)) for w in ws) / len(ws)
    if lat < 2.0:
        continue
    fam_words[cid] = ws; fam_prefix[cid] = ps; fam_lat[cid] = lat

covered, order = set(), []
K = 60
pool = dict(fam_words)
for step in range(K):
    best, bestgain = None, 0.0
    for cid, ws in pool.items():
        gain = sum(utility(w) for w in ws - covered)
        if gain > bestgain:
            best, bestgain = cid, gain
    if best is None:
        break
    new = pool[best] - covered
    covered |= new
    order.append({
        "rank": step + 1,
        "root": "/".join(sorted(family[best], key=lambda r: (len(r), r))[:4]),
        "n_new": len(new),
        "gain": round(bestgain, 1),
        "cum_gain": round(sum(utility(w) for w in covered), 1),
        "prefixes": len(fam_prefix[best]),
        "sample": sorted(new, key=lambda w: -ZIPF[w])[:9],
    })
    del pool[best]

TOTAL = sum(utility(w) for w in WORDS)
if __name__ == "__main__":
    import os
    _out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "result.json")
    json.dump({"order": order, "total_utility": TOTAL,
               "n_families": len(fam_words), "n_merges": len(MERGES)},
              open(_out, "w"), indent=1)

    print(f"vocab={len(WORDS)}  root_candidates={len(cands)}  families(kept)={len(fam_words)}  merges={len(MERGES)}")
    print(f"total utility mass = {TOTAL:.0f}")
    print()
    print(f"{'#':>3} {'root':<22}{'new':>5}{'pfx':>5}{'cum%':>7}   examples")
    for o in order[:40]:
        print(f"{o['rank']:>3} {o['root']:<22}{o['n_new']:>5}{o['prefixes']:>5}"
              f"{100*o['cum_gain']/TOTAL:>6.2f}%   {', '.join(o['sample'][:7])}")

    # 収穫逓減の可視化: 何語根で打ち切るべきか
    print("\n--- marginal returns ---")
    cum_words = 0
    for o in order:
        cum_words += o["n_new"]
        if o["rank"] in (1, 5, 10, 15, 20, 25, 30, 40, 50, 60):
            print(f"  top-{o['rank']:<3} roots -> {cum_words:>5} words covered, "
                  f"marginal gain of #{o['rank']} = {o['gain']:.0f} "
                  f"({o['gain']/order[0]['gain']*100:.0f}% of #1)")
