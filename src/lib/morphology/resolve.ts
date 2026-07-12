/**
 * 語源解析オーケストレータ
 *
 * スキャン両経路（/api/extract と scan-jobs process）から呼ばれる入口。
 * dedupe → lexicon キャッシュ照会 → 候補マッチ → AI 生成 → 検証 →
 * lexicon 保存 → normalized headword キーの Map を返す。
 *
 * 全体が best-effort: 呼び出し側は try/catch で包み、失敗してもスキャンは
 * 成功させる（例文生成と同じ扱い）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeHeadword } from '../../../shared/lexicon';
import type { WordMorphology } from '../../../shared/types';
import { buildNoneMorphology } from '@/lib/schemas/morphology';
import { findAffixCandidates } from './candidates';
import {
  generateMorphology,
  type GenerateMorphologyResult,
  type MorphologySeedWord,
} from './generate';
import { getCachedMorphologyByHeadword, saveMorphologyToLexicon } from './lexicon';

type GenerateMorphologyDependency = (
  words: MorphologySeedWord[],
  apiKeys: { gemini?: string; openai?: string },
) => Promise<GenerateMorphologyResult>;

export interface ResolveMorphologyDeps {
  supabaseAdmin?: SupabaseClient;
  generateMorphology?: GenerateMorphologyDependency;
}

/**
 * 単語リストの語源情報を解決して `normalizeHeadword(english)` キーの Map で返す。
 * `none: true`（構造なし）のエントリも Map に含まれる — 表示側は
 * `hasDisplayableMorphology()` で弾くこと。
 */
export async function resolveMorphologyForWords(
  words: Array<{ english: string }>,
  apiKeys: { gemini?: string; openai?: string },
  deps: ResolveMorphologyDeps = {},
): Promise<Map<string, WordMorphology>> {
  const resolved = new Map<string, WordMorphology>();

  const headwordToEnglish = new Map<string, string>();
  for (const word of words) {
    const headword = normalizeHeadword(word.english);
    if (headword && !headwordToEnglish.has(headword)) {
      headwordToEnglish.set(headword, word.english);
    }
  }
  if (headwordToEnglish.size === 0) return resolved;

  // 1) 共有キャッシュ照会
  const cached = await getCachedMorphologyByHeadword(
    Array.from(headwordToEnglish.keys()),
    { supabaseAdmin: deps.supabaseAdmin },
  );
  for (const [headword, morphology] of cached) {
    resolved.set(headword, morphology);
  }

  // 2) キャッシュミスした語の候補マッチ
  const toSave: Array<{ normalizedHeadword: string; morphology: WordMorphology }> = [];
  const seeds: Array<{ headword: string; seed: MorphologySeedWord }> = [];

  for (const [headword, english] of headwordToEnglish) {
    if (resolved.has(headword)) continue;
    const candidates = findAffixCandidates(english);
    if (candidates.length === 0) {
      // 候補ゼロは AI を呼ばず「構造なし」として保存・返却
      const none = buildNoneMorphology();
      resolved.set(headword, none);
      toSave.push({ normalizedHeadword: headword, morphology: none });
      continue;
    }
    seeds.push({ headword, seed: { english, candidates } });
  }

  // 3) AI 生成
  if (seeds.length > 0) {
    const generate = deps.generateMorphology ?? generateMorphology;
    const { results } = await generate(seeds.map((entry) => entry.seed), apiKeys);
    const byEnglish = new Map(results.map((result) => [result.english, result.morphology]));

    for (const { headword, seed } of seeds) {
      if (!byEnglish.has(seed.english)) continue; // 生成失敗はキャッシュせず次回に委ねる
      const morphology = byEnglish.get(seed.english) ?? null;
      const value = morphology ?? buildNoneMorphology();
      resolved.set(headword, value);
      toSave.push({ normalizedHeadword: headword, morphology: value });
    }
  }

  // 4) 共有キャッシュへ保存（fill-if-empty）
  if (toSave.length > 0) {
    await saveMorphologyToLexicon(toSave, { supabaseAdmin: deps.supabaseAdmin });
  }

  return resolved;
}
