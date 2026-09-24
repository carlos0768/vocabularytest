/**
 * 教材（豆知識など）の文章向けの軽量マークアップ。
 * `**重要語**` で囲んだ部分を「強調（太字・赤字）」として扱う。
 *
 * 文章データは文字列のまま持ちたい（翻訳や差分が読みやすい）ので、
 * JSX を埋め込むのではなく、この関数で分割してから描画側で装飾する。
 * 閉じ忘れの `**` はそのまま本文として残す（文章を壊さない）。
 */

export interface EmphasisSegment {
  text: string;
  emphasis: boolean;
}

const MARKER = '**';

export function parseEmphasisMarkup(text: string): EmphasisSegment[] {
  const segments: EmphasisSegment[] = [];
  if (!text) return segments;

  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf(MARKER, cursor);
    if (open === -1) break;
    const close = text.indexOf(MARKER, open + MARKER.length);
    // 閉じが無い、または中身が空（`****`）なら以降はすべて本文扱い。
    if (close === -1 || close === open + MARKER.length) break;

    if (open > cursor) {
      segments.push({ text: text.slice(cursor, open), emphasis: false });
    }
    segments.push({ text: text.slice(open + MARKER.length, close), emphasis: true });
    cursor = close + MARKER.length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), emphasis: false });
  }
  return segments;
}

/** マークアップを取り除いた素の文章（key や検索用）。 */
export function stripEmphasisMarkup(text: string): string {
  return parseEmphasisMarkup(text)
    .map((segment) => segment.text)
    .join('');
}
