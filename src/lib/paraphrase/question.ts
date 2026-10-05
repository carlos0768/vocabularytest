import type { MultipleChoiceQuizQuestion, QuizQuestion, Word } from '@/types';
import { shuffleArray } from '@/lib/utils';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import { normalizeParaphraseHeadword } from './headword';
import type { ParaphraseMaterial } from './dataset';

/**
 * 言い換えクイズ (英語 → 英語の同義語を 4 択で選ぶ) の問題を、サーバーから受け取った
 * 材料 (`ParaphraseMaterial`) から組む。
 *
 * 四択 (`normal`) と同じ `MultipleChoiceQuizQuestion` の形にして `type: 'paraphrase'` を
 * 付けるだけなので、回答・採点・SM-2 の更新・途中保存は既存の経路をそのまま通る。
 */

export const PARAPHRASE_QUESTION_TYPE = 'paraphrase';

/** 正解候補 (良い順) を何番目まで出すか、とその重み。毎回同じ正解にならないよう少し散らす。 */
const ANSWER_PICK_WEIGHTS = [0.5, 0.3, 0.2] as const;
const DISTRACTOR_COUNT = 3;

export function isParaphraseQuestion(
  question: QuizQuestion | undefined,
): question is MultipleChoiceQuizQuestion & { type: 'paraphrase' } {
  return question?.type === PARAPHRASE_QUESTION_TYPE;
}

function pickAnswer(answers: readonly string[], random: () => number): string {
  const limit = Math.min(answers.length, ANSWER_PICK_WEIGHTS.length);
  const total = ANSWER_PICK_WEIGHTS.slice(0, limit).reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let index = 0; index < limit; index += 1) {
    roll -= ANSWER_PICK_WEIGHTS[index];
    if (roll < 0) return answers[index];
  }
  return answers[0];
}

/**
 * 1 語ぶんの問題。材料が足りなければ null (正解が見出し語そのもの・誤答が 3 つ未満)。
 */
export function buildParaphraseQuestion(
  word: Word,
  material: ParaphraseMaterial,
  options: { random?: () => number; shuffle?: <T>(items: T[]) => T[] } = {},
): MultipleChoiceQuizQuestion | null {
  const random = options.random ?? Math.random;
  const shuffle = options.shuffle ?? shuffleArray;
  const headword = normalizeParaphraseHeadword(word.english);
  const answers = material.answers.filter((answer) => answer.toLowerCase() !== headword);
  if (answers.length === 0) return null;
  const answer = pickAnswer(answers, random);
  const lowerAnswers = new Set(material.answers.map((item) => item.toLowerCase()));
  const distractors = shuffle(
    material.distractors.filter((candidate) => {
      const lower = candidate.toLowerCase();
      return lower !== headword && !lowerAnswers.has(lower);
    }),
  ).slice(0, DISTRACTOR_COUNT);
  if (distractors.length < DISTRACTOR_COUNT) return null;
  const options4 = shuffle([answer, ...distractors]);
  return {
    type: PARAPHRASE_QUESTION_TYPE,
    word,
    options: options4,
    correctIndex: options4.indexOf(answer),
  };
}

/**
 * 単語帳の語から言い換えの問題を `count` 問まで組む。
 * 材料のある語だけが対象。同じ見出し語が複数行あっても 1 問にする (多義語の行ごとの
 * 出題は訳の違いを問うものなので、英語 → 英語の言い換えでは同じ問題になってしまう)。
 */
export function generateParaphraseQuestions(
  words: readonly Word[],
  materials: ReadonlyMap<string, ParaphraseMaterial>,
  count: number,
  settings: {
    preserveOrder?: boolean;
    random?: () => number;
    shuffle?: <T>(items: T[]) => T[];
  } = {},
): QuizQuestion[] {
  const ordered = settings.preserveOrder ? [...words] : sortWordsByPriority([...words]);
  const questions: QuizQuestion[] = [];
  const seenHeadwords = new Set<string>();
  for (const word of ordered) {
    if (questions.length >= count) break;
    const material = materials.get(word.id);
    if (!material) continue;
    const key = normalizeParaphraseHeadword(word.english);
    if (!key || seenHeadwords.has(key)) continue;
    const question = buildParaphraseQuestion(word, material, settings);
    if (!question) continue;
    seenHeadwords.add(key);
    questions.push(question);
  }
  return questions;
}
