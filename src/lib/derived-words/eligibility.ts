/**
 * 派生語生成の足切り (フィルタ)
 *
 * 派生語生成は1語1コインの有料機能なので、AIを呼ぶ前に「その単語に派生語を
 * 生成する価値があるか」を決める。判定は綴りと頻度だけから教師なしで行う
 * オフラインパイプライン (`scripts/derived-words/`) の結果を焼き込んだ
 * `dataset.json` を引くだけなので、実行時コストは Map 参照1回。
 *
 * 2つのトラックのどちらかを通れば合格:
 *   track A = 接頭辞-語根族   receive → 語根 cept/ceiv (accept, concept...)
 *   track B = 接尾辞-派生族   analyze → analysis / analytical
 *
 * 2軸あるのは互いの盲点を埋めるため。`maintain` は接尾辞軸では落ちる
 * (maintenance は綴りが不規則で繋がらない) が track A の ten/tin/tent/tain 族で
 * 拾え、`analyze` は接頭辞を持たないので track A では落ちるが track B で拾える。
 * 詳細と再生成手順は scripts/derived-words/README.md を参照。
 *
 * データセットは語彙上位56,675語について事前計算済み。語彙外の語は頻度が下限を
 * 割るためどのみち不合格なので、未収録 = 不合格として扱ってよい。
 */

import { normalizeHeadword } from '../../../shared/lexicon';
import datasetJson from './dataset.json';

/** track A の語根族 (rootminer が異形態統合したもの)。 */
interface RootFamilyRaw {
  /** 異形態をまとめたラベル。例: "cept/ceiv" */
  label: string;
  /** 貪欲法による全体学習順位。打ち切り圏外は null */
  rank: number | null;
  /** 結合する接頭辞の種類数 */
  prefixes: number;
  /** 語族の学習価値帯メンバー数 */
  size: number;
  /** 頻度上位のメンバー語 (プロンプトの文脈用) */
  words: string[];
}

/** [familyIndex, tier, 表層接頭辞, 語根] */
type TrackARaw = [number, number, string, string];

interface WordRecordRaw {
  a?: TrackARaw;
  /** track B の幹。内部デバッグ用で、UIには出さないこと (anal 等の幹があるため) */
  b?: string;
}

interface DatasetRaw {
  version: number;
  vocabSize: number;
  floorZipf: number;
  knownZipf: number;
  families: RootFamilyRaw[];
  words: Record<string, WordRecordRaw>;
}

const dataset = datasetJson as unknown as DatasetRaw;

/** 学習優先度。track A の貪欲法順位に由来する。 */
export type DerivedWordsTier = 'priority' | 'standard' | 'optional';

const TIERS: DerivedWordsTier[] = ['priority', 'standard', 'optional'];

export interface DerivedWordsRootFamily {
  label: string;
  rank: number | null;
  prefixes: number;
  size: number;
  words: string[];
}

export interface DerivedWordsEligibility {
  /** 派生語を生成する価値があるか。false ならAIを呼ばず課金もしない */
  eligible: boolean;
  /** 判定に使った正規化見出し語 */
  headword: string;
  /** 合格したトラック */
  tracks: Array<'root-family' | 'derivation'>;
  /** track A の優先度。track B のみで合格した場合は null */
  tier: DerivedWordsTier | null;
  /** track A の語根族。プロンプトに語根の意味を固定する文脈として渡す */
  rootFamily: DerivedWordsRootFamily | null;
  /** 表層接頭辞と語根 (track A のみ)。例: re- / ceiv */
  prefix: string | null;
  root: string | null;
}

function ineligible(headword: string): DerivedWordsEligibility {
  return {
    eligible: false,
    headword,
    tracks: [],
    tier: null,
    rootFamily: null,
    prefix: null,
    root: null,
  };
}

/**
 * 語形変化を軽く戻して見出し語候補を作る。
 *
 * データセットは活用形も個別に収録している (上位語彙をそのまま走査しているため)
 * が、収録外の活用形が来たときの取りこぼしを減らす保険。判定を緩める方向にしか
 * 効かないので、誤って不合格になることはない。
 */
function lemmaCandidates(headword: string): string[] {
  const out = [headword];
  const push = (value: string) => {
    if (value.length >= 3 && !out.includes(value)) out.push(value);
  };

  if (headword.endsWith('ies')) push(`${headword.slice(0, -3)}y`);
  if (headword.endsWith('es')) push(headword.slice(0, -2));
  if (headword.endsWith('s')) push(headword.slice(0, -1));
  if (headword.endsWith('ed')) {
    push(headword.slice(0, -2));
    push(headword.slice(0, -1));
  }
  if (headword.endsWith('ing')) {
    push(headword.slice(0, -3));
    push(`${headword.slice(0, -3)}e`);
  }
  return out;
}

function toEligibility(headword: string, record: WordRecordRaw): DerivedWordsEligibility {
  const tracks: DerivedWordsEligibility['tracks'] = [];
  let tier: DerivedWordsTier | null = null;
  let rootFamily: DerivedWordsRootFamily | null = null;
  let prefix: string | null = null;
  let root: string | null = null;

  if (record.a) {
    const [familyIndex, tierIndex, surfacePrefix, rootForm] = record.a;
    const family = dataset.families[familyIndex];
    if (family) {
      tracks.push('root-family');
      tier = TIERS[tierIndex] ?? 'optional';
      rootFamily = {
        label: family.label,
        rank: family.rank,
        prefixes: family.prefixes,
        size: family.size,
        words: family.words,
      };
      prefix = surfacePrefix || null;
      root = rootForm || null;
    }
  }

  if (record.b) tracks.push('derivation');

  if (tracks.length === 0) return ineligible(headword);
  return { eligible: true, headword, tracks, tier, rootFamily, prefix, root };
}

/**
 * 単語に派生語を生成する価値があるかを判定する。
 * データセット参照のみでAI呼び出しもDBアクセスも行わないので同期。
 */
export function resolveDerivedWordsEligibility(english: string): DerivedWordsEligibility {
  const headword = normalizeHeadword(english);
  if (!headword || /[^a-z'-]/.test(headword)) return ineligible(headword);

  for (const candidate of lemmaCandidates(headword)) {
    const record = dataset.words[candidate];
    if (record) return toEligibility(headword, record);
  }
  return ineligible(headword);
}

/** データセットのメタ情報 (テスト・運用確認用)。 */
export const DERIVED_WORDS_DATASET_META = {
  version: dataset.version,
  vocabSize: dataset.vocabSize,
  eligibleCount: Object.keys(dataset.words).length,
  familyCount: dataset.families.length,
} as const;
