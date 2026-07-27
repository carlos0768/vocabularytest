import type { Word, WordTranslation } from '@/types';

/**
 * 出題直前に、多義語の他の語義を単語へ取り込むクライアント側の入口。
 * サーバー（POST /api/words/senses）が word_translations 行を実体化し、
 * ここでは返ってきた訳一覧をメモリ上の Word にマージするだけ。
 */

/** 1リクエストで送る単語数。 */
const CHUNK_SIZE = 25;
/** 語義展開を試す単語数の上限（出題は最大20問なので上位のみで足りる）。 */
export const MAX_POLYSEMY_EXPANSION_WORDS = 40;

export interface PolysemySensesApiResult {
  wordId: string;
  translations: WordTranslation[];
}

export function selectWordsForPolysemyExpansion(
  words: readonly Word[],
  limit: number = MAX_POLYSEMY_EXPANSION_WORDS,
): Word[] {
  const selected: Word[] = [];
  for (const word of words) {
    if (selected.length >= limit) break;
    // lexicon に紐づいていない単語は他の語義を引けない。
    if (!word.lexiconEntryId) continue;
    selected.push(word);
  }
  return selected;
}

export function mergePolysemyTranslations(
  words: readonly Word[],
  results: readonly PolysemySensesApiResult[],
): Word[] {
  if (results.length === 0) return [...words];
  const byWordId = new Map(results.map((result) => [result.wordId, result.translations]));
  return words.map((word) => {
    const translations = byWordId.get(word.id);
    if (!translations || translations.length === 0) return word;
    return { ...word, translations };
  });
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function requestPolysemyTranslations(wordIds: string[]): Promise<PolysemySensesApiResult[]> {
  const response = await fetch('/api/words/senses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wordIds }),
  });
  if (!response.ok) return [];
  const data = await response.json() as { success?: boolean; results?: unknown };
  if (!data.success || !Array.isArray(data.results)) return [];
  return data.results.filter((result): result is PolysemySensesApiResult => (
    typeof result === 'object'
    && result !== null
    && typeof (result as PolysemySensesApiResult).wordId === 'string'
    && Array.isArray((result as PolysemySensesApiResult).translations)
  ));
}

/**
 * 多義語の語義を取り込んだ単語配列を返す。
 * 失敗しても出題は止めない（元の配列をそのまま返す）。
 */
export async function attachPolysemySenses(
  words: readonly Word[],
  options: { limit?: number } = {},
): Promise<Word[]> {
  const targets = selectWordsForPolysemyExpansion(words, options.limit);
  if (targets.length === 0) return [...words];

  try {
    const batches = await Promise.all(
      chunk(targets.map((word) => word.id), CHUNK_SIZE).map(requestPolysemyTranslations),
    );
    return mergePolysemyTranslations(words, batches.flat());
  } catch {
    return [...words];
  }
}
