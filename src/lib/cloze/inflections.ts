import type { LexiconPos } from '../../../shared/lexicon';

/**
 * 見出し語から活用形を作る。空所補充では2か所で使う。
 *
 * 1. 出題文を探す: 「walk」の問題に "She walked home." を使えるよう、活用形まで含めて引く。
 * 2. 誤答をそろえる: 正解が過去形 walked なら、誤答も ran / ate のように同じ形にする。
 *    英検の大問1と同じで、形の違いで答えが分かってしまわないようにするため。
 *
 * 規則変化は綴りの規則で作り、よく出る不規則変化だけ表で持つ。完璧な活用辞書ではないので、
 * 誤答側では「作った形が怪しい語」を使わない (後述の DOUBLING_EXCEPTIONS 等) 方針で守る。
 */

export type InflectionForm =
  | 'base'
  | 'third'
  | 'past'
  | 'past_participle'
  | 'ing'
  | 'plural'
  | 'comparative'
  | 'superlative';

export type InflectedSurface = {
  form: InflectionForm;
  surface: string;
};

/** [原形, 過去形, 過去分詞]。 */
const IRREGULAR_VERBS: ReadonlyArray<readonly [string, string, string]> = [
  ['arise', 'arose', 'arisen'],
  ['awake', 'awoke', 'awoken'],
  ['bear', 'bore', 'born'],
  ['beat', 'beat', 'beaten'],
  ['become', 'became', 'become'],
  ['begin', 'began', 'begun'],
  ['bend', 'bent', 'bent'],
  ['bet', 'bet', 'bet'],
  ['bind', 'bound', 'bound'],
  ['bite', 'bit', 'bitten'],
  ['bleed', 'bled', 'bled'],
  ['blow', 'blew', 'blown'],
  ['break', 'broke', 'broken'],
  ['breed', 'bred', 'bred'],
  ['bring', 'brought', 'brought'],
  ['build', 'built', 'built'],
  ['burst', 'burst', 'burst'],
  ['buy', 'bought', 'bought'],
  ['catch', 'caught', 'caught'],
  ['choose', 'chose', 'chosen'],
  ['come', 'came', 'come'],
  ['cost', 'cost', 'cost'],
  ['creep', 'crept', 'crept'],
  ['cut', 'cut', 'cut'],
  ['deal', 'dealt', 'dealt'],
  ['dig', 'dug', 'dug'],
  ['do', 'did', 'done'],
  ['draw', 'drew', 'drawn'],
  ['drink', 'drank', 'drunk'],
  ['drive', 'drove', 'driven'],
  ['eat', 'ate', 'eaten'],
  ['fall', 'fell', 'fallen'],
  ['feed', 'fed', 'fed'],
  ['feel', 'felt', 'felt'],
  ['fight', 'fought', 'fought'],
  ['find', 'found', 'found'],
  ['flee', 'fled', 'fled'],
  ['fly', 'flew', 'flown'],
  ['forbid', 'forbade', 'forbidden'],
  ['forget', 'forgot', 'forgotten'],
  ['forgive', 'forgave', 'forgiven'],
  ['freeze', 'froze', 'frozen'],
  ['get', 'got', 'gotten'],
  ['give', 'gave', 'given'],
  ['go', 'went', 'gone'],
  ['grind', 'ground', 'ground'],
  ['grow', 'grew', 'grown'],
  ['hang', 'hung', 'hung'],
  ['have', 'had', 'had'],
  ['hear', 'heard', 'heard'],
  ['hide', 'hid', 'hidden'],
  ['hit', 'hit', 'hit'],
  ['hold', 'held', 'held'],
  ['hurt', 'hurt', 'hurt'],
  ['keep', 'kept', 'kept'],
  ['kneel', 'knelt', 'knelt'],
  ['know', 'knew', 'known'],
  ['lay', 'laid', 'laid'],
  ['lead', 'led', 'led'],
  ['leave', 'left', 'left'],
  ['lend', 'lent', 'lent'],
  ['let', 'let', 'let'],
  ['lie', 'lay', 'lain'],
  ['light', 'lit', 'lit'],
  ['lose', 'lost', 'lost'],
  ['make', 'made', 'made'],
  ['mean', 'meant', 'meant'],
  ['meet', 'met', 'met'],
  ['mislead', 'misled', 'misled'],
  ['overcome', 'overcame', 'overcome'],
  ['pay', 'paid', 'paid'],
  ['put', 'put', 'put'],
  ['quit', 'quit', 'quit'],
  ['read', 'read', 'read'],
  ['ride', 'rode', 'ridden'],
  ['ring', 'rang', 'rung'],
  ['rise', 'rose', 'risen'],
  ['run', 'ran', 'run'],
  ['say', 'said', 'said'],
  ['see', 'saw', 'seen'],
  ['seek', 'sought', 'sought'],
  ['sell', 'sold', 'sold'],
  ['send', 'sent', 'sent'],
  ['set', 'set', 'set'],
  ['shake', 'shook', 'shaken'],
  ['shine', 'shone', 'shone'],
  ['shoot', 'shot', 'shot'],
  ['show', 'showed', 'shown'],
  ['shrink', 'shrank', 'shrunk'],
  ['shut', 'shut', 'shut'],
  ['sing', 'sang', 'sung'],
  ['sink', 'sank', 'sunk'],
  ['sit', 'sat', 'sat'],
  ['sleep', 'slept', 'slept'],
  ['slide', 'slid', 'slid'],
  ['speak', 'spoke', 'spoken'],
  ['spend', 'spent', 'spent'],
  ['spin', 'spun', 'spun'],
  ['split', 'split', 'split'],
  ['spread', 'spread', 'spread'],
  ['stand', 'stood', 'stood'],
  ['steal', 'stole', 'stolen'],
  ['stick', 'stuck', 'stuck'],
  ['sting', 'stung', 'stung'],
  ['strike', 'struck', 'struck'],
  ['swear', 'swore', 'sworn'],
  ['sweep', 'swept', 'swept'],
  ['swim', 'swam', 'swum'],
  ['swing', 'swung', 'swung'],
  ['take', 'took', 'taken'],
  ['teach', 'taught', 'taught'],
  ['tear', 'tore', 'torn'],
  ['tell', 'told', 'told'],
  ['think', 'thought', 'thought'],
  ['throw', 'threw', 'thrown'],
  ['understand', 'understood', 'understood'],
  ['undertake', 'undertook', 'undertaken'],
  ['upset', 'upset', 'upset'],
  ['wake', 'woke', 'woken'],
  ['wear', 'wore', 'worn'],
  ['weep', 'wept', 'wept'],
  ['win', 'won', 'won'],
  ['wind', 'wound', 'wound'],
  ['withdraw', 'withdrew', 'withdrawn'],
  ['write', 'wrote', 'written'],
];

const IRREGULAR_VERB_MAP = new Map(IRREGULAR_VERBS.map(([base, past, pp]) => [base, { past, pp }]));

/** 三単現が規則どおりにならない動詞。 */
const IRREGULAR_THIRD: Readonly<Record<string, string>> = { have: 'has' };

const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  man: 'men',
  woman: 'women',
  child: 'children',
  person: 'people',
  foot: 'feet',
  tooth: 'teeth',
  mouse: 'mice',
  goose: 'geese',
  life: 'lives',
  knife: 'knives',
  wife: 'wives',
  leaf: 'leaves',
  half: 'halves',
  wolf: 'wolves',
  shelf: 'shelves',
  thief: 'thieves',
  potato: 'potatoes',
  tomato: 'tomatoes',
  hero: 'heroes',
  echo: 'echoes',
  crisis: 'crises',
  analysis: 'analyses',
  phenomenon: 'phenomena',
  criterion: 'criteria',
};

/** 単複同形。複数形を別の形として持たない (原形で拾える)。 */
const UNCHANGING_PLURALS = new Set(['sheep', 'fish', 'deer', 'species', 'series', 'aircraft']);

const IRREGULAR_COMPARISONS: Readonly<Record<string, readonly [string, string]>> = {
  good: ['better', 'best'],
  bad: ['worse', 'worst'],
  far: ['farther', 'farthest'],
  little: ['less', 'least'],
  many: ['more', 'most'],
  much: ['more', 'most'],
};

/**
 * 語末の子音を重ねるのに、1音節語の規則 (stop → stopped) に当てはまらない語。
 * 後ろにアクセントがある2音節動詞は重ね (admit → admitted)、
 * 1音節でも重ねない語 (fix, show 等は語末 w/x/y の規則で除外済み) はここで扱わない。
 */
const DOUBLING_EXCEPTIONS = new Set([
  'admit',
  'commit',
  'control',
  'equip',
  'occur',
  'omit',
  'patrol',
  'permit',
  'prefer',
  'refer',
  'regret',
  'submit',
  'transfer',
  'upset',
  'begin',
  'forbid',
  'forget',
  'expel',
  'compel',
  'propel',
  'rebel',
  'excel',
]);

/**
 * 助動詞・be動詞・冠詞のような機能語。活用も文中での役割も普通の語と違い、
 * 空所補充の答えにも誤答にも向かない。
 */
const FUNCTION_WORDS = new Set([
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'a', 'an', 'the',
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would',
]);

const VOWELS = 'aeiou';

function isVowel(char: string | undefined): boolean {
  return !!char && VOWELS.includes(char);
}

function countSyllables(word: string): number {
  const trimmed = word.endsWith('e') && !word.endsWith('le') ? word.slice(0, -1) : word;
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 0);
}

/** 語末の子音字を重ねてから語尾を付けるか (stop → stopping, admit → admitted)。 */
function shouldDoubleFinalConsonant(word: string): boolean {
  if (DOUBLING_EXCEPTIONS.has(word)) return true;
  if (word.length < 3) return false;
  const last = word[word.length - 1];
  const middle = word[word.length - 2];
  const before = word[word.length - 3];
  if ('wxy'.includes(last) || isVowel(last)) return false;
  if (!isVowel(middle) || isVowel(before)) return false;
  // qu の u は母音扱いしない (quiz → quizzes は語形が特殊なので対象外にする)
  if (before === 'u' && word[word.length - 4] === 'q') return false;
  return countSyllables(word) === 1;
}

function endsWithConsonantY(word: string): boolean {
  return word.length >= 2 && word.endsWith('y') && !isVowel(word[word.length - 2]);
}

function addS(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (endsWithConsonantY(word)) return `${word.slice(0, -1)}ies`;
  if (/[^aeiou]o$/.test(word)) return `${word}es`;
  return `${word}s`;
}

function regularPast(word: string): string {
  if (word.endsWith('e')) return `${word}d`;
  if (endsWithConsonantY(word)) return `${word.slice(0, -1)}ied`;
  if (shouldDoubleFinalConsonant(word)) return `${word}${word[word.length - 1]}ed`;
  return `${word}ed`;
}

function presentParticiple(word: string): string {
  if (word.endsWith('ie')) return `${word.slice(0, -2)}ying`;
  if (word.endsWith('e') && !/(ee|ye|oe)$/.test(word)) return `${word.slice(0, -1)}ing`;
  if (shouldDoubleFinalConsonant(word)) return `${word}${word[word.length - 1]}ing`;
  return `${word}ing`;
}

function pluralOf(word: string): string | null {
  if (UNCHANGING_PLURALS.has(word)) return null;
  const irregular = IRREGULAR_PLURALS[word];
  if (irregular) return irregular;
  if (/[^aeiou]o$/.test(word)) return `${word}s`; // photo, piano。-oes は表で持つ
  return addS(word);
}

function comparisonsOf(word: string): readonly [string, string] | null {
  const irregular = IRREGULAR_COMPARISONS[word];
  if (irregular) return irregular;
  // 比較級を -er で作るのは1音節語と、-y で終わる2音節語だけ。
  // それ以外 (beautiful 等) は more/most を付けるので、1語の活用形は無い。
  const syllables = countSyllables(word);
  if (syllables === 1) {
    if (word.endsWith('e')) return [`${word}r`, `${word}st`];
    if (shouldDoubleFinalConsonant(word)) {
      const last = word[word.length - 1];
      return [`${word}${last}er`, `${word}${last}est`];
    }
    return [`${word}er`, `${word}est`];
  }
  if (syllables === 2 && endsWithConsonantY(word)) {
    const stem = word.slice(0, -1);
    return [`${stem}ier`, `${stem}iest`];
  }
  return null;
}

/** 1語だけで、ラテン文字 (とハイフン) だけからなる見出し語か。熟語や句動詞は対象外。 */
export function isClozeEligibleHeadword(headword: string): boolean {
  const normalized = headword.trim().toLowerCase();
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(normalized)) return false;
  return !FUNCTION_WORDS.has(normalized);
}

/**
 * 見出し語の活用形の一覧。先頭は必ず原形。
 * 対象外の見出し語 (熟語・機能語など) は空配列。
 */
export function inflectHeadword(headword: string, pos: LexiconPos): InflectedSurface[] {
  const base = headword.trim().toLowerCase();
  if (!isClozeEligibleHeadword(base)) return [];

  const forms: InflectedSurface[] = [{ form: 'base', surface: base }];

  // ハイフンでつながった語は活用させない (well-known など)。原形だけで引く。
  if (base.includes('-')) return forms;

  if (pos === 'verb') {
    const irregular = IRREGULAR_VERB_MAP.get(base);
    forms.push({ form: 'third', surface: IRREGULAR_THIRD[base] ?? addS(base) });
    forms.push({ form: 'past', surface: irregular?.past ?? regularPast(base) });
    forms.push({ form: 'past_participle', surface: irregular?.pp ?? regularPast(base) });
    forms.push({ form: 'ing', surface: presentParticiple(base) });
  } else if (pos === 'noun') {
    const plural = pluralOf(base);
    if (plural) forms.push({ form: 'plural', surface: plural });
  } else if (pos === 'adjective') {
    const comparisons = comparisonsOf(base);
    if (comparisons) {
      forms.push({ form: 'comparative', surface: comparisons[0] });
      forms.push({ form: 'superlative', surface: comparisons[1] });
    }
  }

  return forms;
}

/** 活用形の表記だけ (重複なし)。出題文をDBから引くときの検索語。 */
export function inflectedSurfaces(headword: string, pos: LexiconPos): string[] {
  return Array.from(new Set(inflectHeadword(headword, pos).map((entry) => entry.surface)));
}

/** その語のある形の表記。作れない形なら null。 */
export function surfaceForForm(
  headword: string,
  pos: LexiconPos,
  form: InflectionForm,
): string | null {
  return inflectHeadword(headword, pos).find((entry) => entry.form === form)?.surface ?? null;
}
