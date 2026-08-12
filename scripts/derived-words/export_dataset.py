"""
export_dataset.py — 2トラックの判定を語彙全体に事前計算し、
TypeScript ランタイムから O(1) で引ける静的データセットに落とす。

アプリ (Next.js) では Python も wordfreq も動かせないので、判定器を移植するのではなく
「判定結果を焼き込む」。判定は入力語だけに依存する純関数なので、これで完全に等価。

  track A = rootminer/decide  … 接頭辞-語根族 (receive: cept/ceiv)
  track B = derivminer        … 接尾辞-派生族 (analyze: analysis/analytical)

どちらかを通れば「派生語を生成する価値がある」= eligible。
"""
from __future__ import annotations
import json, os
from collections import Counter

import rootminer as R
import decide as A
import derivminer as B

TIER = {"LEARN (最優先)": 0, "LEARN": 1, "OPTIONAL": 2}
MAX_FAMILY_WORDS = 12      # AI プロンプトに載せる上限
MAX_DERIV_WORDS = 8


def main():
    fam_index, families, words = {}, [], {}
    counter = Counter()

    for w in R.WORDS:
        rec = {}

        da = A.decide(w)
        if da["verdict"] != "SKIP":
            root = da["parse"].split("|")[1]
            cid = R.dsu.find(root)
            if cid not in fam_index:
                fw = sorted(R.fam_words[cid], key=lambda x: -R.ZIPF[x])
                label = A.cid_label(cid)
                fam_index[cid] = len(families)
                families.append({
                    "label": label,
                    "rank": A.RANK.get(label),
                    "prefixes": len(R.fam_prefix[cid]),
                    "size": len(fw),
                    "words": fw[:MAX_FAMILY_WORDS],
                })
            surf, rootpart, _chain = da["parse"].split("|")
            rec["a"] = [fam_index[cid], TIER[da["verdict"]], surf.rstrip("-"), rootpart]

        # track B はメンバー表を出力しない。
        # コーパスは不規則派生 (receive->reception, maintain->maintenance) を
        # 拾えず、逆に anal/decided のような不適切語を混ぜてしまうため、
        # 「生産的である証拠」= 合否と幹だけを残し、派生語の列挙は AI に委ねる。
        db = B.decide_deriv(w)
        if db["ok"]:
            rec["b"] = db["stem"]

        if not rec:
            counter["skip"] += 1
            continue
        counter["A+B" if len(rec) == 2 else ("A" if "a" in rec else "B")] += 1
        words[w] = rec

    payload = {
        "version": 2,
        "vocabSize": len(R.WORDS),
        "floorZipf": R.FLOOR_ZIPF,
        "knownZipf": R.KNOWN_ZIPF,
        "families": families,
        "words": words,
    }

    out = "derived-words-dataset.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"counts: {dict(counter)}")
    print(f"eligible = {len(words)} / {len(R.WORDS)} ({100*len(words)/len(R.WORDS):.1f}%)")
    print(f"families = {len(families)}")
    print(f"size = {os.path.getsize(out)/1024:.1f} KB")


if __name__ == "__main__":
    main()
