/**
 * 言い換え (paraphrase) 機能のオン・オフ。
 *
 * 2026-10-07 に一時停止。辞書の品質 (別の語義の同義語が出る) を見直すまで、
 * 解き方の選択画面・右上の切り替え・単語詳細の「言い換え」札をすべて隠す。
 * 辞書 (`dataset.json`) と `/api/paraphrase/lookup` はそのまま残しているので、
 * 戻すときはこの定数を true にするだけでよい。
 *
 * 止めている間:
 * - `isQuizAnswerFormat('paraphrase')` が false になるので、localStorage に残った
 *   「今日の解き方 = 言い換え」や `?format=paraphrase`、中断復帰の保存は四択に倒れる
 * - 選択画面 (`QuizModeChooser`) から札が消え、クイズ画面は材料を取りに行かない
 * - 単語詳細 (`useParaphraseSynonyms`) は辞書を引かず、札を出さない
 */
export const PARAPHRASE_FEATURE_ENABLED = false;
