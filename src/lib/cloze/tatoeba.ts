/**
 * Tatoeba (https://tatoeba.org/ja/downloads) の配布ファイルを読むための純粋関数。
 * 取り込みスクリプト (scripts/import-tatoeba-cloze.ts) から使う。
 *
 * 使うファイル (どれもタブ区切り・ヘッダ無し):
 * - `<lang>_sentences_detailed.tsv`: id, lang, text, username, date_added, date_modified
 * - `links.csv`: sentence_id, translation_id (両方向の行がある)
 * - `sentences_CC0.csv`: id, lang, text, date_last_modified (CC0 で公開された文)
 * - `tags.csv`: sentence_id, tag_name
 */

import { splitSentenceTokens } from './tokenize';

export const TATOEBA_LICENSE_CC_BY = 'CC BY 2.0 FR';
export const TATOEBA_LICENSE_CC0 = 'CC0 1.0';
export type TatoebaLicense = typeof TATOEBA_LICENSE_CC_BY | typeof TATOEBA_LICENSE_CC0;

export type TatoebaSentence = {
  id: number;
  lang: string;
  text: string;
  /** 孤立文 (投稿者が退会済みなど) は null。 */
  username: string | null;
};

function parseId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** `\N` は Tatoeba の書き出しで「値なし」。 */
function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '\\N' ? trimmed : null;
}

export function parseSentenceLine(line: string): TatoebaSentence | null {
  const [idText, lang, text, username] = line.split('\t');
  const id = parseId(idText);
  const trimmed = text?.trim();
  if (!id || !lang || !trimmed) return null;
  return { id, lang, text: trimmed, username: nullable(username) };
}

export function parseLinkLine(line: string): [number, number] | null {
  const [a, b] = line.split('\t');
  const from = parseId(a);
  const to = parseId(b);
  return from && to ? [from, to] : null;
}

/** `sentences_CC0.csv` の行から、指定の言語の文IDだけ取り出す。 */
export function parseCc0Line(line: string, langs: ReadonlySet<string>): number | null {
  const [idText, lang] = line.split('\t');
  return langs.has(lang) ? parseId(idText) : null;
}

export function parseTagLine(line: string): { sentenceId: number; tag: string } | null {
  const [idText, tag] = line.split('\t');
  const sentenceId = parseId(idText);
  const trimmed = tag?.trim();
  return sentenceId && trimmed ? { sentenceId, tag: trimmed } : null;
}

/**
 * 品質に問題がある印のタグ。Tatoeba では "@" 始まりのタグがレビュー用の印
 * ("@needs native check", "@change", "@delete" など) なので、まとめて除外する。
 */
export function isQualityWarningTag(tag: string): boolean {
  return tag.startsWith('@');
}

export const CLOZE_SENTENCE_MIN_WORDS = 4;
export const CLOZE_SENTENCE_MAX_WORDS = 20;

/**
 * 空所補充の出題文に使える英文か。
 * - 4〜20語 (短すぎると文脈が無く、長すぎるとスマホで読めない)
 * - 大文字で始まり . ! ? で終わる、ふつうの1文
 * - 引用符・括弧・数字・URLを含まない (空欄の位置が崩れやすく、学習向きでもない)
 */
export function isUsableEnglishSentence(text: string): boolean {
  if (!/^[A-Z]/.test(text)) return false;
  if (!/[.!?]$/.test(text)) return false;
  if (/["“”()[\]{}<>\d]|https?:|www\./.test(text)) return false;
  // 文の途中で終わって次の文が始まっているもの ("Hi. How are you?") は1文ではない
  if (/[.!?]\s+\S/.test(text.slice(0, -1))) return false;
  const words = splitSentenceTokens(text).length;
  return words >= CLOZE_SENTENCE_MIN_WORDS && words <= CLOZE_SENTENCE_MAX_WORDS;
}

/** 和訳として使える日本語文か。ひらがな・カタカナ・漢字を含み、長すぎないこと。 */
export function isUsableJapaneseSentence(text: string): boolean {
  if (text.length > 120) return false;
  return /[぀-ヿ一-鿿]/.test(text);
}

export function licenseFor(id: number, cc0Ids: ReadonlySet<number>): TatoebaLicense {
  return cc0Ids.has(id) ? TATOEBA_LICENSE_CC0 : TATOEBA_LICENSE_CC_BY;
}

/**
 * 1つの英文に付いている和訳の中から1つ選ぶ。
 * 作者の分かるもの (帰属表示ができるもの) を優先し、同じ条件なら古い文 (IDが小さい) を取る。
 * 古い文ほど多くの人の目を通っていて、修正が入っている見込みが高い。
 */
export function pickJapaneseTranslation(candidates: readonly TatoebaSentence[]): TatoebaSentence | null {
  const usable = candidates.filter((sentence) => isUsableJapaneseSentence(sentence.text));
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => {
    const authorRank = Number(b.username !== null) - Number(a.username !== null);
    return authorRank !== 0 ? authorRank : a.id - b.id;
  })[0];
}
