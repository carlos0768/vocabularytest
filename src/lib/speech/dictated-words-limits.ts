/**
 * 音声で追加する単語一覧の上限。画面 (クライアント) からも参照するので、
 * AI呼び出しを含む `dictated-words.ts` とは分けて置く。
 */

/** 一度に取り込める語数。55秒の発話でもこれを超えることはまず無い。 */
export const MAX_DICTATED_WORDS = 100;

/** 手入力の英単語欄と同じ上限。 */
export const MAX_DICTATED_ENTRY_LENGTH = 50;
