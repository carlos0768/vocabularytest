import { isActiveQuizWord } from '@/lib/quiz/active-answer';
import type { QuizAnswerFormat } from '@/lib/quiz/quiz-mode-preference';
import type { Word } from '@/types';

type VocabularyTyped = Pick<Word, 'vocabularyType'>;

export interface AnswerFormatWordOptions<T extends VocabularyTyped = VocabularyTyped> {
  /**
   * 言い換えで出題できる語か。言い換えの材料 (同義語) はサーバーの辞書を引いて初めて
   * 分かるので、呼び出し側が「材料が届いた語」を教える。渡さなければ言い換えは 0 語。
   */
  isParaphraseEligible?: (word: T) => boolean;
}

/**
 * その解き方で出題する語か。
 *
 * 記述は Active (A) の語だけ、四択は Passive (P) の語だけを出す。書けるようにしたい語は
 * 書かせ、意味が分かればいい語は選ばせる、という語彙モードの意図をそのまま出題に
 * 効かせるため。
 *
 * 語彙モード未設定 (null) は Passive あつかいにする。スキャンの既定が Passive で
 * (`DEFAULT_SCANNED_VOCABULARY_TYPE`)、公式単語帳や共有単語帳の取り込みは
 * 未設定のまま入るので、未設定をどちらにも入れないと大半の単語帳が
 * どちらの解き方でも空になる。
 *
 * 言い換え (英語 → 英語の同義語) は語彙モードと無関係で、A でも P でも出す。
 * 分かれ目は「同義語の材料があるか」だけ。
 */
export function matchesAnswerFormat<T extends VocabularyTyped>(
  word: T,
  format: QuizAnswerFormat,
  options: AnswerFormatWordOptions<T> = {},
): boolean {
  if (format === 'paraphrase') {
    return options.isParaphraseEligible?.(word) ?? false;
  }
  return isActiveQuizWord(word) === (format === 'typing');
}

/** その解き方で出題できる語だけを残す。並びは変えない。 */
export function filterWordsForAnswerFormat<T extends VocabularyTyped>(
  words: readonly T[],
  format: QuizAnswerFormat,
  options: AnswerFormatWordOptions<T> = {},
): T[] {
  return words.filter((word) => matchesAnswerFormat(word, format, options));
}

/**
 * 解き方ごとの出題できる語数。
 * 選択画面に出して、選んでから「1問も無い」と気づく空振りを防ぐ。
 * 四択と記述を足すと必ず全語になる。言い換えは別の軸 (材料の有無) なので重なる。
 */
export function countWordsByAnswerFormat<T extends VocabularyTyped>(
  words: readonly T[],
  options: AnswerFormatWordOptions<T> = {},
): Record<QuizAnswerFormat, number> {
  let typing = 0;
  let paraphrase = 0;
  for (const word of words) {
    if (isActiveQuizWord(word)) typing += 1;
    if (options.isParaphraseEligible?.(word)) paraphrase += 1;
  }
  return { typing, normal: words.length - typing, paraphrase };
}
