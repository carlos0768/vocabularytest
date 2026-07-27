/**
 * AI訳生成（多義語対応）の senses を lexicon_senses へ保存するヘルパー。
 *
 * - 既存sense（scan由来など）は上書きしない（insert-only upsert）
 * - エントリに既存senseがある場合、新規senseは is_primary=false で追加する
 *   （primaryの二重化を防ぐ）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeLexiconTranslation } from '../../../shared/lexicon';
import type { TranslatedSense } from './types';

/** SQL関数 normalize_lexicon_translation_key と同等の正規化。 */
export function normalizeLexiconSenseKey(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

export interface UpsertAiSensesResult {
  inserted: number;
  skipped: number;
}

export async function upsertAiTranslationSenses(
  supabaseAdmin: SupabaseClient,
  lexiconEntryId: string,
  senses: TranslatedSense[],
): Promise<UpsertAiSensesResult> {
  const result: UpsertAiSensesResult = { inserted: 0, skipped: 0 };
  if (senses.length === 0) return result;

  // 既存senseがあるエントリには primary を立てない（primary重複防止）
  const { count, error: countError } = await supabaseAdmin
    .from('lexicon_senses')
    .select('id', { count: 'exact', head: true })
    .eq('lexicon_entry_id', lexiconEntryId);

  if (countError) {
    // lexicon_senses が無い互換環境では黙ってスキップ
    console.warn('[lexicon-senses] Sense count lookup failed, skipping sense upsert:', countError.message);
    return result;
  }

  const hasExistingSenses = (count ?? 0) > 0;

  const rows = senses
    .map((sense) => {
      const translation = normalizeLexiconTranslation(sense.japanese);
      if (!translation) return null;
      const normalizedKey = normalizeLexiconSenseKey(translation);
      if (!normalizedKey) return null;
      const isPrimary = hasExistingSenses ? false : sense.isPrimary;
      return {
        lexicon_entry_id: lexiconEntryId,
        translation_ja: translation,
        normalized_translation_ja: normalizedKey,
        meaning_summary: sense.meaningSummary,
        // distinct_key は「この語義を個別に出題する」印。主要語義は単語行そのもの
        // として既に出題されるので付けない（付けると primary 判定が崩れる）。
        distinct_key: isPrimary ? null : (sense.distinctKey ?? normalizedKey),
        cefr_level: sense.cefrLevel ?? null,
        translation_source: 'ai',
        is_primary: isPrimary,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return result;

  const { error } = await supabaseAdmin
    .from('lexicon_senses')
    .upsert(rows, {
      onConflict: 'lexicon_entry_id,normalized_translation_ja',
      ignoreDuplicates: true, // 既存sense（scan由来など）は上書きしない
    });

  if (error) {
    console.warn('[lexicon-senses] Sense upsert failed (non-critical):', error.message);
    result.skipped = rows.length;
    return result;
  }

  result.inserted = rows.length;

  // 既存senseは上書きしない方針だが、CEFRレベルだけは「まだ空の行を埋める」
  // 更新を掛ける。英検レベルでの語義フィルタはこの値が無いと効かないため。
  await Promise.all(
    rows
      .filter((row) => row.cefr_level !== null)
      .map(async (row) => {
        const { error: levelError } = await supabaseAdmin
          .from('lexicon_senses')
          .update({ cefr_level: row.cefr_level })
          .eq('lexicon_entry_id', row.lexicon_entry_id)
          .eq('normalized_translation_ja', row.normalized_translation_ja)
          .is('cefr_level', null);
        if (levelError) {
          console.warn('[lexicon-senses] Sense CEFR fill failed (non-critical):', levelError.message);
        }
      }),
  );

  return result;
}
