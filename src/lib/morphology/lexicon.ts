/**
 * 語源解説の共有キャッシュ（lexicon_entries.morphology）
 *
 * 一度生成した語源解説は lexicon マスターに保存し、全ユーザーで再利用する。
 * - 書き込みは既定で fill-if-empty（`.is('morphology', null)`）: 既存値は上書きしない
 * - 例外は `overwriteExisting`。解析範囲を広げた後に旧世代の「構造なし」を
 *   再解析したときだけ立ち、その行を上書きする（呼び出し側が直前に読んで
 *   none センチネルだと確認した行に限る）
 * - 「語源構造なし」の単語は {version:1, none:true, analysis:N} を保存して再生成を防ぐ
 * - lexicon_entries は (normalized_headword, pos) でユニークなため、同一
 *   headword の複数 pos 行に同じ morphology が非正規化して入る。読み取りは
 *   非 null の任意の行を採用する。
 * - headword に対応する lexicon 行が存在しない場合は保存されない（次回
 *   スキャン時に再生成される）。スキャンフローは lexicon resolver が行を
 *   作るため、実運用ではほぼヒットする。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeWordMorphology } from '@/lib/schemas/morphology';
import type { WordMorphology } from '../../../shared/types';

const LOOKUP_CHUNK_SIZE = 200;

interface LexiconMorphologyRow {
  normalized_headword: string;
  morphology: unknown;
}

/**
 * normalized_headword → WordMorphology のマップを返す（morphology 非 null の行のみ）。
 */
export async function getCachedMorphologyByHeadword(
  normalizedHeadwords: string[],
  deps: { supabaseAdmin?: SupabaseClient } = {},
): Promise<Map<string, WordMorphology>> {
  const cached = new Map<string, WordMorphology>();
  const unique = Array.from(new Set(normalizedHeadwords.filter((headword) => headword.length > 0)));
  if (unique.length === 0) return cached;

  const supabaseAdmin = deps.supabaseAdmin ?? getSupabaseAdmin();

  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += LOOKUP_CHUNK_SIZE) {
    chunks.push(unique.slice(index, index + LOOKUP_CHUNK_SIZE));
  }

  // チャンクは互いに素な見出し語の集合なので並列に引ける（リールのように
  // 数百語を一度に引く呼び出しで直列の往復が積み上がるのを避ける）。
  // 結果はチャンク順に畳み込むので、行の採用順は直列時と変わらない。
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabaseAdmin
        .from('lexicon_entries')
        .select('normalized_headword, morphology')
        .in('normalized_headword', chunk)
        .not('morphology', 'is', null),
    ),
  );

  for (const { data, error } of results) {
    if (error) {
      throw new Error(`Failed to look up lexicon morphology: ${error.message}`);
    }

    for (const row of (data ?? []) as LexiconMorphologyRow[]) {
      if (cached.has(row.normalized_headword)) continue;
      const morphology = normalizeWordMorphology(row.morphology);
      if (morphology) {
        cached.set(row.normalized_headword, morphology);
      }
    }
  }

  return cached;
}

/**
 * 生成した語源解説を lexicon_entries に保存する。
 * 既定では既存値がある行は触らない（`overwriteExisting` の行だけ上書きする）。
 */
export async function saveMorphologyToLexicon(
  entries: Array<{
    normalizedHeadword: string;
    morphology: WordMorphology;
    /** 旧世代の none センチネルを新しい解析結果で置き換える場合だけ true */
    overwriteExisting?: boolean;
  }>,
  deps: { supabaseAdmin?: SupabaseClient } = {},
): Promise<{ updated: number; errors: number }> {
  if (entries.length === 0) return { updated: 0, errors: 0 };

  const supabaseAdmin = deps.supabaseAdmin ?? getSupabaseAdmin();
  let updated = 0;
  let errors = 0;

  for (const entry of entries) {
    try {
      const query = supabaseAdmin
        .from('lexicon_entries')
        .update({ morphology: entry.morphology })
        .eq('normalized_headword', entry.normalizedHeadword);
      const { error } = entry.overwriteExisting
        ? await query
        : await query.is('morphology', null);

      if (error) {
        console.error(`[saveMorphologyToLexicon] Failed for ${entry.normalizedHeadword}:`, error);
        errors++;
      } else {
        updated++;
      }
    } catch (e) {
      console.error(`[saveMorphologyToLexicon] Exception for ${entry.normalizedHeadword}:`, e);
      errors++;
    }
  }

  return { updated, errors };
}
