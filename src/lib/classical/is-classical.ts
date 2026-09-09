// 古典語かどうかの唯一の判定関数。
//
// 英語専用の後処理（語源解析・派生語・例文生成・発音・英作文クイズ・英語lexicon解決・
// 埋め込み）は、すべてここを通して古典語を弾く。判定を各所にベタ書きすると
// 「古典語なのに英語の語源解析が走ってコインだけ減る」が必ず起きるので、
// 増やすときもこの関数を使うこと。
//
// 判定材料は2つ:
//   - isClassical … 抽出直後のAI由来フラグ（まだ辞書解決していない段階で使う）
//   - classicalEntryId … 共通辞書に紐づいた後の永続的な印
// words テーブルに is_classical 列は作っていない。classical_entry_id の有無が
// そのまま古典語かどうかを表すので、列を2つ持って食い違う余地を作らない。

export interface ClassicalWordMarker {
  isClassical?: boolean | null;
  classicalEntryId?: string | null;
}

export function isClassicalWord(word: ClassicalWordMarker | null | undefined): boolean {
  if (!word) return false;
  if (word.isClassical === true) return true;
  return typeof word.classicalEntryId === 'string' && word.classicalEntryId.length > 0;
}

/** 英語専用の後処理にかけてよい語だけを残す。 */
export function excludeClassicalWords<T extends ClassicalWordMarker>(words: readonly T[]): T[] {
  return words.filter((word) => !isClassicalWord(word));
}

/** 古典語だけを取り出す（共通辞書の解決対象）。 */
export function selectClassicalWords<T extends ClassicalWordMarker>(words: readonly T[]): T[] {
  return words.filter((word) => isClassicalWord(word));
}
