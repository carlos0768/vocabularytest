// 公開ソースにもとづく文法問題バンクの型。
//
// 収録方針 (sources.ts の台帳と対で読むこと):
//   - 出題項目の並びは public domain / CC BY の公開教材と公的資料を参照する
//   - 設問文・選択肢・日本語解説は、元教材の表現をなぞらずMERKENで新規に作成する
//     (文法規則そのものは著作物ではないが、例文・選択肢・設問文は保護され得るため)
//   - 画像・図版・埋め込みメディアは扱わない (元のオープンライセンスの対象外のことがある)
//   - 各問は必ず sourceId を持ち、帰属表示できる状態にする

/** 空欄マーカー。既存の語法問題集と同じ */
export const PUBLIC_BLANK_MARKER = '___';

export type PublicGrammarQuestion = {
  /** 安定ID。進捗の保存キーになるので変更しない */
  id: string;
  /** 所属する小単元のID (taxonomy.ts) */
  nodeId: string;
  /** 空欄マーカー ___ を含む問題文 */
  sentence: string;
  /** 英語4択 */
  choices: [string, string, string, string];
  correctIndex: number;
  /** 日本語の解説 */
  explanation: string;
  /** 問題文の和訳 */
  sentenceJa: string;
  /** 参照した公開ソース (sources.ts) */
  sourceId: string;
};
