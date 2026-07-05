import type { SupabaseClient } from '@supabase/supabase-js';

import { CEFR_LEVEL_ORDER, EIKEN_TO_CEFR_BAND, type CefrLevel } from '@/lib/reels/eiken-cefr';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeHeadword } from '../../../shared/lexicon';

const LOOKUP_CHUNK_SIZE = 200;

interface LexiconCefrRow {
  normalized_headword: string;
  cefr_level: string | null;
}

export interface EikenCefrFilterDeps {
  supabaseAdmin?: SupabaseClient;
  lookupCefrLevels?: (normalizedHeadwords: string[]) => Promise<Map<string, CefrLevel>>;
}

export interface EikenCefrFilterResult<T> {
  words: T[];
  removedCount: number;
  unknownCount: number;
}

function cefrIndex(level: string): number {
  return CEFR_LEVEL_ORDER.indexOf(level.toUpperCase() as CefrLevel);
}

/**
 * 指定英検級の「これ未満は除外」しきい値。バンドの下限CEFRレベルを返す。
 * 例: 準1級 -> B2(B1以下の単語は除外対象)。
 */
export function getEikenCefrThreshold(eikenLevel: string | null | undefined): CefrLevel | null {
  if (!eikenLevel) return null;
  const band = EIKEN_TO_CEFR_BAND[eikenLevel];
  if (!band || band.length === 0) return null;
  return band.reduce((easiest, level) => (cefrIndex(level) < cefrIndex(easiest) ? level : easiest));
}

/**
 * lexicon_entries から見出し語ごとのCEFRレベルを引く。
 * 同じ見出し語に複数品詞の行がある場合は最も易しいレベルを採用する
 * (易しい語義が1つでもあれば、その単語は学習者にとって既知の可能性が高いため)。
 */
export async function lookupLexiconCefrLevels(
  normalizedHeadwords: string[],
  deps: EikenCefrFilterDeps = {},
): Promise<Map<string, CefrLevel>> {
  const unique = Array.from(new Set(normalizedHeadwords.filter((value) => value.length > 0)));
  const levels = new Map<string, CefrLevel>();
  if (unique.length === 0) {
    return levels;
  }

  const supabaseAdmin = deps.supabaseAdmin ?? getSupabaseAdmin();

  for (let index = 0; index < unique.length; index += LOOKUP_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + LOOKUP_CHUNK_SIZE);
    const { data, error } = await supabaseAdmin
      .from('lexicon_entries')
      .select('normalized_headword, cefr_level')
      .in('normalized_headword', chunk);

    if (error) {
      throw new Error(`Failed to look up lexicon CEFR levels: ${error.message}`);
    }

    for (const row of (data ?? []) as LexiconCefrRow[]) {
      if (!row.cefr_level) continue;
      const levelIndex = cefrIndex(row.cefr_level);
      if (levelIndex === -1) continue;
      const current = levels.get(row.normalized_headword);
      if (!current || levelIndex < cefrIndex(current)) {
        levels.set(row.normalized_headword, CEFR_LEVEL_ORDER[levelIndex]);
      }
    }
  }

  return levels;
}

/**
 * 抽出済み単語を lexicon の CEFR レベルで決定的にフィルタする。
 * - lexicon 上のレベルが指定英検級のしきい値未満 -> 除外
 * - lexicon に無い/レベル不明な単語 -> 除外(unknownCount にカウント)。
 *   OCR誤読やゴミ文字列の混入を防ぐため、lexicon をホワイトリストとして扱う。
 *   本物の難語が誤除外されないよう、インポートスクリプトはC2バケットまで取り込むこと。
 * - ルックアップ自体の失敗(DB障害など)時はフィルタなしで返す(fail-open)
 */
export async function filterWordsByLexiconCefrLevel<T extends { english: string }>(
  words: T[],
  eikenLevel: string | null | undefined,
  deps: EikenCefrFilterDeps = {},
): Promise<EikenCefrFilterResult<T>> {
  const threshold = getEikenCefrThreshold(eikenLevel);
  if (!threshold || words.length === 0) {
    return { words, removedCount: 0, unknownCount: 0 };
  }

  let levels: Map<string, CefrLevel>;
  try {
    const lookup = deps.lookupCefrLevels
      ?? ((headwords: string[]) => lookupLexiconCefrLevels(headwords, deps));
    levels = await lookup(words.map((word) => normalizeHeadword(word.english)));
  } catch (error) {
    console.warn('[eiken-cefr-filter] lexicon lookup failed, skipping deterministic filter', error);
    return { words, removedCount: 0, unknownCount: words.length };
  }

  const thresholdIndex = cefrIndex(threshold);
  let removedCount = 0;
  let unknownCount = 0;

  const filtered = words.filter((word) => {
    const level = levels.get(normalizeHeadword(word.english));
    if (!level) {
      unknownCount += 1;
      return false;
    }
    if (cefrIndex(level) < thresholdIndex) {
      removedCount += 1;
      return false;
    }
    return true;
  });

  return { words: filtered, removedCount, unknownCount };
}
