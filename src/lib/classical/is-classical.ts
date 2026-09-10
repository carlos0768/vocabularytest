// 古典語かどうかの判定。
//
// **2つに分かれている。混ぜてはいけない。**
//
//   isClassicalWord()            … その語が古典語「である」か（同一性の判定）
//   shouldSkipEnglishEnrichment() … 英語専用の後処理から外すべきか（保護の判定）
//
// 分けている理由: 見出し語が日本語かどうかを見る script フォールバックは、
// 保護には使えるが同一性には使えない。「日本語で書かれている」は「古典語である」を
// 意味しないからで、現代日本語（「勉強」「コンピュータ」）にも当たってしまう。
//
// 同一性の判定にフォールバックを混ぜると、単語帳の種別フィルタ
// （filterWordsForProjectKind）が日本語見出しの語を軒並み「古典語」と見なして
// 英語単語帳から捨てる。実際にこれで、古文単語帳をスキャンして作った新規単語帳が
// 1語も保存されないまま「N語追加しました」と通知する障害が起きた。
//
// 同一性の材料は印だけ:
//   - isClassical … 抽出直後のAI由来フラグ（まだ辞書解決していない段階で使う）
//   - classicalEntryId … 共通辞書に紐づいた後の永続的な印
// words テーブルに is_classical 列は作っていない。classical_entry_id の有無が
// そのまま古典語かどうかを表すので、列を2つ持って食い違う余地を作らない。

import { looksLikeClassicalJapanese } from './normalize';

export interface ClassicalWordMarker {
  isClassical?: boolean | null;
  classicalEntryId?: string | null;
  /** PostgREST から読み戻した行はスネークケースで来る。 */
  classical_entry_id?: string | null;
  /** 英語処理を回してよいかの判断に使う（同一性の判定には使わない）。 */
  english?: string | null;
}

/**
 * その語が古典語であるか。**印だけで判定する。**
 *
 * 単語帳の種別フィルタ・共通辞書の解決対象・古文例文の生成対象など、
 * 「古典語として扱う」側の判断はすべてこれを使う。見出し語の文字種から
 * 昇格させてはいけない（`looksLikeClassicalJapanese` の docstring 参照）。
 */
export function isClassicalWord(word: ClassicalWordMarker | null | undefined): boolean {
  if (!word) return false;
  if (word.isClassical === true) return true;
  if (typeof word.classicalEntryId === 'string' && word.classicalEntryId.length > 0) return true;
  if (typeof word.classical_entry_id === 'string' && word.classical_entry_id.length > 0) return true;
  return false;
}

/**
 * 英語専用の後処理（語源解析・例文生成・発音・英作文クイズ・英語lexicon解決・
 * 埋め込み）から外すべきか。
 *
 * 古典語であることが確実な語に加えて、**見出し語が日本語で書かれている語**も外す。
 * 英語処理はどのみち無意味で、コインとAIコールを捨てるだけなので、印が落ちている
 * 経路のための保険としてここでは文字種も見る。
 *
 * こちらは「やらない」方向の判断なので、多めに拾って害がない。逆に
 * `isClassicalWord()` は「そう扱う」方向なので、印が無いものを拾ってはいけない。
 */
export function shouldSkipEnglishEnrichment(
  word: ClassicalWordMarker | null | undefined,
): boolean {
  if (!word) return false;
  if (isClassicalWord(word)) return true;
  return looksLikeClassicalJapanese(word.english);
}

/** 英語専用の後処理にかけてよい語だけを残す。 */
export function excludeClassicalWords<T extends ClassicalWordMarker>(words: readonly T[]): T[] {
  return words.filter((word) => !shouldSkipEnglishEnrichment(word));
}

/** 古典語だけを取り出す（共通辞書の解決対象）。 */
export function selectClassicalWords<T extends ClassicalWordMarker>(words: readonly T[]): T[] {
  return words.filter((word) => isClassicalWord(word));
}
