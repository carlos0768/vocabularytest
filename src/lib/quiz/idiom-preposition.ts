/**
 * イディオム (複数語の熟語) の前置詞だけを隠すための分割。
 *
 * 表示だけの処理で、単語データにもサーバーにも何も足さない。熟語で問われるのは
 * たいてい前置詞 (look forward *to*, depend *on*) なので、
 * - Passive (四択): 英語の出題文から前置詞を伏せ字にして見せる
 * - Active (記述): 前置詞以外は見せたまま、前置詞だけを入力させる
 * に使う。
 */

// 熟語の穴埋めで問われる前置詞・副詞小辞。
// as / like / but は接続詞・比較としての用法が多く、伏せると意味が取れなくなるので外している。
const PREPOSITIONS = new Set([
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'at', 'before', 'behind', 'below', 'beneath', 'beside', 'besides', 'between',
  'beyond', 'by', 'down', 'during', 'except', 'for', 'from', 'in', 'inside',
  'into', 'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over', 'past',
  'since', 'through', 'throughout', 'till', 'to', 'toward', 'towards', 'under',
  'until', 'up', 'upon', 'with', 'within', 'without',
]);

export interface IdiomSegment {
  text: string;
  /** true = 前置詞 (隠す側) */
  hidden: boolean;
}

function isPrepositionToken(token: string): boolean {
  return PREPOSITIONS.has(token.toLowerCase());
}

/**
 * 英語の見出しを「見せる部分」と「前置詞」に分ける。
 * イディオムとして扱えない (1語だけ・前置詞を含まない・前置詞しかない) ときは null。
 * 前置詞でない語が隣り合っていれば1つのセグメントにまとめる。
 */
export function splitIdiomPrepositions(english: string | null | undefined): IdiomSegment[] | null {
  const tokens = (english ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const flags = tokens.map(isPrepositionToken);
  if (!flags.some(Boolean) || flags.every(Boolean)) return null;

  const segments: IdiomSegment[] = [];
  tokens.forEach((token, i) => {
    const hidden = flags[i];
    const last = segments[segments.length - 1];
    if (last && !last.hidden && !hidden) {
      last.text = `${last.text} ${token}`;
    } else {
      segments.push({ text: token, hidden });
    }
  });
  return segments;
}

/** 記述で入力させる答え (隠した前置詞を順に並べたもの)。 */
export function getIdiomHiddenAnswer(segments: IdiomSegment[]): string {
  return segments.filter((s) => s.hidden).map((s) => s.text).join(' ');
}

/** 伏せ字にした文字列 (look forward ___ ~ing)。前置詞の長さは出さない。 */
export function maskIdiomPrepositions(segments: IdiomSegment[], mask = '___'): string {
  return segments.map((s) => (s.hidden ? mask : s.text)).join(' ');
}
