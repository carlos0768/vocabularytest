// 古典語と英単語を混ぜないための純度ルール。
//
// 扱う問題は3つ:
//   1. 1枚の画像に英語と古典語の単語帳が両方写っていたら、英語を優先して古典語を捨てる
//   2. 単語帳には種別（英語／古典）があり、種別に合わない語は保存しない
//   3. 古典語に英語の例文が付いていたら落とす
//
// 3 が要るのは、古典語でも lexicon（英語マスター）由来の例文が prefill され得るから。
// 抽出時のガードをすり抜けた英語例文が古典語に残ると、学習画面に英文が出てしまう。
// 表示側で隠すのではなく保存前に落とす。表示で隠すと、原因が見えないまま
// DBに英語例文が溜まり続ける。

import type { ProjectKind } from '../../../shared/types';
import { isClassicalWord, shouldSkipEnglishEnrichment, type ClassicalWordMarker } from './is-classical';

// 種別そのものは shared/types にある（shared/db/mappers.ts からも使うため）。
export { PROJECT_KINDS, normalizeProjectKind, type ProjectKind } from '../../../shared/types';

export interface ExampleBearingWord {
  exampleSentence?: string | null;
  exampleSentenceJa?: string | null;
}

/**
 * 1枚の画像から英語と古典語の両方が採れた場合、英語を優先して古典語を捨てる。
 *
 * プロンプト側でも同じ優先順位を指示しているが、AI出力は信用できないので
 * サーバー側でも同じ規則を当てる。逆向き（古典語しか無いのに英語を捨てる）は
 * しない。英語が1語も無ければ古典語はそのまま通る。
 */
export function preferEnglishOverClassical<T extends ClassicalWordMarker>(
  words: readonly T[],
): { words: T[]; droppedClassicalCount: number } {
  const englishWords = words.filter((word) => !isClassicalWord(word));
  const classicalCount = words.length - englishWords.length;

  // 片方しか無ければ何もしない
  if (englishWords.length === 0 || classicalCount === 0) {
    return { words: [...words], droppedClassicalCount: 0 };
  }

  return { words: englishWords, droppedClassicalCount: classicalCount };
}

/**
 * 保存先の単語帳の種別に合わない語を落とす。
 *
 * エラーにはしない。スキャンは成功させ、落ちた件数だけ呼び出し側が画面に出す。
 * 正しく採れた語まで巻き添えで捨てるほうが損なので。
 */
export function filterWordsForProjectKind<T extends ClassicalWordMarker>(
  words: readonly T[],
  kind: ProjectKind,
): { words: T[]; droppedCount: number } {
  const wantClassical = kind === 'classical';
  const kept = words.filter((word) => isClassicalWord(word) === wantClassical);
  return { words: kept, droppedCount: words.length - kept.length };
}

/** 単語帳に既に入っている語から種別を推定する。空の単語帳は英語扱い。 */
export function inferProjectKindFromWords(words: readonly ClassicalWordMarker[]): ProjectKind {
  return words.some((word) => isClassicalWord(word)) ? 'classical' : 'english';
}

/**
 * 古典語に混入した英語の例文を落とす。
 *
 * 古文の例文にラテン文字は出てこないので、`exampleSentence` にラテン文字が
 * 含まれていれば英語例文の混入と判断する。現代語訳（exampleSentenceJa）だけを
 * 残しても意味を成さないので、対にして落とす。英単語には一切触らない。
 */
export function stripEnglishExampleFromClassicalWord<T extends ClassicalWordMarker & ExampleBearingWord>(
  word: T,
): T {
  if (!shouldSkipEnglishEnrichment(word)) return word;

  const example = word.exampleSentence ?? '';
  if (!example.trim() || !/[A-Za-z]/.test(example)) return word;

  return { ...word, exampleSentence: undefined, exampleSentenceJa: undefined };
}

/** 配列版。落とした件数も返す（ログ用）。 */
export function stripEnglishExamplesFromClassicalWords<
  T extends ClassicalWordMarker & ExampleBearingWord,
>(words: readonly T[]): { words: T[]; strippedCount: number } {
  let strippedCount = 0;
  const next = words.map((word) => {
    const sanitized = stripEnglishExampleFromClassicalWord(word);
    if (sanitized !== word) strippedCount += 1;
    return sanitized;
  });
  return { words: next, strippedCount };
}
