/**
 * Pronunciation Lookup via Free Dictionary API
 *
 * 英単語の IPA 発音記号を dictionaryapi.dev から取得する。
 * scan-jobs/process の after() でバッチ実行し、words.pronunciation に保存する。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

const DICTIONARY_TIMEOUT_MS = 8_000;
const CONCURRENCY = 5;

type DictionaryPhonetic = {
  text?: string;
};

type DictionaryResponse = {
  phonetic?: string;
  phonetics?: DictionaryPhonetic[];
};

function extractIPA(entry: DictionaryResponse): string | null {
  if (entry.phonetic && entry.phonetic.trim()) {
    return entry.phonetic.trim();
  }

  if (Array.isArray(entry.phonetics)) {
    for (const p of entry.phonetics) {
      if (p.text && p.text.trim()) {
        return p.text.trim();
      }
    }
  }

  return null;
}

async function fetchPronunciation(english: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DICTIONARY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(english.toLowerCase().trim())}`,
      { method: 'GET', signal: controller.signal },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;

    return extractIPA(data[0] as DictionaryResponse);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface PronunciationResult {
  wordId: string;
  pronunciation: string;
}

/**
 * 指定した単語リストの IPA 発音記号を Dictionary API から取得する。
 * 取得できた単語のみ結果に含む。
 */
export async function lookupPronunciations(
  words: Array<{ id: string; english: string }>,
): Promise<PronunciationResult[]> {
  if (words.length === 0) return [];

  const results: PronunciationResult[] = [];

  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const chunk = words.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async (word) => {
        const ipa = await fetchPronunciation(word.english);
        return ipa ? { wordId: word.id, pronunciation: ipa } : null;
      }),
    );

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }
  }

  return results;
}

/**
 * pronunciation が null の単語に対して Dictionary API で IPA を取得し DB 更新する。
 */
export async function backfillPronunciations(
  wordIds: string[],
): Promise<{ updated: number; errors: number }> {
  if (wordIds.length === 0) return { updated: 0, errors: 0 };

  const supabaseAdmin = getSupabaseAdmin();

  const { data: words, error: fetchError } = await supabaseAdmin
    .from('words')
    .select('id, english, pronunciation')
    .in('id', wordIds)
    .is('pronunciation', null);

  if (fetchError || !words || words.length === 0) {
    return { updated: 0, errors: fetchError ? 1 : 0 };
  }

  const lookupResults = await lookupPronunciations(
    (words as Array<{ id: string; english: string }>).map((w) => ({
      id: w.id,
      english: w.english,
    })),
  );

  if (lookupResults.length === 0) {
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  await Promise.all(
    lookupResults.map(async (result) => {
      const { error } = await supabaseAdmin
        .from('words')
        .update({ pronunciation: result.pronunciation })
        .eq('id', result.wordId)
        .is('pronunciation', null);

      if (error) {
        errors++;
      } else {
        updated++;
      }
    }),
  );

  return { updated, errors };
}
