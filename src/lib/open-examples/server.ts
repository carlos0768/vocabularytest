// サーバー専用。クライアントから import してはいけない (数 MB の辞書がバンドルに入る)。
import rawDataset from './dataset.json';
import { shouldSkipEnglishEnrichment } from '@/lib/classical/is-classical';
import {
  parseOpenExampleDataset,
  selectOpenExample,
  type OpenExampleDataset,
} from './dataset';

/**
 * 言い換え辞書 (`src/lib/paraphrase/server.ts`) と同じく、静的 import で関数バンドルに
 * 同梱し、最初に使うときに一度だけ解釈する。
 */
let cached: OpenExampleDataset | null = null;

export function getOpenExampleDataset(): OpenExampleDataset {
  if (!cached) {
    cached = parseOpenExampleDataset(rawDataset);
  }
  return cached;
}

export interface OpenExampleTargetWord {
  english?: string | null;
  japanese?: string | null;
  translations?: ReadonlyArray<{ translationJa?: unknown } | null | undefined> | null;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  classicalEntryId?: string | null;
  isClassical?: boolean | null;
}

function japaneseHintsOf(word: OpenExampleTargetWord): string[] {
  const hints: string[] = [];
  if (typeof word.japanese === 'string') hints.push(word.japanese);
  for (const translation of word.translations ?? []) {
    if (typeof translation?.translationJa === 'string') hints.push(translation.translationJa);
  }
  return hints.filter((hint) => hint.trim().length > 0);
}

/**
 * スキャンした語に、オープンデータの例文を付ける。
 *
 * 単語帳の訳に合う例文があれば、辞書 (lexicon_entries) から転記済みの例文 (以前 AI で
 * 作って貯めたもの) より優先して差し替える。合う例文が無い語はそのまま (転記済みの例文が
 * あれば残る)。古典語は対象外 (英語の例文は付けない、INV-19)。
 *
 * 入力は書き換えず、差し替えた語だけ新しいオブジェクトにした配列を返す。
 */
export function applyOpenDataExamples<T extends OpenExampleTargetWord>(
  words: readonly T[],
  dataset: OpenExampleDataset = getOpenExampleDataset(),
): { words: T[]; appliedCount: number } {
  if (dataset.pairs.length === 0) return { words: [...words], appliedCount: 0 };
  let appliedCount = 0;
  const next = words.map((word) => {
    if (typeof word.english !== 'string' || !word.english.trim()) return word;
    if (shouldSkipEnglishEnrichment(word)) return word;
    const example = selectOpenExample(dataset, word.english, japaneseHintsOf(word));
    if (!example) return word;
    appliedCount += 1;
    return {
      ...word,
      exampleSentence: example.exampleSentence,
      exampleSentenceJa: example.exampleSentenceJa,
    };
  });
  return { words: next, appliedCount };
}
