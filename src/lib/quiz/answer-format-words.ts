import { isActiveQuizWord } from '@/lib/quiz/active-answer';
import type { QuizAnswerFormat } from '@/lib/quiz/quiz-mode-preference';
import type { Word } from '@/types';

type VocabularyTyped = Pick<Word, 'vocabularyType'>;

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
 */
export function matchesAnswerFormat(word: VocabularyTyped, format: QuizAnswerFormat): boolean {
  return isActiveQuizWord(word) === (format === 'typing');
}

/** その解き方で出題できる語だけを残す。並びは変えない。 */
export function filterWordsForAnswerFormat<T extends VocabularyTyped>(
  words: readonly T[],
  format: QuizAnswerFormat,
): T[] {
  return words.filter((word) => matchesAnswerFormat(word, format));
}

/**
 * 解き方ごとの出題できる語数。
 * 選択画面に出して、選んでから「1問も無い」と気づく空振りを防ぐ。
 */
export function countWordsByAnswerFormat(
  words: readonly VocabularyTyped[],
): Record<QuizAnswerFormat, number> {
  let typing = 0;
  for (const word of words) {
    if (isActiveQuizWord(word)) typing += 1;
  }
  return { typing, normal: words.length - typing };
}
