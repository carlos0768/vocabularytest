import { paraphraseHeadwordCandidates } from './headword';

/**
 * 言い換えクイズのデータセット (scripts/paraphrase/build_dataset.py が生成する dataset.json)。
 *
 * Open English WordNet・Moby Thesaurus・Google Books Ngram 由来の頻度表という
 * オープンデータだけから作った、見出し語 → (品詞, 正解になる同義語, 誤答) の表。AI は使わない。
 * 語は `vocab` に一度だけ置き、各見出し語からは添字で指す (同じ語が何千回も出るので)。
 */

export type ParaphrasePos = 'n' | 'v' | 'a' | 'r';

export interface ParaphraseDatasetSource {
  name: string;
  license: string;
  url: string;
}

/** [品詞, 正解候補の vocab 添字 (良い順), 誤答候補の vocab 添字] */
export type ParaphraseRawEntry = [pos: string, answers: number[], distractors: number[]];

export interface ParaphraseDataset {
  version: number;
  generatedAt: string;
  sources: ParaphraseDatasetSource[];
  vocab: string[];
  /** 見出し語 (小文字・空白区切り) → 品詞ごとの材料。主な品詞が先。 */
  entries: Record<string, ParaphraseRawEntry[]>;
}

/** 1 語ぶんの出題材料。クライアントはこれだけ受け取って 4 択を組む。 */
export interface ParaphraseMaterial {
  /** データセット側で当たった見出し語 (表示には使わない。デバッグと重複排除用) */
  headword: string;
  pos: ParaphrasePos;
  /** 正解になりうる言い換え。良い順。 */
  answers: string[];
  /** 正解のどれとも同義でない同品詞の語。3 つ以上。 */
  distractors: string[];
}

const POS_VALUES: readonly ParaphrasePos[] = ['n', 'v', 'a', 'r'];

export function isParaphrasePos(value: unknown): value is ParaphrasePos {
  return typeof value === 'string' && (POS_VALUES as readonly string[]).includes(value);
}

/**
 * dataset.json の形を確かめる。3MB 超のオブジェクトを毎回 zod に通すのは重いので、
 * 構造だけを軽く見る (中身の添字は引くときに範囲を確かめる)。
 */
export function parseParaphraseDataset(raw: unknown): ParaphraseDataset {
  if (!raw || typeof raw !== 'object') throw new Error('paraphrase dataset: not an object');
  const record = raw as Record<string, unknown>;
  if (typeof record.version !== 'number') throw new Error('paraphrase dataset: version missing');
  if (!Array.isArray(record.vocab) || record.vocab.some((word) => typeof word !== 'string')) {
    throw new Error('paraphrase dataset: vocab must be string[]');
  }
  if (!record.entries || typeof record.entries !== 'object' || Array.isArray(record.entries)) {
    throw new Error('paraphrase dataset: entries must be an object');
  }
  const sources = Array.isArray(record.sources)
    ? (record.sources as unknown[]).filter(
      (source): source is ParaphraseDatasetSource =>
        !!source && typeof source === 'object'
        && typeof (source as ParaphraseDatasetSource).name === 'string'
        && typeof (source as ParaphraseDatasetSource).license === 'string'
        && typeof (source as ParaphraseDatasetSource).url === 'string',
    )
    : [];
  return {
    version: record.version,
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : '',
    sources,
    vocab: record.vocab as string[],
    entries: record.entries as Record<string, ParaphraseRawEntry[]>,
  };
}

/**
 * 単語の品詞タグ (`Word.partOfSpeechTags`: 英語名か日本語名) から、データセットの品詞を推す。
 * 推せなければ null で、その語の主な品詞に任せる。
 */
export function toParaphrasePosHint(tags: readonly string[] | null | undefined): ParaphrasePos | null {
  for (const tag of tags ?? []) {
    const normalized = tag.trim().toLowerCase();
    switch (normalized) {
      case 'noun':
      case '名詞':
        return 'n';
      case 'verb':
      case 'phrasal_verb':
      case '動詞':
      case '句動詞':
        return 'v';
      case 'adjective':
      case '形容詞':
        return 'a';
      case 'adverb':
      case '副詞':
        return 'r';
      default:
        break;
    }
  }
  return null;
}

function materialFromEntry(
  dataset: ParaphraseDataset,
  headword: string,
  entry: ParaphraseRawEntry,
): ParaphraseMaterial | null {
  const [pos, answerIndexes, distractorIndexes] = entry;
  if (!isParaphrasePos(pos) || !Array.isArray(answerIndexes) || !Array.isArray(distractorIndexes)) {
    return null;
  }
  const toWords = (indexes: number[]) =>
    indexes
      .map((index) => (Number.isInteger(index) ? dataset.vocab[index] : undefined))
      .filter((word): word is string => typeof word === 'string' && word.length > 0);
  const answers = toWords(answerIndexes);
  const distractors = toWords(distractorIndexes);
  if (answers.length === 0 || distractors.length < 3) return null;
  return { headword, pos, answers, distractors };
}

/**
 * 単語帳の `english` から出題材料を引く。無ければ null (その語は言い換えでは出題しない)。
 *
 * 見出し語は `paraphraseHeadwordCandidates` の順に当て、最初に見つかったものを使う。
 * 品詞は、単語の品詞タグから推せてその品詞の材料があればそれ、無ければ主な品詞 (先頭)。
 */
export function resolveParaphraseMaterial(
  dataset: ParaphraseDataset,
  english: string,
  posHint: ParaphrasePos | null = null,
): ParaphraseMaterial | null {
  for (const candidate of paraphraseHeadwordCandidates(english)) {
    const entries = dataset.entries[candidate];
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const preferred = posHint ? entries.find((entry) => entry[0] === posHint) : undefined;
    const material = materialFromEntry(dataset, candidate, preferred ?? entries[0]);
    if (material) return material;
  }
  return null;
}
