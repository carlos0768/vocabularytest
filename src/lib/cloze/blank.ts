import type { LexiconPos } from '../../../shared/lexicon';
import { inflectHeadword, type InflectionForm } from './inflections';
import { splitSentenceTokens } from './tokenize';

/**
 * 出題文の中で、答えの語が入っている箇所を空欄にしたもの。
 */
export type ClozeBlank = {
  before: string;
  after: string;
  /** 文中の表記そのまま (文頭なら大文字始まり)。これが正解の選択肢になる。 */
  answer: string;
  /**
   * 空欄に入っている語の形として考えられるもの。
   * 規則動詞の walked は過去形とも過去分詞とも読めるので2つ入る。誤答はこのすべての
   * 形で同じ綴りになる語だけを使う —— walked の誤答に took を出すと、実は過去分詞の
   * 文だった場合に taken でないとおかしい、という形のずれが起きるため。
   */
  forms: InflectionForm[];
  /** 文頭で大文字始まりだったか。誤答も同じく大文字始まりにそろえる。 */
  capitalized: boolean;
  /** 文中の語 (小文字)。誤答が文中の別の語と同じにならないよう使う。 */
  sentenceTokens: ReadonlySet<string>;
};

/** 直後に過去分詞が来る語。「have walked」「was taken」「got lost」。 */
const PAST_PARTICIPLE_TRIGGERS = new Set([
  'have', 'has', 'had', 'having', "i've", "you've", "we've", "they've",
  'be', 'is', 'are', 'was', 'were', 'been', 'being', "it's", "he's", "she's",
  'get', 'gets', 'got', 'gotten',
]);

/** 直後に原形が来る語。「to go」「can go」「didn't go」。 */
const BASE_FORM_TRIGGERS = new Set([
  'to', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'do', 'does', 'did', "don't", "doesn't", "didn't", "won't", "can't", "couldn't",
  "wouldn't", "shouldn't", "mustn't", "let's",
]);

/**
 * 答えの語の形を、直前の語から絞り込む。
 * 絞れなければ候補を全部残す (誤答側がすべての形で同じ綴りの語だけに絞られる)。
 */
function narrowForms(forms: InflectionForm[], previousToken: string | undefined): InflectionForm[] {
  if (forms.length <= 1 || !previousToken) return forms;
  if (forms.includes('past_participle') && PAST_PARTICIPLE_TRIGGERS.has(previousToken)) {
    return ['past_participle'];
  }
  if (forms.includes('base') && BASE_FORM_TRIGGERS.has(previousToken)) {
    return ['base'];
  }
  return forms;
}

/**
 * 出題文から空欄を作る。答えの語 (活用形を含む) がちょうど1回だけ出てくる文にだけ作る。
 *
 * 2回以上出てくる文は使わない。片方だけ空欄にすると残った方が答えを教えてしまい、
 * 両方空欄にすると英検の形式から外れる。ハイフンでつながった語の一部 (well-known の
 * known) も、空欄にすると "well-( )" になって不自然なので使わない。
 */
export function buildClozeBlank(sentence: string, headword: string, pos: LexiconPos): ClozeBlank | null {
  const inflections = inflectHeadword(headword, pos);
  if (inflections.length === 0) return null;

  const formsBySurface = new Map<string, InflectionForm[]>();
  for (const { form, surface } of inflections) {
    const existing = formsBySurface.get(surface);
    if (existing) existing.push(form);
    else formsBySurface.set(surface, [form]);
  }

  const tokens = splitSentenceTokens(sentence);
  const matchIndexes = tokens
    .map((token, index) => (formsBySurface.has(token.normalized) ? index : -1))
    .filter((index) => index >= 0);
  if (matchIndexes.length !== 1) return null;

  const index = matchIndexes[0];
  const token = tokens[index];
  if (sentence[token.start - 1] === '-' || sentence[token.end] === '-') return null;

  const forms = narrowForms(formsBySurface.get(token.normalized) ?? [], tokens[index - 1]?.normalized);
  const firstChar = token.text[0];

  return {
    before: sentence.slice(0, token.start),
    after: sentence.slice(token.end),
    answer: token.text,
    forms,
    capitalized: firstChar !== firstChar.toLowerCase(),
    sentenceTokens: new Set(tokens.map((t) => t.normalized)),
  };
}
