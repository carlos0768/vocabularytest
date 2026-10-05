/**
 * 言い換えクイズのデータセットを引くための見出し語の正規化。
 *
 * 単語帳の `english` は学習者の書き方のまま入っている —— 「to plummet」「look forward to ~」
 * 「play a trick on sb」「put off (延期する)」など。データセット側のキーは WordNet の
 * 見出し語 (小文字・空白区切り・プレースホルダ無し) なので、こちらを寄せる。
 */

const PLACEHOLDER_TOKENS = new Set([
  'sb', 'sth', 'so', 'smb', 'smth', 'somebody', 'someone', 'something',
]);
const POSSESSIVE_PLACEHOLDERS = new Set(["sb's", "so's", "someone's", "somebody's"]);
const LEADING_PARTICLES = new Set(['to', 'be']);
const TRAILING_PREPOSITIONS = new Set([
  'with', 'to', 'on', 'in', 'at', 'for', 'of', 'from', 'about', 'into', 'by', 'up', 'out',
  'off', 'over', 'down', 'away', 'back', 'around', 'through', 'against', 'upon', 'onto',
]);

/** データセットのキーと同じ形に揃える。読める形が残らなければ空文字。 */
export function normalizeParaphraseHeadword(english: string): string {
  let value = english
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    // 括弧書きの補足 (訳や語法メモ) は見出し語ではない
    .replace(/[(（\[［【][^)）\]］】]*[)）\]］】]/g, ' ')
    // 「A / B」の併記は先頭だけを見る
    .split(/\s*[/／]\s*/)[0] ?? '';
  value = value
    .replace(/[~〜～…]+|\.{2,}/g, ' ')
    .replace(/[,;:!?。、]+/g, ' ')
    .replace(/[^a-z' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return '';

  let tokens = value.split(' ').filter((token) => token.length > 0);
  tokens = tokens.map((token) => (POSSESSIVE_PLACEHOLDERS.has(token) ? "one's" : token));
  tokens = tokens.filter((token) => !PLACEHOLDER_TOKENS.has(token));
  if (tokens.length >= 2 && LEADING_PARTICLES.has(tokens[0])) {
    tokens = tokens.slice(1);
  }
  return tokens.join(' ').replace(/^[' -]+|[' -]+$/g, '');
}

/**
 * データセットを引く順番で、見出し語の候補を並べる。
 * 先頭が最も忠実な形で、後ろほど崩した形 (末尾の前置詞を落とす・活用を戻す)。
 * 見つかった最初の候補を使うので、崩しすぎた形が勝つことはない。
 */
export function paraphraseHeadwordCandidates(english: string): string[] {
  const base = normalizeParaphraseHeadword(english);
  if (!base) return [];
  const candidates: string[] = [base];
  const push = (candidate: string) => {
    const trimmed = candidate.trim();
    if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
  };

  if (base.includes('-')) push(base.replace(/-/g, ' '));

  const tokens = base.split(' ');
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    // 「well known」→「well-known」 (複合語)。前置詞で終わる句動詞は複合語ではない
    if (tokens.length === 2 && !TRAILING_PREPOSITIONS.has(last)) push(tokens.join('-'));
    // 「cope with」→「cope」、「take part in」→「take part」
    if (TRAILING_PREPOSITIONS.has(last)) push(tokens.slice(0, -1).join(' '));
  } else {
    for (const lemma of naiveLemmas(base)) push(lemma);
  }
  return candidates;
}

/** 活用形を素朴に戻す (辞書を持たないので候補を複数出し、存在する方に当てる)。 */
function naiveLemmas(word: string): string[] {
  const results: string[] = [];
  if (word.length < 4) return results;
  if (word.endsWith('ies')) results.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) results.push(word.slice(0, -2), word.slice(0, -1));
  else if (word.endsWith('s') && !word.endsWith('ss')) results.push(word.slice(0, -1));
  if (word.endsWith('ied')) results.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ed')) {
    results.push(word.slice(0, -2), word.slice(0, -1));
    if (/([a-z])\1ed$/.test(word)) results.push(word.slice(0, -3));
  }
  if (word.endsWith('ing')) {
    results.push(word.slice(0, -3), `${word.slice(0, -3)}e`);
    if (/([a-z])\1ing$/.test(word)) results.push(word.slice(0, -4));
  }
  return results.filter((candidate) => candidate.length >= 2);
}
