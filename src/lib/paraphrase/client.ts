import type { Word } from '@/types';
import { isClassicalWord } from '@/lib/classical/is-classical';
import type { ParaphraseMaterial, ParaphrasePos } from './dataset';

/**
 * クライアントから `/api/paraphrase/lookup` を呼び、単語 ID → 出題材料の表にする。
 *
 * 材料は語ごとに決まっていて変わらないので、同じページの中では english ごとに
 * メモリに覚え、同じ語を二度は訊かない (復習や「すべての単語帳」では何百語になる)。
 */

const REQUEST_CHUNK_SIZE = 200;
const REQUEST_TIMEOUT_MS = 15000;

const materialCache = new Map<string, ParaphraseMaterial | null>();

/** 辞書の語義を選ぶ手がかりになる日本語訳 (単語の訳と、語義ごとの訳)。 */
function japaneseHints(word: Pick<Word, 'japanese' | 'translations'>): string[] {
  const hints = [word.japanese, ...(word.translations ?? []).map((translation) => translation.translationJa)];
  return Array.from(new Set(hints.filter((hint): hint is string => typeof hint === 'string' && hint.trim().length > 0).map((hint) => hint.trim())));
}

function cacheKey(word: Pick<Word, 'english' | 'partOfSpeechTags' | 'japanese' | 'translations'>): string {
  return `${word.english.trim().toLowerCase()}\u0000${(word.partOfSpeechTags ?? []).join(',')}\u0000${japaneseHints(word).join('|')}`;
}

/** 言い換えの材料を引く意味がある語か (英語の見出し語だけ。古典語は対象外)。 */
export function isParaphraseCandidateWord(word: Pick<Word, 'english' | 'isClassical' | 'classicalEntryId'>): boolean {
  if (isClassicalWord(word)) return false;
  return /[A-Za-z]/.test(word.english);
}

function isMaterial(value: unknown): value is ParaphraseMaterial & { wordId: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.wordId === 'string'
    && typeof record.headword === 'string'
    && typeof record.pos === 'string'
    && Array.isArray(record.answers) && record.answers.every((item) => typeof item === 'string')
    && Array.isArray(record.distractors) && record.distractors.every((item) => typeof item === 'string');
}

export interface FetchParaphraseMaterialsDeps {
  fetchImpl?: typeof fetch;
  cache?: Map<string, ParaphraseMaterial | null>;
}

/**
 * 単語たちの材料を取りに行く。結果は「材料のある語」だけを持つ Map。
 * 通信に失敗したら投げる (呼び出し側が「取得できなかった」画面を出す)。
 */
export async function fetchParaphraseMaterials(
  words: readonly Word[],
  deps: FetchParaphraseMaterialsDeps = {},
): Promise<Map<string, ParaphraseMaterial>> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cache = deps.cache ?? materialCache;
  const result = new Map<string, ParaphraseMaterial>();
  const pending: Word[] = [];

  for (const word of words) {
    if (!isParaphraseCandidateWord(word)) continue;
    const key = cacheKey(word);
    if (cache.has(key)) {
      const cached = cache.get(key);
      if (cached) result.set(word.id, cached);
      continue;
    }
    pending.push(word);
  }

  for (let index = 0; index < pending.length; index += REQUEST_CHUNK_SIZE) {
    const chunk = pending.slice(index, index + REQUEST_CHUNK_SIZE);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let payload: { success?: boolean; results?: unknown[] };
    try {
      const response = await fetchImpl('/api/paraphrase/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: chunk.map((word) => {
            const hints = japaneseHints(word);
            return {
              id: word.id,
              english: word.english,
              ...(word.partOfSpeechTags?.length ? { partOfSpeechTags: word.partOfSpeechTags.slice(0, 8) } : {}),
              ...(hints[0] ? { japanese: hints[0].slice(0, 300) } : {}),
              ...(hints.length > 1 ? { translations: hints.slice(1, 11).map((hint) => hint.slice(0, 120)) } : {}),
            };
          }),
        }),
        signal: controller.signal,
      });
      payload = await response.json();
      if (!response.ok || !payload.success || !Array.isArray(payload.results)) {
        throw new Error('paraphrase lookup failed');
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const byWordId = new Map<string, ParaphraseMaterial>();
    for (const item of payload.results) {
      if (!isMaterial(item)) continue;
      const { wordId, ...material } = item;
      byWordId.set(wordId, { ...material, pos: material.pos as ParaphrasePos });
    }
    for (const word of chunk) {
      const material = byWordId.get(word.id) ?? null;
      cache.set(cacheKey(word), material);
      if (material) result.set(word.id, material);
    }
  }

  return result;
}
