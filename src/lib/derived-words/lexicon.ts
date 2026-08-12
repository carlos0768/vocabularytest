/**
 * 派生語の共有キャッシュ（lexicon_entries.derived_words）
 *
 * morphology/lexicon.ts と同じ設計:
 * - 書き込みは fill-if-empty（`.is('derived_words', null)`）: 既存値は上書きしない
 * - 「派生語なし」の単語は {version:1, items:[], none:true} を保存して再生成を防ぐ
 * - lexicon_entries は (normalized_headword, pos) でユニークなため、同一 headword の
 *   複数 pos 行に同じ値が非正規化して入る。読み取りは非 null の任意の行を採用する。
 * - headword に対応する lexicon 行が存在しない場合は保存されない（次回再生成）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeWordDerivedWords } from '@/lib/schemas/derived-words';
import type { WordDerivedWords } from '../../../shared/types';

const LOOKUP_CHUNK_SIZE = 200;

interface LexiconDerivedWordsRow {
  normalized_headword: string;
  derived_words: unknown;
}

/**
 * normalized_headword → WordDerivedWords のマップを返す（derived_words 非 null の行のみ）。
 */
export async function getCachedDerivedWordsByHeadword(
  normalizedHeadwords: string[],
  deps: { supabaseAdmin?: SupabaseClient } = {},
): Promise<Map<string, WordDerivedWords>> {
  const cached = new Map<string, WordDerivedWords>();
  const unique = Array.from(new Set(normalizedHeadwords.filter((headword) => headword.length > 0)));
  if (unique.length === 0) return cached;

  const supabaseAdmin = deps.supabaseAdmin ?? getSupabaseAdmin();

  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += LOOKUP_CHUNK_SIZE) {
    chunks.push(unique.slice(index, index + LOOKUP_CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabaseAdmin
        .from('lexicon_entries')
        .select('normalized_headword, derived_words')
        .in('normalized_headword', chunk)
        .not('derived_words', 'is', null),
    ),
  );

  for (const { data, error } of results) {
    if (error) {
      throw new Error(`Failed to look up lexicon derived words: ${error.message}`);
    }

    for (const row of (data ?? []) as LexiconDerivedWordsRow[]) {
      if (cached.has(row.normalized_headword)) continue;
      const derivedWords = normalizeWordDerivedWords(row.derived_words);
      if (derivedWords) {
        cached.set(row.normalized_headword, derivedWords);
      }
    }
  }

  return cached;
}

/**
 * 生成した派生語を lexicon_entries に保存する（既存値がある行は触らない）。
 */
export async function saveDerivedWordsToLexicon(
  entries: Array<{ normalizedHeadword: string; derivedWords: WordDerivedWords }>,
  deps: { supabaseAdmin?: SupabaseClient } = {},
): Promise<{ updated: number; errors: number }> {
  if (entries.length === 0) return { updated: 0, errors: 0 };

  const supabaseAdmin = deps.supabaseAdmin ?? getSupabaseAdmin();
  let updated = 0;
  let errors = 0;

  for (const entry of entries) {
    try {
      const { error } = await supabaseAdmin
        .from('lexicon_entries')
        .update({ derived_words: entry.derivedWords })
        .eq('normalized_headword', entry.normalizedHeadword)
        .is('derived_words', null);

      if (error) {
        console.error(`[saveDerivedWordsToLexicon] Failed for ${entry.normalizedHeadword}:`, error);
        errors++;
      } else {
        updated++;
      }
    } catch (e) {
      console.error(`[saveDerivedWordsToLexicon] Exception for ${entry.normalizedHeadword}:`, e);
      errors++;
    }
  }

  return { updated, errors };
}
