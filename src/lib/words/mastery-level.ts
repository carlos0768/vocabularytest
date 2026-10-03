/**
 * 習得レベル (習得の先を無限に進める段数)。
 *
 * 単語帳の全部の語が「習得」になると、クイズは同じ語を同じ形式で出し続けるだけに
 * なって張り合いが無い。そこで習得 (`status === 'mastered'`) を終点にせず、
 * 習得した語がクイズで正解するたびに 1 ずつ上がるレベルを持たせる。
 *
 *   未学習 → 学習中 → 定着中 → 習得 (Lv.0) → Lv.1 → Lv.2 → … (上限なし)
 *
 * レベルの値は `Word.masteryLevel` に持つが、意味があるのは習得のときだけ。
 * 習得でない語のレベルは常に 0 として読む (`getMasteryLevel`)。
 *
 * **語彙モードの循環**: Lv.1 からは、レベルが上がるたびに語彙モードを
 * Passive (P) → Active (A) → Passive → … と交互に切り替える
 * (`MASTERY_LEVEL_VOCABULARY_CYCLE`)。四択は Passive の語だけ・記述は Active の語だけを
 * 出す (`src/lib/quiz/answer-format-words.ts`) ので、同じ語が「選ぶ」と「書く」を
 * 行き来し、覚えた語でも出題のされ方が変わる。習得したて (Lv.0) ではまだ
 * 切り替えない (ユーザが選んだモードのまま)。
 *
 * **マスの色**: 一覧の3マスは習得なら全部塗るが、レベルごとに色を変えて
 * 「どこまで進んだか」が一目で分かるようにする (`getMasteryLevelFill`)。
 * レベルに上限が無いので色は `MASTERY_LEVEL_FILLS` を一巡して繰り返す。
 */

import type { VocabularyType, WordStatus } from '@/types';

/** `masteryLevel` を読むのに必要な最小限の形。 */
export interface MasteryLevelFields {
  status: WordStatus;
  masteryLevel?: number | null;
}

/**
 * Lv.1 以降で語彙モードを回す順。Lv.1 = Passive, Lv.2 = Active, Lv.3 = Passive, …
 * 「習得の後は passive, active の順に循環」。
 */
export const MASTERY_LEVEL_VOCABULARY_CYCLE: readonly VocabularyType[] = ['passive', 'active'];

/**
 * レベルごとのマスの色。添字 0 (= 習得したて) は従来の黄緑のまま。
 *
 * 青 (#2563eb = 定着中) とオレンジ (--color-warning = 学習中) は他の段階の色なので
 * 使わない。緑系のアクセント色 (リンク・Pro 表示) とも離した色を選んでいる。
 */
export const MASTERY_LEVEL_FILLS: readonly string[] = [
  '#84cc16', // Lv.0 黄緑 (従来の習得色)
  '#14b8a6', // Lv.1 ティール
  '#8b5cf6', // Lv.2 すみれ
  '#ec4899', // Lv.3 ピンク
  '#06b6d4', // Lv.4 シアン
  '#f43f5e', // Lv.5 ローズ
  '#eab308', // Lv.6 黄
  '#10b981', // Lv.7 エメラルド
];

/** 不正値を 0 以上の整数に丸める。 */
export function normalizeMasteryLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * その語の習得レベル。習得でなければ必ず 0。
 *
 * 一覧でタップして未学習へ戻した語などは `masteryLevel` が残ったままのことが
 * あるので、生の値ではなく必ずここを通して読む。
 */
export function getMasteryLevel(word: MasteryLevelFields): number {
  if (word.status !== 'mastered') return 0;
  return normalizeMasteryLevel(word.masteryLevel);
}

/** 表示用ラベル。Lv.0 は従来どおり「習得」、以降は「Lv.1」「Lv.2」…。 */
export function getMasteryLevelLabel(level: number): string {
  const normalized = normalizeMasteryLevel(level);
  return normalized === 0 ? '習得' : `Lv.${normalized}`;
}

/** そのレベルで塗るマスの色。レベルに上限が無いので色は一巡して繰り返す。 */
export function getMasteryLevelFill(level: number): string {
  const normalized = normalizeMasteryLevel(level);
  return MASTERY_LEVEL_FILLS[normalized % MASTERY_LEVEL_FILLS.length]!;
}

/**
 * そのレベルで語に付ける語彙モード。Lv.0 は null (切り替えない)。
 * Lv.1 = Passive, Lv.2 = Active, Lv.3 = Passive, … と交互。
 */
export function getVocabularyTypeForMasteryLevel(level: number): VocabularyType | null {
  const normalized = normalizeMasteryLevel(level);
  if (normalized === 0) return null;
  return MASTERY_LEVEL_VOCABULARY_CYCLE[(normalized - 1) % MASTERY_LEVEL_VOCABULARY_CYCLE.length]!;
}
