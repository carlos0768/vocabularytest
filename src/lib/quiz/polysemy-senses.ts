/**
 * 多義語の「単語行に紐づいていない語義」を出題対象として materialize する。
 *
 * スキャン/手動追加で保存される単語は、その時点の1つの訳しか word_translations
 * に持たない。一方 lexicon_senses には同じ見出し語の他の語義が溜まっている。
 * 語義ごとにクイズを出すには、それらを word_translations 行として実体化する
 * 必要がある（進捗＝SM-2は word_translations 行に紐づくため）。
 *
 * 英検レベルによる絞り込みはここでは行わない。全語義を保存しておき、出題時に
 * `filterSensesByEikenLevel()` で落とす。こうすることで学習者が英検レベルを
 * 変えたときに保存済みデータを作り直す必要がなくなる。
 */

import { normalizeLexiconTranslation } from '../../../shared/lexicon';

/** 1単語につき追加する語義の上限。出題が特定の単語に偏るのを防ぐ。 */
export const MAX_POLYSEMY_SENSES_PER_WORD = 3;

export interface PolysemyWordInput {
  id: string;
  japanese: string;
  lexiconEntryId?: string | null;
  lexiconSenseId?: string | null;
}

export interface PolysemySenseInput {
  id: string;
  lexiconEntryId: string;
  translationJa: string;
  normalizedTranslationJa?: string | null;
  distinctKey?: string | null;
  isPrimary?: boolean | null;
  createdAt?: string | null;
}

export interface ExistingTranslationInput {
  wordId: string;
  normalizedTranslationJa?: string | null;
  translationJa?: string | null;
  position?: number | null;
  meaningRank?: number | null;
  isPrimary?: boolean | null;
}

export interface PolysemyTranslationRow {
  word_id: string;
  lexicon_sense_id: string | null;
  translation_ja: string;
  normalized_translation_ja: string;
  source: 'ai' | null;
  meaning_rank: number;
  position: number;
  is_primary: boolean;
}

function normalizeKey(value: string | null | undefined): string {
  return normalizeLexiconTranslation(value) ?? '';
}

/**
 * 追加すべき word_translations 行を組み立てる。
 *
 * - 単語に訳行が1件も無い場合は、まず単語自身の訳を primary 行として作る
 *   （非primary行だけ入れると、その語義が単語の表示訳になってしまう）
 * - 既に持っている訳と同じ語義は追加しない
 * - distinct_key が無い語義（= 個別出題対象として印が付いていない）は追加しない
 */
export function buildPolysemyTranslationRows(params: {
  words: readonly PolysemyWordInput[];
  sensesByEntryId: ReadonlyMap<string, readonly PolysemySenseInput[]>;
  existingTranslations: readonly ExistingTranslationInput[];
  maxSensesPerWord?: number;
}): PolysemyTranslationRow[] {
  const { words, sensesByEntryId, existingTranslations } = params;
  const maxSensesPerWord = params.maxSensesPerWord ?? MAX_POLYSEMY_SENSES_PER_WORD;
  const existingByWordId = new Map<string, ExistingTranslationInput[]>();
  for (const translation of existingTranslations) {
    const bucket = existingByWordId.get(translation.wordId);
    if (bucket) bucket.push(translation);
    else existingByWordId.set(translation.wordId, [translation]);
  }

  const rows: PolysemyTranslationRow[] = [];

  for (const word of words) {
    const entryId = word.lexiconEntryId ?? '';
    if (!entryId) continue;
    const senses = sensesByEntryId.get(entryId) ?? [];
    if (senses.length === 0) continue;

    const existing = existingByWordId.get(word.id) ?? [];
    const taken = new Set<string>();
    for (const translation of existing) {
      const key = normalizeKey(translation.normalizedTranslationJa) || normalizeKey(translation.translationJa);
      if (key) taken.add(key);
    }

    const ownJapanese = normalizeKey(word.japanese);
    const pendingRows: PolysemyTranslationRow[] = [];
    let nextPosition = existing.reduce(
      (max, translation) => Math.max(max, (translation.position ?? 0) + 1),
      0,
    );

    if (existing.length === 0 && ownJapanese) {
      pendingRows.push({
        word_id: word.id,
        lexicon_sense_id: word.lexiconSenseId ?? null,
        translation_ja: word.japanese.trim(),
        normalized_translation_ja: ownJapanese,
        source: null,
        meaning_rank: 1,
        position: 0,
        is_primary: true,
      });
      nextPosition = 1;
    }
    if (ownJapanese) taken.add(ownJapanese);

    const candidates = senses
      .filter((sense) => !sense.isPrimary)
      .filter((sense) => normalizeKey(sense.distinctKey).length > 0)
      .filter((sense) => {
        const key = normalizeKey(sense.normalizedTranslationJa) || normalizeKey(sense.translationJa);
        return key.length > 0 && !taken.has(key);
      });

    for (const sense of candidates) {
      if (pendingRows.filter((row) => !row.is_primary).length >= maxSensesPerWord) break;
      const translationJa = normalizeLexiconTranslation(sense.translationJa);
      const key = normalizeKey(sense.normalizedTranslationJa) || normalizeKey(sense.translationJa);
      if (!translationJa || !key || taken.has(key)) continue;
      taken.add(key);
      pendingRows.push({
        word_id: word.id,
        lexicon_sense_id: sense.id,
        translation_ja: translationJa,
        normalized_translation_ja: key,
        source: 'ai',
        meaning_rank: nextPosition + 1,
        position: nextPosition,
        is_primary: false,
      });
      nextPosition += 1;
    }

    // 追加語義が1件も無いなら primary のシード行だけ作る意味はない。
    if (pendingRows.some((row) => !row.is_primary)) {
      rows.push(...pendingRows);
    }
  }

  return rows;
}
