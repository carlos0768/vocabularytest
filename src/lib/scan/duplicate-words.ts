/**
 * スキャン結果を単語帳へ保存するときの重複検出。
 *
 * 既存の単語帳に追加する場合、同じ見出し語がすでに入っていても
 * そのまま作られてしまうため、確認画面で「すでにある単語」を
 * ユーザーに知らせて追加するかどうかを選ばせる。
 *
 * 判定は見出し語（english）の正規化キーだけで行う。訳が違っても
 * 同じ見出し語なら「すでにある」と伝えたうえで、載せるかどうかは
 * ユーザーに委ねる（自動では消さない）。
 */

/** 見出し語の前後に付きがちなOCRノイズ（引用符・句読点）だけを落とす。 */
const EDGE_PUNCTUATION = /^[\s"'“”‘’.,;:!?()[\]]+|[\s"'“”‘’.,;:!?()[\]]+$/g;

/**
 * 重複判定用のキー。大文字小文字・全角半角・連続スペース・
 * 前後の記号の違いは同じ単語として扱う。
 */
export function normalizeWordKey(english: string): string {
  if (typeof english !== 'string') return '';
  return english
    .normalize('NFKC')
    .replace(EDGE_PUNCTUATION, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 既存単語（単語帳に入っている単語）の正規化キー集合を作る。 */
export function buildExistingWordKeys(words: Iterable<{ english?: unknown }>): Set<string> {
  const keys = new Set<string>();
  for (const word of words) {
    const key = normalizeWordKey(typeof word?.english === 'string' ? word.english : '');
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * 重複した単語の扱い方。確認画面のバナーでユーザーが選ぶ。
 * - skip: 重複した単語は追加しない（既定）
 * - all:  重複した単語もすべて追加する
 * - each: 重複した単語を1語ずつ選んで追加する
 */
export type DuplicateHandling = 'skip' | 'all' | 'each';

/** 単語帳の中に同じ見出し語がすでにあれば、その単語を返す（手入力の重複告知用）。 */
export function findDuplicateWord<T extends { english: string }>(
  words: readonly T[],
  english: string,
): T | undefined {
  const key = normalizeWordKey(english);
  if (!key) return undefined;
  return words.find((word) => normalizeWordKey(word.english) === key);
}

export interface DuplicateFlaggableWord {
  english: string;
  isDuplicate: boolean;
  isSelected: boolean;
}

/**
 * スキャン結果の各単語が重複かどうかを付け直し、選択状態を揃える。
 *
 * - 既存の単語帳にすでにある見出し語は重複
 * - 同じスキャン結果の中で2回目以降に出てくる見出し語も重複
 *   （先頭の1件は残す）
 * - 新たに重複と判定された単語だけ、選択状態を defaultIncludeDuplicates にする
 * - すでに重複と分かっていた単語の選択状態は動かさない
 *   （その1語だけ「追加する」に切り替えたユーザーの判断を、
 *     別の単語の編集や削除で巻き戻さないため）
 * - 編集などで重複でなくなった単語は選択状態に戻す
 *   （重複だから外されていただけなので）
 * - それ以外の単語の選択状態には触らない（手動のオン/オフを尊重する）
 */
export function syncDuplicateSelection<T extends DuplicateFlaggableWord>(
  words: T[],
  existingWordKeys: ReadonlySet<string>,
  defaultIncludeDuplicates: boolean,
): T[] {
  const seenInBatch = new Set<string>();

  return words.map((word) => {
    const key = normalizeWordKey(word.english);
    let isDuplicate = false;

    if (key) {
      isDuplicate = existingWordKeys.has(key) || seenInBatch.has(key);
      seenInBatch.add(key);
    }

    if (isDuplicate) {
      if (word.isDuplicate) return word;
      return { ...word, isDuplicate: true, isSelected: defaultIncludeDuplicates };
    }

    // 重複ではなくなった単語は、重複を理由に外されたままにしない
    if (word.isDuplicate) return { ...word, isDuplicate: false, isSelected: true };
    return word;
  });
}

/**
 * 重複と判定された単語すべての選択状態をまとめて切り替える。
 * 告知バナーの「追加しない / 重複も追加」ボタン用。
 */
export function setDuplicateWordsSelected<T extends DuplicateFlaggableWord>(
  words: T[],
  selected: boolean,
): T[] {
  return words.map((word) => {
    if (!word.isDuplicate || word.isSelected === selected) return word;
    return { ...word, isSelected: selected };
  });
}

/** 重複と判定された単語の件数。告知バナーの表示判定に使う。 */
export function countDuplicateWords(words: readonly { isDuplicate: boolean }[]): number {
  return words.reduce((count, word) => (word.isDuplicate ? count + 1 : count), 0);
}

/** 重複のうち、いま追加することになっている語数。 */
export function countSelectedDuplicateWords(
  words: readonly { isDuplicate: boolean; isSelected: boolean }[],
): number {
  return words.reduce((count, word) => (word.isDuplicate && word.isSelected ? count + 1 : count), 0);
}
