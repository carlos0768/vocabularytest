/**
 * 音読チャレンジを「ひと組ずつ」に切り分ける。
 *
 * 1回のセッションで解くのは単語帳の全部ではなく、優先度順に並べた先頭から
 * 10問ぶん (?count= で変わる)。終わったら次の10問へ進めるように、
 * どこまで解いたかを始点で持ち、そこから窓を切り出す。
 *
 * 並べ替えは呼ぶ側が一度だけ済ませておく —— ひと組ごとに並べ直すと、
 * 「次の10問」が前に解いた単語を連れてきて、単語帳を一周できなくなる。
 */

export interface VoiceQuizBatch<T> {
  /** いま解くひと組。単語帳の残りが少なければ size より短くなる。 */
  words: T[];
  /** 次のひと組の始点。 */
  nextStart: number;
  /**
   * 次のひと組の問題数。0 は単語帳を一周し終えたということで、
   * 画面はここで「次の◯問」ではなく「もう一度」を出す。
   */
  nextSize: number;
}

/**
 * @param pool  優先度順に並べた出題候補 (単語帳ぶん)
 * @param start いま解いているひと組の始点
 * @param size  ひと組の問題数
 */
export function voiceQuizBatch<T>(
  pool: readonly T[],
  start: number,
  size: number,
): VoiceQuizBatch<T> {
  // 壊れた入力で単語帳を丸ごと出したり、無限に「次の◯問」を出したりしない。
  const safeSize = Number.isFinite(size) ? Math.max(0, Math.floor(size)) : 0;
  const safeStart = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0;

  const words = pool.slice(safeStart, safeStart + safeSize);
  // 空振りの窓 (始点が末尾を越えた) から進ませない。進めても取れる単語が無い。
  const nextStart = words.length > 0 ? safeStart + words.length : safeStart;
  const nextSize = Math.min(safeSize, Math.max(0, pool.length - nextStart));

  return { words, nextStart, nextSize };
}
