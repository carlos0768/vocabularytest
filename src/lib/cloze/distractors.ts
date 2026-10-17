import {
  LEXICON_CEFR_LEVELS,
  normalizeHeadword,
  type LexiconCefrLevel,
  type LexiconPos,
} from '../../../shared/lexicon';
import type { ClozeBlank } from './blank';
import { isClozeEligibleHeadword, surfaceForForm } from './inflections';

/**
 * 誤答の候補。全ユーザー共通の lexicon_entries から取る。
 * AIを使わずに「同じ品詞・近い難しさの別の英単語」を並べるため。
 */
export type ClozeDistractorCandidate = {
  headword: string;
  pos: LexiconPos;
  cefrLevel: LexiconCefrLevel | null;
  /** 分かっていれば和訳。同じ意味の語を誤答にしない判定に使う。 */
  translationJa?: string | null;
};

export type ClozeTarget = {
  headword: string;
  pos: LexiconPos;
  cefrLevel: LexiconCefrLevel | null;
  /** その単語の訳 (単語帳に登録されている訳すべて)。 */
  translations: readonly string[];
};

export const CLOZE_DISTRACTOR_COUNT = 3;

/** 訳を比べるときの区切り。「走る、駆ける」「(時間が)経つ」を語義ごとに分ける。 */
function translationParts(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/[（(][^）)]*[）)]/g, '')
    .split(/[、,，;；・/／\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * 訳が1つでも同じなら同義語とみなす。
 * 正解と同じ意味の語が誤答に混ざると、どちらを入れても文が成り立つ
 * 「正解が2つある問題」になるので、これだけはAIに頼らず機械的に落とす。
 */
function sharesTranslation(targetParts: ReadonlySet<string>, candidate: ClozeDistractorCandidate): boolean {
  return translationParts(candidate.translationJa).some((part) => targetParts.has(part));
}

function cefrDistance(a: LexiconCefrLevel | null, b: LexiconCefrLevel | null): number {
  // 片方でも級が分からなければ、同じ級の候補よりは後ろに回す。
  if (!a || !b) return 1.5;
  return Math.abs(LEXICON_CEFR_LEVELS.indexOf(a) - LEXICON_CEFR_LEVELS.indexOf(b));
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * 候補を、空欄の形にそろえた表記にする。形によって綴りが割れる語 (空欄が過去形とも
 * 過去分詞とも読めるのに took / taken と割れる語) と、その形を作れない語は null。
 */
function surfaceMatchingBlank(candidate: ClozeDistractorCandidate, blank: ClozeBlank): string | null {
  let surface: string | null = null;
  for (const form of blank.forms) {
    const next = surfaceForForm(candidate.headword, candidate.pos, form);
    if (!next) return null;
    if (surface !== null && surface !== next) return null;
    surface = next;
  }
  return surface;
}

/**
 * 誤答を3つ選ぶ。足りなければ null (その出題文は使わない)。
 *
 * 条件:
 * - 正解と同じ品詞で、空欄と同じ形 (過去形なら過去形) に活用できる
 * - 正解の語そのもの、文中にすでにある語、正解と訳が重なる語は除く
 * - 正解の CEFR 級に近い順。同じ近さの中ではランダム
 */
export function pickClozeDistractors({
  target,
  blank,
  candidates,
  count = CLOZE_DISTRACTOR_COUNT,
  random = Math.random,
}: {
  target: ClozeTarget;
  blank: ClozeBlank;
  candidates: readonly ClozeDistractorCandidate[];
  count?: number;
  random?: () => number;
}): string[] | null {
  const targetHeadword = normalizeHeadword(target.headword);
  const targetParts = new Set(target.translations.flatMap((translation) => translationParts(translation)));
  const answerLower = blank.answer.toLowerCase();

  const tiers = new Map<number, string[]>();
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.pos !== target.pos) continue;
    const headword = normalizeHeadword(candidate.headword);
    if (headword === targetHeadword || !isClozeEligibleHeadword(headword)) continue;
    if (sharesTranslation(targetParts, candidate)) continue;

    const surface = surfaceMatchingBlank({ ...candidate, headword }, blank);
    if (!surface || surface === answerLower || blank.sentenceTokens.has(surface)) continue;
    if (seen.has(surface)) continue;
    seen.add(surface);

    const distance = cefrDistance(target.cefrLevel, candidate.cefrLevel);
    const tier = tiers.get(distance);
    if (tier) tier.push(surface);
    else tiers.set(distance, [surface]);
  }

  const ordered = Array.from(tiers.keys())
    .sort((a, b) => a - b)
    .flatMap((distance) => shuffle(tiers.get(distance) ?? [], random));

  if (ordered.length < count) return null;
  const picked = ordered.slice(0, count);
  return blank.capitalized ? picked.map(capitalize) : picked;
}
