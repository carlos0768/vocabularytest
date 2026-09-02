/**
 * 習得度 (WordStatus) をタップで進めるときの順番。
 *
 * 一覧のマス目は「未学習 → 学習中 → 定着中 → 習得済み → 未学習」と一巡する。
 * 以前は 3マス目まで塗ったら逆走して戻す方式だったが、逆走の向きを
 * 覚えている state と `status` からの再同期がぶつかり、習得済みまで上げると
 * 定着中と習得済みの間を往復するだけで未学習に戻せなくなっていた。
 * 一方向に回すだけなら覚えておく状態が無く、どこから押しても同じ順で進む。
 */

import type { WordStatus } from '@/types';

/** タップで進む順番。配列の添字がそのまま「塗るマスの数」になる。 */
export const WORD_STATUS_CYCLE: readonly WordStatus[] = ['new', 'review', 'active', 'mastered'];

/** その習得度で塗るマスの数 (0〜3)。 */
export function getWordStatusStep(status: WordStatus): number {
  const index = WORD_STATUS_CYCLE.indexOf(status);
  return index >= 0 ? index : 0;
}

/** 塗るマスの数から習得度を引く。範囲外は未学習に丸める。 */
export function getWordStatusForStep(step: number): WordStatus {
  return WORD_STATUS_CYCLE[step] ?? 'new';
}

/** 次にタップしたときの習得度。習得済みの次は未学習に戻る。 */
export function getNextWordStatus(status: WordStatus): WordStatus {
  const next = (getWordStatusStep(status) + 1) % WORD_STATUS_CYCLE.length;
  return WORD_STATUS_CYCLE[next]!;
}
