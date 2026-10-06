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

/**
 * 語義ごとの材料: [日本語 WordNet の訳語, その語義だけを根拠にした正解候補の vocab 添字]。
 * 正解候補は空のこともある (その語義には言い換えが無い)。単語帳の訳がその語義に合うなら
 * 材料無し (出題しない) にする —— 他の語義の言い換えを出すより正しい。
 */
export type ParaphraseRawSense = [japanese: string[], answers: number[]];

/**
 * [品詞, 正解候補の vocab 添字 (良い順), 誤答候補の vocab 添字, 語義ごとの材料?]
 * 4 つめは version 2 から。単語帳の日本語訳と突き合わせて語義を選ぶのに使う。
 */
export type ParaphraseRawEntry = [pos: string, answers: number[], distractors: number[], senses?: ParaphraseRawSense[]];

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
  /** 単語帳の日本語訳から語義を選べたとき true (answers はその語義だけの候補)。 */
  senseMatched?: boolean;
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

/**
 * 単語帳の日本語訳 (「1.平凡な 2.つまらない」「汗をかく」など) を、辞書の訳語と比べられる
 * 粒度に刻む。番号・区切り記号で分け、2 文字以上の断片だけ残す。
 */
export function tokenizeJapaneseHint(hint: string): string[] {
  return hint
    .normalize('NFKC')
    .split(/[\s、,/・;:()\[\]「」『』【】〈〉《》〜~…0-9①-⑳.]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

const KANJI_RE = /\p{Script=Han}/gu;

function kanjiOf(text: string): string[] {
  return Array.from(new Set(text.match(KANJI_RE) ?? []));
}

/**
 * 訳語との一致の強さ。1 = 一致 (「平凡な」⊇「平凡」、「発汗する」⊇「発汗」)、
 * 0.5 = 弱い一致、0 = 不一致。弱い一致は 2 種類:
 * - 「汗をかく」の目的語「汗」が訳語「汗する」の頭に立つ
 * - 訳語の漢字がすべて単語帳の訳に含まれる (「間ちがう」「かん違いする」⊆「間違える」)。
 *   日本語 WordNet は送り仮名・交ぜ書きの揺れが大きく、文字列の包含では拾えない
 * 短すぎる断片の包含は偶然が多いので 2 文字以上で見る。
 */
function japaneseTokenMatch(token: string, lemma: string): number {
  if (token === lemma) return 1;
  if ((lemma.length >= 2 && token.includes(lemma)) || (token.length >= 2 && lemma.includes(token))) return 1;
  const objectIndex = token.indexOf('を');
  if (objectIndex >= 1) {
    const object = token.slice(0, objectIndex);
    if (/^[\p{Script=Han}]+$/u.test(object) && lemma.startsWith(object) && lemma !== object) return 0.5;
  }
  if (lemma.length >= 2) {
    const lemmaKanji = kanjiOf(lemma);
    if (lemmaKanji.length > 0) {
      const tokenKanji = new Set(kanjiOf(token));
      if (lemmaKanji.every((kanji) => tokenKanji.has(kanji))) return 0.5;
    }
  }
  return 0;
}

/**
 * 単語帳の日本語訳に最も合う語義を選ぶ。合う語義が無ければ null。
 * 同点なら先 (WordNet の語義順で主なもの) を取る。言い換えの無い語義 (answers が空) も
 * 候補に入れる —— 訳がそちらに合うなら、他の語義の言い換えを出してはいけない。
 */
export function matchJapaneseSense<T extends { japanese: readonly string[] }>(
  senses: readonly T[],
  hints: readonly string[],
): T | null {
  const tokens = Array.from(new Set(hints.flatMap(tokenizeJapaneseHint)));
  if (tokens.length === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const sense of senses) {
    let score = 0;
    for (const lemma of sense.japanese) {
      score += Math.max(0, ...tokens.map((token) => japaneseTokenMatch(token, lemma)));
    }
    if (score > bestScore) {
      best = sense;
      bestScore = score;
    }
  }
  return best;
}

function materialFromEntry(
  dataset: ParaphraseDataset,
  headword: string,
  entry: ParaphraseRawEntry,
  japaneseHints: readonly string[] = [],
): ParaphraseMaterial | null {
  const [pos, answerIndexes, distractorIndexes, rawSenses] = entry;
  if (!isParaphrasePos(pos) || !Array.isArray(answerIndexes) || !Array.isArray(distractorIndexes)) {
    return null;
  }
  const toWords = (indexes: number[]) =>
    indexes
      .map((index) => (Number.isInteger(index) ? dataset.vocab[index] : undefined))
      .filter((word): word is string => typeof word === 'string' && word.length > 0);
  let answers = toWords(answerIndexes);
  const distractors = toWords(distractorIndexes);
  if (answers.length === 0 || distractors.length < 3) return null;

  let senseMatched = false;
  if (japaneseHints.length > 0 && Array.isArray(rawSenses)) {
    const senses = rawSenses
      .filter((sense): sense is ParaphraseRawSense => Array.isArray(sense) && Array.isArray(sense[0]) && Array.isArray(sense[1]))
      .map((sense) => ({ japanese: sense[0].filter((item) => typeof item === 'string'), answers: toWords(sense[1]) }));
    const matched = matchJapaneseSense(senses, japaneseHints);
    if (matched) {
      // 単語帳の訳が「言い換えの無い語義」に合う (mistake for = 〜と間違える)。
      // 別の語義の言い換え (slip = しくじる) を出すより、材料無しが正しい
      if (matched.answers.length === 0) return null;
      answers = matched.answers;
      senseMatched = true;
    }
  }
  return { headword, pos, answers, distractors, senseMatched };
}

/**
 * 単語帳の `english` から出題材料を引く。無ければ null (その語は言い換えでは出題しない)。
 *
 * 見出し語は `paraphraseHeadwordCandidates` の順に当て、最初に見つかったものを使う。
 * 品詞は、単語の品詞タグから推せてその品詞の材料があればそれ、無ければ主な品詞 (先頭)。
 * 日本語訳 (`japaneseHints`) が辞書の語義のどれかに合えば、その語義だけの正解候補にする
 * (mundane = 平凡な → everyday。「この世の」の語義の terrestrial は出さない)。
 */
export function resolveParaphraseMaterial(
  dataset: ParaphraseDataset,
  english: string,
  posHint: ParaphrasePos | null = null,
  japaneseHints: readonly string[] = [],
): ParaphraseMaterial | null {
  for (const candidate of paraphraseHeadwordCandidates(english)) {
    const entries = dataset.entries[candidate];
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const preferred = posHint ? entries.find((entry) => entry[0] === posHint) : undefined;
    const material = materialFromEntry(dataset, candidate, preferred ?? entries[0], japaneseHints);
    if (material) return material;
  }
  return null;
}
