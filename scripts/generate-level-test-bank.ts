import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// 語彙レベル診断 (/level-test) 用の静的問題バンク生成スクリプト。
//
// ランタイムのDB I/Oをゼロにするため、7英検グレード x 250語 =1,750語の
// 4択問題バンクを public/level-test/bank-v1.json として事前生成しコミットする。
//
// データソースは2モード:
//   --source=db       official_wordbook_words(本番の公式英検単語帳)から生成。
//                     NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要。
//                     本番データと完全に揃えたい場合はこちらを推奨。
//   --source=datasets 公開データセットから生成(ネットワークさえあれば実行可能):
//                     - CEFR-J Vocabulary Profile 1.5 (A1-B2, 人手キュレーション)
//                     - Octanove Vocabulary Profile C1/C2 1.0
//                     - Words-CEFR-Dataset (頻度データ: レベル内の難易度順位付け)
//                     - EJDict-hand (パブリックドメイン英和辞書: 和訳)
//                     英検グレードへの対応は src/lib/reels/eiken-cefr.ts の
//                     EIKEN_TO_CEFR_BAND と同じ思想で、CEFR帯を頻度順に分割する。
//
// 指定がない場合、Supabase資格情報があれば db、なければ datasets を使う。
//
// 使い方:
//   npx tsx scripts/generate-level-test-bank.ts [--source=db|datasets]

type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';

type BankWord = {
  english: string;
  japanese: string;
  distractors: [string, string, string];
  pos?: string;
};

// EIKEN_LEVEL_ORDER(src/lib/ai/prompts/eiken.ts)と同順。易しい順。
const EIKEN_LEVEL_ORDER: EikenLevel[] = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];
const EIKEN_LEVEL_LABELS: Record<EikenLevel, string> = {
  '5': '英検5級',
  '4': '英検4級',
  '3': '英検3級',
  pre2: '英検準2級',
  '2': '英検2級',
  pre1: '英検準1級',
  '1': '英検1級',
};

const WORDS_PER_LEVEL = 250;
const BANK_VERSION = 1;
const OUTPUT_PATH = join(process.cwd(), 'public', 'level-test', `bank-v${BANK_VERSION}.json`);
const MAX_JAPANESE_LENGTH = 18;

function loadDotEnvLocal(): void {
  if (!existsSync('.env.local')) return;

  const lines = readFileSync('.env.local', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const equalsIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

// 再現性のため乱数は固定シードのPRNG(mulberry32)を使う。
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return await response.text();
}

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((value) => value.trim());
  return dataRows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

// ---------------------------------------------------------------------------
// 和訳クリーニング(EJDict / 公式単語帳 共通)
// ---------------------------------------------------------------------------

function cleanJapaneseGloss(raw: string): string | null {
  // EJDictは「 / 」区切りで語義、語義内は「,」「;」区切り。
  // 『』は重要語義マーカー、《》は文型注記、〈U〉〈C〉は可算性、()( )は補足。
  let sense = raw.split(' / ')[0] ?? '';
  sense = sense
    .replace(/《[^》]*》/g, '')
    .replace(/〈[^〉]*〉/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[[^\]]*]/g, '')
    .replace(/\[[^\]]*\]/g, '')
    // 『自動車』電車 のように閉じ括弧の直後に別語義が続くケースがあるため、
    // 『』を除去する前に閉じ括弧を語義区切りとして復元する
    .replace(/』\s*/g, '』、')
    .replace(/『|』/g, '')
    .replace(/^[=・:;:;]+/, '')
    .trim();

  const first = sense.split(/[,,、;;]/)[0]?.trim() ?? '';
  const normalized = first
    .replace(/…/g, '〜')
    // 括弧が語義区切りをまたいだ/幅違いで対応していた場合の残骸を除去
    .replace(/[()[\]]/g, '')
    .replace(/[()[]]/g, '')
    // 「を捜す」「に頼る」のような助詞始まりは目的語の省略なので〜を補う
    .replace(/^(を|に|へ|と|が)(?=.)/, '〜$1')
    .replace(/^〜?(を|に|へ|と|が)?$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;
  if (normalized.length > MAX_JAPANESE_LENGTH) return null;
  // 和訳に日本語文字が1つも無いもの(英字略語の説明等)は除外。
  if (!/[ぁ-んァ-ヶ一-龠々〜ー]/.test(normalized)) return null;
  // 「beの過去分詞形」のような語形変化のメタ語釈は問題にならないので除外。
  if (/分詞|過去形|複数形|短縮形|3人称|三人称|変化形|の略/.test(normalized)) return null;
  return normalized;
}

// CEFR-Jは同じ語を複数品詞で収録しているため、品詞フィルタだけでは
// 機能語("to"のadverb行など)が漏れる。意味を問うクイズに不適な純粋な
// 文法語は見出し語単位で除外する。
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'about', 'into', 'onto', 'over', 'under', 'upon', 'within', 'without', 'between',
  'among', 'across', 'behind', 'beyond', 'off', 'up', 'down', 'out',
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'do', 'does', 'did', 'done', 'doing',
  'have', 'has', 'had', 'having',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'ought',
  'not', 'no', 'nor', 'and', 'or', 'but', 'if', 'whether', 'that', 'this', 'these',
  'those', 'such',
  'it', 'its', 'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their',
  'theirs', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'me', 'my', 'mine',
  'who', 'whom', 'whose', 'which', 'what',
  'there', 'here', 'than', 'then', 'so', 'too', 'also', 'just', 'even', 'still', 'yet',
  'more', 'most', 'much', 'many', 'all', 'any', 'some', 'each', 'every', 'both',
  'either', 'neither', 'other', 'another', 'same', 'own',
  'when', 'where', 'why', 'how', 'while', 'since', 'until', 'because', 'although',
  'though', 'during', 'per', 'via',
]);

function isUsableEnglishHeadword(headword: string): boolean {
  if (headword.length < 2) return false;
  if (!/^[a-z][a-z-]*$/.test(headword)) return false;
  if (STOP_WORDS.has(headword)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// ディストラクタ生成
// 優先順位: 接頭辞/接尾辞が似た単語(形態的に紛らわしい) > 同品詞 > その他。
// 例: instruction の誤答には construction / institution の訳語が優先的に入る。
// ---------------------------------------------------------------------------

type PoolWord = { english: string; japanese: string; pos?: string };

const KNOWN_PREFIXES = [
  'inter', 'trans', 'under', 'super', 'micro', 'multi', 'over', 'fore', 'anti',
  'semi', 'non', 'out', 'mis', 'dis', 'pre', 'pro', 'con', 'com', 'sub', 'ex',
  'un', 'in', 'im', 'il', 'ir', 're', 'de', 'en', 'em', 'up',
];

const KNOWN_SUFFIXES = [
  'ical', 'tion', 'sion', 'ment', 'ness', 'ance', 'ence', 'able', 'ible',
  'ship', 'ward', 'some', 'hood', 'less', 'ity', 'ous', 'ive', 'ful', 'ish',
  'ary', 'ory', 'ist', 'ism', 'ize', 'ise', 'ate', 'age', 'ure', 'dom',
  'al', 'ic', 'er', 'or', 'fy', 'ly', 'en',
];

function knownPrefixOf(word: string): string | null {
  // 語幹が短くなりすぎる場合は接辞とみなさない(inn に "in" 等)
  return KNOWN_PREFIXES.find((prefix) => word.startsWith(prefix) && word.length >= prefix.length + 3) ?? null;
}

function knownSuffixOf(word: string): string | null {
  return KNOWN_SUFFIXES.find((suffix) => word.endsWith(suffix) && word.length >= suffix.length + 3) ?? null;
}

function commonPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}

function commonSuffixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[a.length - 1 - length] === b[b.length - 1 - length]) length += 1;
  return length;
}

// 綴りの紛らわしさスコア。接尾辞一致(品詞まで揃って見える)を最重視。
function morphologicalSimilarity(a: string, b: string): number {
  let score = 0;
  const suffixA = knownSuffixOf(a);
  if (suffixA && suffixA === knownSuffixOf(b)) score += 2;
  const prefixA = knownPrefixOf(a);
  if (prefixA && prefixA === knownPrefixOf(b)) score += 1;
  if (commonPrefixLength(a, b) >= 4) score += 2;
  if (commonSuffixLength(a, b) >= 4) score += 1;
  return score;
}

function isConfusablePair(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // 先頭2文字が同じ短い訳語(「走る」「走行」等)は紛らわしいので避ける。
  if (a.slice(0, 2) === b.slice(0, 2)) return true;
  return false;
}

function buildDistractorsForWord(
  word: PoolWord,
  pool: readonly PoolWord[],
  random: () => number,
): { distractors: [string, string, string]; lookalikeCount: number } | null {
  const candidates = seededShuffle(
    pool.filter((candidate) => candidate.english !== word.english),
    random,
  );

  // 安定ソート: 綴り類似スコア降順 -> 同品詞優先。同点はシャッフル順のまま。
  const scored = candidates
    .map((candidate) => ({
      candidate,
      similarity: morphologicalSimilarity(word.english, candidate.english),
      samePos: Boolean(word.pos) && candidate.pos === word.pos ? 1 : 0,
    }))
    .sort((a, b) => (b.similarity - a.similarity) || (b.samePos - a.samePos));

  const distractors: string[] = [];
  let lookalikeCount = 0;

  for (const { candidate, similarity } of scored) {
    if (distractors.length >= 3) break;
    if (isConfusablePair(candidate.japanese, word.japanese)) continue;
    if (distractors.some((existing) => isConfusablePair(existing, candidate.japanese))) continue;
    distractors.push(candidate.japanese);
    if (similarity > 0) lookalikeCount += 1;
  }

  if (distractors.length < 3) return null;
  return { distractors: [distractors[0], distractors[1], distractors[2]], lookalikeCount };
}

function buildLevelBank(pool: PoolWord[], levelIndex: number): { bank: BankWord[]; wordsWithLookalike: number } {
  const random = createSeededRandom(0x4d45524b + levelIndex); // 'MERK' + level
  const bank: BankWord[] = [];
  let wordsWithLookalike = 0;

  for (const word of pool) {
    const built = buildDistractorsForWord(word, pool, random);
    if (!built) continue;
    if (built.lookalikeCount > 0) wordsWithLookalike += 1;
    bank.push({
      english: word.english,
      japanese: word.japanese,
      distractors: built.distractors,
      ...(word.pos ? { pos: word.pos } : {}),
    });
  }

  return { bank, wordsWithLookalike };
}

// ---------------------------------------------------------------------------
// ソース1: 公開データセット
// ---------------------------------------------------------------------------

const CEFRJ_URL = 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv';
const OCTANOVE_URL = 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv';
const WORDS_CSV_URL = 'https://raw.githubusercontent.com/Maximax67/Words-CEFR-Dataset/main/csv/words.csv';
const WORD_POS_CSV_URL = 'https://raw.githubusercontent.com/Maximax67/Words-CEFR-Dataset/main/csv/word_pos.csv';
const EJDICT_BASE_URL = 'https://raw.githubusercontent.com/kujirahand/EJDict/master/src';

async function fetchEjdict(): Promise<Map<string, string>> {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const dictionary = new Map<string, string>();

  for (const letter of letters) {
    const text = await fetchText(`${EJDICT_BASE_URL}/${letter}.txt`);
    for (const line of text.split('\n')) {
      const tabIndex = line.indexOf('\t');
      if (tabIndex <= 0) continue;
      const headword = line.slice(0, tabIndex).trim();
      const gloss = line.slice(tabIndex + 1).trim();
      if (!headword || !gloss || dictionary.has(headword)) continue;
      dictionary.set(headword, gloss);
    }
  }

  return dictionary;
}

async function fetchFrequencyRanks(): Promise<Map<string, number>> {
  const [wordsCsv, wordPosCsv] = await Promise.all([
    fetchText(WORDS_CSV_URL),
    fetchText(WORD_POS_CSV_URL),
  ]);

  const wordById = new Map<string, string>();
  for (const row of parseCsv(wordsCsv)) {
    const wordId = row.word_id?.trim();
    const word = row.word?.trim().toLowerCase();
    if (wordId && word) wordById.set(wordId, word);
  }

  const frequencyByWord = new Map<string, number>();
  for (const row of parseCsv(wordPosCsv)) {
    const word = wordById.get(row.word_id?.trim() ?? '');
    if (!word) continue;
    const frequency = Number.parseInt(row.frequency_count ?? '', 10);
    if (!Number.isFinite(frequency)) continue;
    const existing = frequencyByWord.get(word) ?? 0;
    if (frequency > existing) frequencyByWord.set(word, frequency);
  }

  return frequencyByWord;
}

type CuratedWord = { english: string; pos: string; cefr: string };

async function fetchCuratedWords(): Promise<CuratedWord[]> {
  const [cefrjCsv, octanoveCsv] = await Promise.all([
    fetchText(CEFRJ_URL),
    fetchText(OCTANOVE_URL),
  ]);

  const seen = new Map<string, CuratedWord>();
  const cefrOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  for (const row of [...parseCsv(cefrjCsv), ...parseCsv(octanoveCsv)]) {
    const english = row.headword?.trim().toLowerCase() ?? '';
    const pos = row.pos?.trim().toLowerCase() ?? '';
    const cefr = (row.CEFR ?? row.cefr ?? '').trim().toUpperCase();
    if (!isUsableEnglishHeadword(english) || !cefrOrder.includes(cefr)) continue;
    // 機能語(冠詞・前置詞・接続詞・代名詞・助動詞)は「意味を答える」クイズに
    // 向かないので除外し、内容語中心のバンクにする。
    if (['determiner', 'preposition', 'conjunction', 'pronoun', 'auxiliary', 'modal', 'modal verb'].includes(pos)) continue;

    // 同じ見出し語が複数品詞/複数レベルにある場合は最も易しいレベルを採用。
    const existing = seen.get(english);
    if (existing && cefrOrder.indexOf(existing.cefr) <= cefrOrder.indexOf(cefr)) continue;
    seen.set(english, { english, pos, cefr });
  }

  return [...seen.values()];
}

type RankedWord = PoolWord & { cefr: string };

// 各級の「出題帯」。全候補語を頻度降順に並べた単一ランキング上の順位窓で、
// VOCAB_SIZE_BY_LEVEL(600/1300/2100/3600/5100/7500/12000語)の上限付近=
// その級の合否を分けるボーダーライン語彙を出題する。最頻出語だけを取ると
// 実際の英検レベルより大幅に易しくなるため、窓の下限を高めに設定している。
// CEFRの許可帯は「頻度は低いが易しい語(具象名詞等)」が上位級に混ざるのを防ぐガード。
const GRADE_WINDOWS: Array<{
  level: EikenLevel;
  startRank: number;
  endRank: number; // exclusive。Infinityで末尾まで
  allowedCefr: Set<string>;
}> = [
  { level: '5', startRank: 150, endRank: 620, allowedCefr: new Set(['A1', 'A2']) },
  { level: '4', startRank: 700, endRank: 1400, allowedCefr: new Set(['A1', 'A2', 'B1']) },
  { level: '3', startRank: 1350, endRank: 2150, allowedCefr: new Set(['A2', 'B1']) },
  { level: 'pre2', startRank: 2500, endRank: 3700, allowedCefr: new Set(['A2', 'B1', 'B2']) },
  { level: '2', startRank: 3900, endRank: 5200, allowedCefr: new Set(['B1', 'B2', 'C1']) },
  { level: 'pre1', startRank: 5400, endRank: 6700, allowedCefr: new Set(['B2', 'C1', 'C2']) },
  { level: '1', startRank: 6300, endRank: Number.POSITIVE_INFINITY, allowedCefr: new Set(['C1', 'C2']) },
];

// 窓内の候補から、難易度の偏りが出ないよう等間隔に250語選ぶ。
function evenSpread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const selected: T[] = [];
  for (let i = 0; i < count; i += 1) {
    selected.push(items[Math.floor((i * items.length) / count)]);
  }
  return selected;
}

async function buildPoolsFromDatasets(): Promise<Map<EikenLevel, PoolWord[]>> {
  console.log('Fetching curated CEFR word lists (CEFR-J + Octanove)...');
  const curated = await fetchCuratedWords();
  console.log(`  ${curated.length} curated headwords`);

  console.log('Fetching EJDict (public-domain E-J dictionary)...');
  const ejdict = await fetchEjdict();
  console.log(`  ${ejdict.size} dictionary entries`);

  console.log('Fetching frequency data (Words-CEFR-Dataset)...');
  const frequencyByWord = await fetchFrequencyRanks();
  console.log(`  ${frequencyByWord.size} frequency entries`);

  const usable: RankedWord[] = [];
  let missingGloss = 0;

  for (const word of curated) {
    const rawGloss = ejdict.get(word.english);
    const japanese = rawGloss ? cleanJapaneseGloss(rawGloss) : null;
    if (!japanese) {
      missingGloss += 1;
      continue;
    }
    usable.push({ english: word.english, japanese, pos: word.pos, cefr: word.cefr });
  }
  console.log(`  skipped ${missingGloss} words without a usable Japanese gloss`);

  // 「tiredness」「compellingly」のような透明な派生語は、頻度は低くても
  // 意味が自明で上位級の問題として成立しないため、基語が候補にある場合は除外する。
  const headwords = new Set(usable.map((word) => word.english));
  const beforeDerivativeFilter = usable.length;
  const withoutDerivatives = usable.filter((word) => {
    if (word.english.endsWith('ness') && headwords.has(word.english.slice(0, -4))) return false;
    if (word.english.endsWith('ly')) {
      const stem = word.english.slice(0, -2);
      // quick+ly / full+ly(l重複) / happy→happily(y→i) をカバー
      if (headwords.has(stem) || headwords.has(`${stem}l`)
        || (stem.endsWith('i') && headwords.has(`${stem.slice(0, -1)}y`))) {
        return false;
      }
    }
    return true;
  });
  usable.length = 0;
  usable.push(...withoutDerivatives);
  console.log(`  dropped ${beforeDerivativeFilter - usable.length} transparent derivatives`);

  // 全候補を頻度降順の単一ランキングにする(頻度不明は末尾=最難扱い)
  usable.sort((a, b) => (frequencyByWord.get(b.english) ?? 0) - (frequencyByWord.get(a.english) ?? 0));
  console.log(`  ${usable.length} usable ranked words`);

  const pools = new Map<EikenLevel, PoolWord[]>();

  for (const window of GRADE_WINDOWS) {
    const endRank = Math.min(window.endRank, usable.length);
    let startRank = Math.min(window.startRank, usable.length);
    let candidates = usable
      .slice(startRank, endRank)
      .filter((word) => window.allowedCefr.has(word.cefr));

    // CEFRガードで250語を割った場合は窓を下(易しい側)へ広げて充足させる
    while (candidates.length < WORDS_PER_LEVEL && startRank > 0) {
      startRank = Math.max(0, startRank - 200);
      candidates = usable
        .slice(startRank, endRank)
        .filter((word) => window.allowedCefr.has(word.cefr));
    }

    pools.set(
      window.level,
      evenSpread(candidates, WORDS_PER_LEVEL).map(({ english, japanese, pos }) => ({
        english,
        japanese,
        ...(pos ? { pos } : {}),
      })),
    );
  }

  return pools;
}

// ---------------------------------------------------------------------------
// ソース2: official_wordbook_words(本番の公式英検単語帳)
// ---------------------------------------------------------------------------

async function buildPoolsFromDb(): Promise<Map<EikenLevel, PoolWord[]>> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --source=db');
  }

  const supabase = createClient(url.startsWith('http') ? url : `https://${url}`, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pools = new Map<EikenLevel, PoolWord[]>();

  for (const level of EIKEN_LEVEL_ORDER) {
    const { data: wordbooks, error: wordbookError } = await supabase
      .from('official_wordbooks')
      .select('id')
      .eq('eiken_level', level)
      .eq('is_active', true)
      .like('slug', 'merken-eiken-%');
    if (wordbookError) throw new Error(`Failed to fetch wordbooks for ${level}: ${wordbookError.message}`);

    const ids = (wordbooks ?? []).map((row) => (row as { id: string }).id);
    if (ids.length === 0) throw new Error(`No official wordbooks found for level ${level}`);

    const { data: words, error: wordsError } = await supabase
      .from('official_wordbook_words')
      .select('english,japanese,part_of_speech_tags')
      .in('official_wordbook_id', ids)
      .order('sort_order', { ascending: true });
    if (wordsError) throw new Error(`Failed to fetch words for ${level}: ${wordsError.message}`);

    const pool: PoolWord[] = [];
    const seen = new Set<string>();
    for (const row of (words ?? []) as Array<{ english: string; japanese: string; part_of_speech_tags: string[] | null }>) {
      const english = row.english?.trim();
      const japanese = cleanJapaneseGloss(row.japanese ?? '') ?? row.japanese?.trim();
      if (!english || !japanese) continue;
      const key = english.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({
        english,
        japanese,
        ...(row.part_of_speech_tags?.[0] ? { pos: row.part_of_speech_tags[0] } : {}),
      });
    }
    pools.set(level, pool);
  }

  return pools;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadDotEnvLocal();

  const sourceArg = process.argv.find((arg) => arg.startsWith('--source='))?.slice('--source='.length);
  const hasDbCredentials = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
    && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  );
  const source = sourceArg ?? (hasDbCredentials ? 'db' : 'datasets');
  if (source !== 'db' && source !== 'datasets') {
    throw new Error(`Unknown source "${source}". Use --source=db or --source=datasets.`);
  }

  console.log(`Building level-test bank from source: ${source}`);
  const pools = source === 'db' ? await buildPoolsFromDb() : await buildPoolsFromDatasets();

  const levels: Array<Array<[string, string, [string, string, string]]>> = [];
  const summary: Array<{ level: string; poolWords: number; bankWords: number; withLookalike: string }> = [];

  for (let levelIndex = 0; levelIndex < EIKEN_LEVEL_ORDER.length; levelIndex += 1) {
    const level = EIKEN_LEVEL_ORDER[levelIndex];
    const pool = pools.get(level) ?? [];
    const { bank: levelBank, wordsWithLookalike } = buildLevelBank(pool, levelIndex);
    const bank = levelBank.slice(0, WORDS_PER_LEVEL);

    if (bank.length < 100) {
      throw new Error(`${EIKEN_LEVEL_LABELS[level]}: only ${bank.length} usable words (need at least 100)`);
    }
    if (bank.length < WORDS_PER_LEVEL) {
      console.warn(`WARN ${EIKEN_LEVEL_LABELS[level]}: only ${bank.length}/${WORDS_PER_LEVEL} words`);
    }

    levels.push(bank.map((word) => [word.english, word.japanese, word.distractors]));
    summary.push({
      level: EIKEN_LEVEL_LABELS[level],
      poolWords: pool.length,
      bankWords: bank.length,
      // 接頭辞/接尾辞が似た誤答を1つ以上含む問題の割合
      withLookalike: `${Math.round((wordsWithLookalike / Math.max(1, levelBank.length)) * 100)}%`,
    });
  }

  const output = { version: BANK_VERSION, levels };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output));

  const bytes = Buffer.byteLength(JSON.stringify(output));
  console.table(summary);
  console.log(`Wrote ${OUTPUT_PATH} (${(bytes / 1024).toFixed(1)} KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
