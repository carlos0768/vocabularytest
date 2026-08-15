/**
 * 「選択肢1」「選択肢2」… という中身の無い誤答選択肢の判定。
 *
 * クイズ生成は、誤答を作る材料（同じ単語帳の他の訳・汎用の訳）が尽きたときの
 * 最後の逃げ道として `選択肢N` を詰める（`src/lib/quiz/quiz-state.ts`）。これが
 * そのまま単語行の `distractors` に保存されて残っている単語があり、選択肢に
 * 混ざると「1つだけ日本語訳、残りは選択肢1/2/3」となって答えが一目で割れる。
 *
 * 出題側はこの関数で弾いてから、実在する訳で埋め直すこと。
 */

const PLACEHOLDER_DISTRACTOR_PATTERN = /^選択肢\s*\d+$/;

export function isPlaceholderDistractor(value: string | null | undefined): boolean {
  return PLACEHOLDER_DISTRACTOR_PATTERN.test((value ?? '').trim());
}

/** プレースホルダを除いた誤答選択肢だけを返す。 */
export function withoutPlaceholderDistractors(
  distractors: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  return (distractors ?? [])
    .map((item) => (item ?? '').trim())
    .filter((item) => item.length > 0 && !isPlaceholderDistractor(item));
}
