/**
 * 語源解析オーケストレータ
 *
 * スキャン両経路（/api/extract と scan-jobs process）から呼ばれる入口。
 * dedupe → lexicon キャッシュ照会 → 候補マッチ → AI 生成 → 検証 →
 * lexicon 保存 → normalized headword キーの Map を返す。
 *
 * 解析対象は「1語であること」だけが条件で、接辞候補にマッチしない語も AI に
 * 送る（複合語・ラテン/ギリシャ語根の語も語源を出したいため）。接辞候補は
 * 送るかどうかの足切りではなく、AI に渡すヒント兼 affixId の許可リスト。
 * 空白を含む句動詞・イディオムだけは形態素分解の対象外として除外する。
 *
 * 全体が best-effort: 呼び出し側は try/catch で包み、失敗してもスキャンは
 * 成功させる（例文生成と同じ扱い）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeHeadword } from '../../../shared/lexicon';
import type { WordMorphology } from '../../../shared/types';
import { buildNoneMorphology, isStaleNoneMorphology } from '@/lib/schemas/morphology';
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

/** これ未満の長さの語は分解しても情報がないので AI に送らない */
const MIN_ANALYZABLE_LENGTH = 4;

/**
 * 語源解析にかける価値のある見出し語か。
 * - 空白を含むもの（句動詞・イディオム・複数語の見出し）は形態素分解の対象外
 * - アルファベット3文字以下は分解しても意味がない
 */
export function isMorphologyAnalyzable(english: string): boolean {
  const trimmed = english.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return trimmed.replace(/[^A-Za-z]/g, '').length >= MIN_ANALYZABLE_LENGTH;
}

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
  //    旧世代（解析範囲が狭かった頃）の「構造なし」はキャッシュミス扱いにして
  //    1度だけ再解析する。表示可能な語源はそのまま使う。
  const cached = await getCachedMorphologyByHeadword(
    Array.from(headwordToEnglish.keys()),
    { supabaseAdmin: deps.supabaseAdmin },
  );
  const staleNoneHeadwords = new Set<string>();
  for (const [headword, morphology] of cached) {
    if (isStaleNoneMorphology(morphology)) {
      staleNoneHeadwords.add(headword);
      continue;
    }
    resolved.set(headword, morphology);
  }

  // 2) キャッシュミスした語の候補マッチ
  const toSave: Array<{
    normalizedHeadword: string;
    morphology: WordMorphology;
    overwriteExisting?: boolean;
  }> = [];
  const seeds: Array<{ headword: string; seed: MorphologySeedWord }> = [];

  for (const [headword, english] of headwordToEnglish) {
    if (resolved.has(headword)) continue;
    if (!isMorphologyAnalyzable(english)) {
      // 句動詞・極端に短い語は AI を呼ばず「構造なし」として保存・返却
      const none = buildNoneMorphology();
      resolved.set(headword, none);
      toSave.push({
        normalizedHeadword: headword,
        morphology: none,
        overwriteExisting: staleNoneHeadwords.has(headword),
      });
      continue;
    }
    // 候補ゼロでも AI には送る（複合語・語根のみの語を拾うため）。
    // 候補リストは affixId の許可リストとして働く。
    seeds.push({ headword, seed: { english, candidates: findAffixCandidates(english) } });
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
      toSave.push({
        normalizedHeadword: headword,
        morphology: value,
        overwriteExisting: staleNoneHeadwords.has(headword),
      });
    }
  }

  // 4) 共有キャッシュへ保存（fill-if-empty）
  if (toSave.length > 0) {
    await saveMorphologyToLexicon(toSave, { supabaseAdmin: deps.supabaseAdmin });
  }

  return resolved;
}
