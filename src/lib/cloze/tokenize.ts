/**
 * 英文を語に割る。空所補充の出題文マスター (`cloze_sentences.tokens`) と、
 * 出題時に空欄の位置を探す処理の両方がこの規則を使う。取り込み時と出題時で
 * 割り方がずれると「tokens では見つかったのに文中に無い」が起きるので、
 * 必ずここを通す。
 *
 * 語 = ラテン文字の並び。アポストロフィでつながった部分 (don't, it's) は1語。
 * 数字・記号は語にしない。
 */
const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export type SentenceToken = {
  /** 文中の表記そのまま (大文字小文字を保つ)。 */
  text: string;
  /** 照合用。小文字にし、曲がったアポストロフィをまっすぐにしたもの。 */
  normalized: string;
  start: number;
  end: number;
};

export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/’/g, "'");
}

export function splitSentenceTokens(sentence: string): SentenceToken[] {
  const tokens: SentenceToken[] = [];
  for (const match of sentence.matchAll(WORD_PATTERN)) {
    const text = match[0];
    const start = match.index ?? 0;
    tokens.push({ text, normalized: normalizeToken(text), start, end: start + text.length });
  }
  return tokens;
}

/** DB に入れる形。重複を除いた小文字の語。 */
export function tokenizeForIndex(sentence: string): string[] {
  return Array.from(new Set(splitSentenceTokens(sentence).map((token) => token.normalized)));
}
