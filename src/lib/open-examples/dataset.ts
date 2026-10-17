import { paraphraseHeadwordCandidates } from '@/lib/paraphrase/headword';

/**
 * スキャンで付ける例文のストック (scripts/open-examples/build_dataset.py が生成する dataset.json)。
 *
 * Tatoeba の英日対訳を、WordNet の見出し語 (活用形・熟語を含めて) で引けるようにした表。
 * AI は使わない。見出し語ごとに和訳の違う候補を数件持っており、どれを使うかは単語帳の
 * 日本語訳で選ぶ (bank = 銀行 なら「銀行にお金を預けた」、土手 なら「川の土手に座った」)。
 */

export interface OpenExampleDatasetSource {
  name: string;
  license: string;
  url: string;
}

/** [Tatoeba の英文ID, 英文, Tatoeba の和文ID, 和文] */
export type OpenExampleRawPair = [englishId: number, english: string, japaneseId: number, japanese: string];

export interface OpenExampleDataset {
  version: number;
  generatedAt: string | null;
  sources: OpenExampleDatasetSource[];
  pairs: OpenExampleRawPair[];
  /** 見出し語 (小文字・空白区切り) → pairs の添字 (良い順) */
  entries: Record<string, number[]>;
}

export interface OpenExample {
  exampleSentence: string;
  exampleSentenceJa: string;
  /** 帰属表示用。Tatoeba の文ID */
  tatoebaEnglishId: number;
  tatoebaJapaneseId: number;
}

/** dataset.json の形を軽く確かめる (数 MB あるので zod には通さない)。 */
export function parseOpenExampleDataset(raw: unknown): OpenExampleDataset {
  if (!raw || typeof raw !== 'object') throw new Error('open examples dataset: not an object');
  const record = raw as Record<string, unknown>;
  if (typeof record.version !== 'number') throw new Error('open examples dataset: version missing');
  if (!Array.isArray(record.pairs)) throw new Error('open examples dataset: pairs must be an array');
  if (!record.entries || typeof record.entries !== 'object' || Array.isArray(record.entries)) {
    throw new Error('open examples dataset: entries must be an object');
  }
  const sources = Array.isArray(record.sources)
    ? (record.sources as unknown[]).filter(
      (source): source is OpenExampleDatasetSource =>
        !!source && typeof source === 'object'
        && typeof (source as OpenExampleDatasetSource).name === 'string'
        && typeof (source as OpenExampleDatasetSource).license === 'string'
        && typeof (source as OpenExampleDatasetSource).url === 'string',
    )
    : [];
  return {
    version: record.version,
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : null,
    sources,
    pairs: record.pairs as OpenExampleRawPair[],
    entries: record.entries as Record<string, number[]>,
  };
}

const HAN = /\p{Script=Han}/u;
const TRAILING_KANA = /[\p{Script=Hiragana}ー]+$/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 単語帳の訳 (「1.平凡な 2.つまらない」「本」など) を、和文と比べる断片に刻む。
 * 言い換え辞書の `tokenizeJapaneseHint` と同じ区切りだが、漢字 1 文字の訳 (本・川) も残す。
 */
export function tokenizeExampleHint(hint: string): string[] {
  return hint
    .normalize('NFKC')
    .split(/[\s、,/・;:()\[\]「」『』【】〈〉《》〜~…0-9①-⑳.]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 || (token.length === 1 && HAN.test(token)));
}

/**
 * 単語帳の訳の断片 (「諦める」「銀行」「平凡な」) が和文に現れているか。
 *
 * 和文は活用していることが多い (諦める → 諦めた) ので、漢字を含む断片は送り仮名を落とした
 * 語幹で見る。語幹が漢字 1 文字だけのとき (走る → 走) は偶然の一致 (行う → 銀行) が多いので、
 * 前に漢字が無く後ろに仮名が続く (= 用言として使われている) ときだけ一致とする。
 */
export function japaneseHintAppearsIn(token: string, sentence: string): boolean {
  if (!token) return false;
  // 漢字 1 文字の訳は熟語の一部 (本 → 日本) に当たりやすいので、前後が漢字でないときだけ
  if (token.length === 1) {
    return new RegExp(`(?<!\\p{Script=Han})${escapeRegExp(token)}(?!\\p{Script=Han})`, 'u').test(sentence);
  }
  if (sentence.includes(token)) return true;
  if (HAN.test(token)) {
    const stem = token.replace(TRAILING_KANA, '');
    if (stem === token || stem.length === 0) return false;
    if (stem.length >= 2) return sentence.includes(stem);
    return new RegExp(`(?<!\\p{Script=Han})${escapeRegExp(stem)}[\\p{Script=Hiragana}]`, 'u').test(sentence);
  }
  // 仮名だけの訳 (あきらめる) は最後の 1 文字が活用で変わる
  if (token.length >= 3 && /^[\p{Script=Hiragana}]+$/u.test(token)) {
    return sentence.includes(token.slice(0, -1));
  }
  return false;
}

/**
 * 単語帳の語に合う例文を選ぶ。合う例文が無ければ null。
 *
 * 候補は見出し語ごとに良い順に並んでいるので、単語帳の訳 (`japaneseHints`) が和文に
 * 現れる最初の候補を使う。訳が和文に現れない候補は使わない —— 別の語義の例文
 * (bank = 土手 の語に「銀行にお金を預けた」) を付けるくらいなら付けない方がよい。
 */
export function selectOpenExample(
  dataset: OpenExampleDataset,
  english: string,
  japaneseHints: readonly string[],
): OpenExample | null {
  const tokens = Array.from(new Set(japaneseHints.flatMap(tokenizeExampleHint)));
  if (tokens.length === 0) return null;
  for (const headword of paraphraseHeadwordCandidates(english)) {
    const refs = dataset.entries[headword];
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      const pair = Number.isInteger(ref) ? dataset.pairs[ref] : undefined;
      if (!Array.isArray(pair) || pair.length < 4) continue;
      const [englishId, sentence, japaneseId, sentenceJa] = pair;
      if (typeof sentence !== 'string' || typeof sentenceJa !== 'string' || !sentence || !sentenceJa) continue;
      if (tokens.some((token) => japaneseHintAppearsIn(token, sentenceJa))) {
        return {
          exampleSentence: sentence,
          exampleSentenceJa: sentenceJa,
          tatoebaEnglishId: englishId,
          tatoebaJapaneseId: japaneseId,
        };
      }
    }
  }
  return null;
}
