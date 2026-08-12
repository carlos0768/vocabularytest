/**
 * 派生語オーケストレータ
 *
 * スキャン両経路（/api/extract と scan-jobs process）と手動追加から呼ばれる入口。
 * dedupe → 足切り → lexicon キャッシュ照会 → AI 生成 → 検証 → lexicon 保存 →
 * normalized headword キーの Map を返す。
 *
 * morphology/resolve.ts との違いは「足切りが先にある」こと。派生語は
 * 出す価値のない単語（pine のように接辞に分解できず屈折しか持たない語）が
 * 多いので、AI を呼ぶ前にオフライン判定で落とす。落とした語は
 * `none: true` としてキャッシュに焼き、次回以降は判定すら省く。
 *
 * 全体が best-effort: 呼び出し側は try/catch で包み、失敗してもスキャンは
 * 成功させる（語源解析と同じ扱い）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeHeadword } from '../../../shared/lexicon';
import type { WordDerivedWords } from '../../../shared/types';
import { buildNoneDerivedWords } from '@/lib/schemas/derived-words';
import { resolveDerivedWordsEligibility } from './eligibility';
import {
  generateDerivedWords,
  type DerivedWordsSeed,
  type GenerateDerivedWordsResult,
} from './generate';
import { getCachedDerivedWordsByHeadword, saveDerivedWordsToLexicon } from './lexicon';

type GenerateDerivedWordsDependency = (
  seeds: DerivedWordsSeed[],
  apiKeys: { gemini?: string; openai?: string },
) => Promise<GenerateDerivedWordsResult>;

export interface ResolveDerivedWordsDeps {
  supabaseAdmin?: SupabaseClient;
  generateDerivedWords?: GenerateDerivedWordsDependency;
}

/**
 * 単語リストの派生語を解決して `normalizeHeadword(english)` キーの Map で返す。
 * `none: true`（派生語なし・足切り不合格）のエントリも Map に含まれる — 表示側は
 * `hasDisplayableDerivedWords()` で弾くこと。
 */
export async function resolveDerivedWordsForWords(
  words: Array<{ english: string }>,
  apiKeys: { gemini?: string; openai?: string },
  deps: ResolveDerivedWordsDeps = {},
): Promise<Map<string, WordDerivedWords>> {
  const resolved = new Map<string, WordDerivedWords>();

  const headwordToEnglish = new Map<string, string>();
  for (const word of words) {
    const headword = normalizeHeadword(word.english);
    if (headword && !headwordToEnglish.has(headword)) {
      headwordToEnglish.set(headword, word.english);
    }
  }
  if (headwordToEnglish.size === 0) return resolved;

  // 1) 共有キャッシュ照会
  const cached = await getCachedDerivedWordsByHeadword(
    Array.from(headwordToEnglish.keys()),
    { supabaseAdmin: deps.supabaseAdmin },
  );
  for (const [headword, derivedWords] of cached) {
    resolved.set(headword, derivedWords);
  }

  // 2) キャッシュミスした語の足切り
  const toSave: Array<{ normalizedHeadword: string; derivedWords: WordDerivedWords }> = [];
  const seeds: Array<{ headword: string; seed: DerivedWordsSeed }> = [];

  for (const [headword, english] of headwordToEnglish) {
    if (resolved.has(headword)) continue;
    const eligibility = resolveDerivedWordsEligibility(english);
    if (!eligibility.eligible) {
      // 足切り不合格は AI を呼ばず「派生語なし」として保存・返却
      const none = buildNoneDerivedWords();
      resolved.set(headword, none);
      toSave.push({ normalizedHeadword: headword, derivedWords: none });
      continue;
    }
    seeds.push({ headword, seed: { english, eligibility } });
  }

  // 3) AI 生成
  if (seeds.length > 0) {
    const generate = deps.generateDerivedWords ?? generateDerivedWords;
    const { results } = await generate(seeds.map((entry) => entry.seed), apiKeys);
    const byEnglish = new Map(results.map((result) => [result.english, result.derivedWords]));

    for (const { headword, seed } of seeds) {
      if (!byEnglish.has(seed.english)) continue; // 生成失敗はキャッシュせず次回に委ねる
      const derivedWords = byEnglish.get(seed.english) ?? null;
      const value = derivedWords ?? buildNoneDerivedWords();
      resolved.set(headword, value);
      toSave.push({ normalizedHeadword: headword, derivedWords: value });
    }
  }

  // 4) 共有キャッシュへ保存（fill-if-empty）
  if (toSave.length > 0) {
    await saveDerivedWordsToLexicon(toSave, { supabaseAdmin: deps.supabaseAdmin });
  }

  return resolved;
}
