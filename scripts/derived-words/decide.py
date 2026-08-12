"""
decide.py  —  単語1語を入力し、「派生語を学ぶべきか」を判定する。

rootminer.py が大域最適化 (どの語根を何番目に学ぶか) を解くのに対し、
こちらは学習者の現場の問い「今この単語に出会った。深掘りすべきか?」に答える。

判定は4つの検査を順に通す。前段で落ちたら後段は評価しない (早期棄却)。
  T1  可視性検査 : そもそもその語が学習価値帯にあるか        (頻度)
  T2  分解可能性 : 接頭辞+語根に分解できるか                 (綴り)
  T3  生産性検査 : その語根が他の接頭辞とも結合するか         (綴り)
  T4  回収量検査 : 語族の未回収効用がコストを上回るか         (最適化)

出力は verdict / 語族 / 学習順位 / 却下理由。
"""
from __future__ import annotations
import sys, math
import rootminer as R

# 語根クラス -> 貪欲法での順位
RANK = {}
for o in R.order:
    RANK[o["root"]] = o["rank"]

# 単語 -> 所属クラスID の逆引き
W2CID = {}
for cid, ws in R.fam_words.items():
    for w in ws:
        W2CID.setdefault(w, cid)

def cid_label(cid):
    # 長さ同点は辞書順で割る (rootminer.order の root ラベルと一致させる。
    # set の反復順に任せると実行ごとにラベルが入れ替わり RANK が引けなくなる)
    return "/".join(sorted(R.family[cid], key=lambda r: (len(r), r))[:4])

# 語族の「未回収効用」= 学習者がまだ知らない見込みの語の効用和
def family_yield(cid):
    return sum(R.utility(w) for w in R.fam_words[cid])

# 打ち切り閾値: 貪欲法の限界利得が #1 の 20% を切る地点 (≒ top-40) を採用
CUTOFF_GAIN = R.order[0]["gain"] * 0.20


def decide(word: str) -> dict:
    w = word.lower().strip()
    z = R.zipf_frequency(w, "en")
    out = {"word": w, "zipf": round(z, 2)}

    # ---- T1 可視性 -------------------------------------------------
    if z == 0:
        return {**out, "verdict": "SKIP", "why": "コーパスに出現しない (誤綴りか超低頻度)"}
    if z >= R.KNOWN_ZIPF:
        # 高頻度語そのものは既知。ただし語根が生産的なら「語根だけ」拾う価値がある
        pass
    if z < R.FLOOR_ZIPF:
        return {**out, "verdict": "SKIP", "why": f"頻度が低すぎる (Zipf {z:.1f} < {R.FLOOR_ZIPF})"}

    # ---- T2 分解可能性 ---------------------------------------------
    ps = R.parses(w)
    if not ps:
        return {**out, "verdict": "SKIP", "why": "接頭辞を持たない (①native 系。派生は -s/-ing 程度で推測可)"}
    canon, surf, root, chain = max(ps, key=lambda p: R.parse_score(*p))
    out["parse"] = f"{surf}-|{root}|-{'+'.join(chain) if chain else '∅'}"
    if canon == "∅-":
        return {**out, "verdict": "SKIP",
                "why": f"最尤解が無接頭辞。'{root}' は自立語で、複合語根ではない"}

    # ---- T3 生産性 -------------------------------------------------
    div = len(R.root_prefix.get(root, ()))
    out["prefix_diversity"] = div
    out["bound_root"] = not R.is_free(root)
    if root not in R.cands:
        return {**out, "verdict": "SKIP",
                "why": f"語根 '{root}' が結合する接頭辞は {div} 種のみ。非生産的で回収できない"}

    # ---- T4 回収量 -------------------------------------------------
    cid = R.dsu.find(root)
    if cid not in R.fam_words:
        return {**out, "verdict": "SKIP", "why": "語族の学習価値帯メンバーが4語未満"}

    label = cid_label(cid)
    y = family_yield(cid)
    fam = sorted(R.fam_words[cid], key=lambda x: -R.ZIPF[x])
    out.update({"root_class": label, "family_size": len(fam),
                "family_yield": round(y, 1),
                "rank": RANK.get(label), "family": fam[:12]})

    if y < CUTOFF_GAIN:
        return {**out, "verdict": "OPTIONAL",
                "why": f"生産的だが回収量 {y:.0f} が打ち切り線 {CUTOFF_GAIN:.0f} 未満。余力があれば"}
    if RANK.get(label) and RANK[label] <= 20:
        return {**out, "verdict": "LEARN (最優先)",
                "why": f"語根 '{label}' は全体 {RANK[label]} 位。{len(fam)} 語を回収"}
    return {**out, "verdict": "LEARN",
            "why": f"語根 '{label}' は生産的 ({div} 接頭辞 / {len(fam)} 語)"}


def report(word):
    d = decide(word)
    print(f"\n■ {d['word']}  (Zipf {d['zipf']})  →  {d['verdict']}")
    if "parse" in d:  print(f"  分解      : {d['parse']}")
    if "prefix_diversity" in d:
        print(f"  語根生産性: {d['prefix_diversity']} 接頭辞 / 束縛語根={d.get('bound_root')}")
    if "root_class" in d:
        print(f"  語族      : {d['root_class']}  ({d['family_size']}語, "
              f"回収量 {d['family_yield']}, 学習順位 {d.get('rank')})")
        print(f"  回収する語: {', '.join(d['family'][:10])}")
    print(f"  理由      : {d['why']}")


if __name__ == "__main__":
    tests = sys.argv[1:] or [
        "pine", "tree", "dog", "beautiful", "happiness",       # ①native 想定
        "consist", "transmit", "produce", "perspective",       # ②Latinate 想定
        "receive", "distribute", "conclude", "prohibit",
        "circumvent", "obfuscate", "defenestrate",             # 生産的だが低頻度
        "understand", "overcome", "become",                    # native 接頭辞の罠
        "extra", "severe",                                     # 既知の偽陽性
    ]
    for t in tests:
        report(t)
