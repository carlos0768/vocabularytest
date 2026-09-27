import type { LexiconPos } from '../../../shared/lexicon';
import { buildClozeBlank } from './blank';
import { pickClozeDistractors, shuffle, type ClozeDistractorCandidate, type ClozeTarget } from './distractors';

/** 出題文マスター (cloze_sentences) の1行のうち、出題に使う部分。 */
export type ClozeSentenceRow = {
  id: number;
  sentence_en: string;
  sentence_ja: string;
  ja_sentence_id: number;
  author_en: string | null;
  author_ja: string | null;
  license_en: string;
  license_ja: string;
};

/**
 * 出典表示。Tatoeba の CC BY 2.0 FR は作者名の表示が利用条件なので、
 * 出題画面には英文・和訳それぞれの作者とライセンスを必ず出す。
 */
export type ClozeAttribution = {
  enSentenceId: number;
  jaSentenceId: number;
  enAuthor: string | null;
  jaAuthor: string | null;
  enLicense: string;
  jaLicense: string;
};

export type ClozeQuestion = {
  wordId: string;
  before: string;
  after: string;
  /** 正解を含む4つの選択肢 (並びはシャッフル済み)。 */
  options: string[];
  correctIndex: number;
  sentenceJa: string;
  attribution: ClozeAttribution;
};

/**
 * 1語ぶんの空所補充問題を組み立てる。
 * 出題文をランダムな順に試し、空欄が作れて誤答も3つそろった最初の文を使う。
 * どの文でも組めなければ null (その語は出題しない)。
 */
export function buildClozeQuestion({
  wordId,
  target,
  sentences,
  candidates,
  random = Math.random,
}: {
  wordId: string;
  target: ClozeTarget & { pos: LexiconPos };
  sentences: readonly ClozeSentenceRow[];
  candidates: readonly ClozeDistractorCandidate[];
  random?: () => number;
}): ClozeQuestion | null {
  for (const sentence of shuffle([...sentences], random)) {
    const blank = buildClozeBlank(sentence.sentence_en, target.headword, target.pos);
    if (!blank) continue;

    const distractors = pickClozeDistractors({ target, blank, candidates, random });
    if (!distractors) continue;

    const options = shuffle([blank.answer, ...distractors], random);
    return {
      wordId,
      before: blank.before,
      after: blank.after,
      options,
      correctIndex: options.indexOf(blank.answer),
      sentenceJa: sentence.sentence_ja,
      attribution: {
        enSentenceId: sentence.id,
        jaSentenceId: sentence.ja_sentence_id,
        enAuthor: sentence.author_en,
        jaAuthor: sentence.author_ja,
        enLicense: sentence.license_en,
        jaLicense: sentence.license_ja,
      },
    };
  }
  return null;
}
