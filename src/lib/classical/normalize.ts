// 古典語（古文単語）の見出し語・品詞の正規化。
//
// shared/lexicon.ts の normalizeHeadword() / normalizeLexiconPos() と同じ役割の古典版。
// classical_entries の UNIQUE (normalized_headword, pos) キーを作るために使うので、
// SQL 側に同等関数を持たせない代わりに「書き込む前に必ずここを通す」規約にしている。

// classical_entries.pos は (normalized_headword, pos) キーの片割れなので粗い品詞だけ。
// 活用型をここに含めると、同じ語を教材Aが「シク活用形容詞」・教材Bが「形容詞」と
// 書いただけでエントリが分裂し、ヒント流用が黙って効かなくなる。
// 活用型は normalizeClassicalConjugationType() で別カラムに落とす。
export const CLASSICAL_POS_VALUES = [
  'verb',
  'adjective',
  'adjectival_noun',
  'auxiliary',
  'particle',
  'noun',
  'adverb',
  'adnominal',
  'conjunction',
  'interjection',
  'other',
] as const;

export type ClassicalPos = (typeof CLASSICAL_POS_VALUES)[number];

const CLASSICAL_POS_SET = new Set<string>(CLASSICAL_POS_VALUES);

/**
 * 品詞ラベルの表記ゆれ吸収ルール。**順序が意味を持つ**（先に一致したものを採る）。
 *
 * AI は「シク活用形容詞」「形容詞・シク活用」「形シク」のように同じ品詞を何通りにも書くので、
 * 完全一致のルックアップ表ではなく部分一致の順序付きルールで畳む。
 * どの書き方でも同じ粗い品詞に落ちることが、ヒント流用が効くための条件。
 *
 * 「助動詞」「形容動詞」「感動詞」はいずれも「動詞」を含むので、総称の「動詞」より必ず先に置く。
 * 活用型からの推定（ナリ/タリ→形容動詞、シク/ク→形容詞、四段など→動詞）は、
 * 品詞語そのものが書かれていない教材のための保険。
 */
const CLASSICAL_POS_RULES: Array<[string, ClassicalPos]> = [
  // 「動詞」を含む複合語は総称より先
  ['形容動詞', 'adjectival_noun'],
  ['助動詞', 'auxiliary'],
  ['感動詞', 'interjection'],
  ['形容詞', 'adjective'],
  ['助詞', 'particle'],
  ['連体詞', 'adnominal'],
  ['接続詞', 'conjunction'],
  ['感嘆詞', 'interjection'],
  ['副詞', 'adverb'],
  ['代名詞', 'noun'],
  ['名詞', 'noun'],
  ['動詞', 'verb'],
  // 品詞語が書かれておらず活用型しか無い場合の推定
  ['ナリ活用', 'adjectival_noun'],
  ['タリ活用', 'adjectival_noun'],
  ['シク活用', 'adjective'],
  ['形シク', 'adjective'],
  ['ク活用', 'adjective'],
  ['形ク', 'adjective'],
  ['カ行変格', 'verb'],
  ['カ変', 'verb'],
  ['サ行変格', 'verb'],
  ['サ変', 'verb'],
  ['ナ行変格', 'verb'],
  ['ナ変', 'verb'],
  ['ラ行変格', 'verb'],
  ['ラ変', 'verb'],
  ['上一段', 'verb'],
  ['上二段', 'verb'],
  ['下一段', 'verb'],
  ['下二段', 'verb'],
  ['四段', 'verb'],
];

/**
 * 活用型の抽出ルール。pos と違って表示用メタデータなので、正規形は日本語のまま。
 * 「シク活用」は「ク活用」を含むので必ず先に見る。
 */
const CLASSICAL_CONJUGATION_RULES: Array<[string, string]> = [
  ['カ行変格', 'カ行変格活用'],
  ['カ変', 'カ行変格活用'],
  ['サ行変格', 'サ行変格活用'],
  ['サ変', 'サ行変格活用'],
  ['ナ行変格', 'ナ行変格活用'],
  ['ナ変', 'ナ行変格活用'],
  ['ラ行変格', 'ラ行変格活用'],
  ['ラ変', 'ラ行変格活用'],
  ['上一段', '上一段活用'],
  ['上二段', '上二段活用'],
  ['下一段', '下一段活用'],
  ['下二段', '下二段活用'],
  ['四段', '四段活用'],
  ['ナリ活用', 'ナリ活用'],
  ['タリ活用', 'タリ活用'],
  ['シク活用', 'シク活用'],
  ['形シク', 'シク活用'],
  ['ク活用', 'ク活用'],
  ['形ク', 'ク活用'],
];

const MAX_CONJUGATION_TYPE_LENGTH = 40;

/** 英語側の partOfSpeechTags がそのまま流れてきた場合の受け皿。 */
const ENGLISH_POS_ALIASES: Record<string, ClassicalPos> = {
  noun: 'noun',
  pronoun: 'noun',
  verb: 'verb',
  adjective: 'adjective',
  adverb: 'adverb',
  auxiliary: 'auxiliary',
  particle: 'particle',
  conjunction: 'conjunction',
  interjection: 'interjection',
  determiner: 'adnominal',
};

/**
 * 見出し語の正規化キー。
 *
 * shared/lexicon.ts の normalizeHeadword() と違い toLowerCase() はしない（かなに無意味で、
 * 漢字表記の見出し語に対しても何もしない）。代わりに NFKC で半角カナ・全角英数を畳み、
 * 古典テキストで揺れやすい踊り字と旧仮名の濁点表記を吸収する。
 */
export function normalizeClassicalHeadword(value: string): string {
  const compact = value.normalize('NFKC').trim().replace(/\s+/g, '');
  return (
    expandIterationMarks(compact)
      // 古語辞典の見出しは語幹と活用語尾を「か・ふ」のように区切るので、
      // 同定キーからは区切り記号を落とす。ダッシュ類は NFKC でも統一されないため
      // U+2212(−) や U+2013(–) まで明示的に並べる。
      // 長音符「ー」(U+30FC) は語を構成する文字なので絶対に含めないこと。
      .replace(/[・=＝\-−–—―~〜]/g, '')
  );
}

/**
 * 一字踊り字（ゝゞヽヾ）を直前の字の繰り返しに展開する。
 *
 * 落とす（削除する）のではなく展開するのが要点。「こゝろ」を「ころ」にしてしまうと
 * 別語と衝突して共通辞書が壊れる。展開すれば「こころ」になり正しく同定できる。
 * ゞ/ヾ は濁点付きの繰り返しなので結合濁点を足して NFC で畳む。
 */
function expandIterationMarks(value: string): string {
  let result = '';
  for (const char of value) {
    const previous = result.at(-1);
    if (!previous) {
      if (char === 'ゝ' || char === 'ゞ' || char === 'ヽ' || char === 'ヾ') continue;
      result += char;
      continue;
    }
    if (char === 'ゝ' || char === 'ヽ') {
      result += previous;
    } else if (char === 'ゞ' || char === 'ヾ') {
      result += `${previous}゙`.normalize('NFC');
    } else {
      result += char;
    }
  }
  return result;
}

/** 訳の正規化キー。SQL の normalize_lexicon_translation_key と同じ規則に揃えてある。 */
export function normalizeClassicalTranslationKey(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

/**
 * 品詞ラベルを classical_entries.pos の許容値に畳む。
 * 判別できないものはすべて 'other'。AI が何を返しても INSERT が落ちないようにするのが目的。
 */
export function normalizeClassicalPos(value: string | null | undefined): ClassicalPos {
  const raw = (value ?? '').normalize('NFKC').trim();
  if (!raw) return 'other';

  // すでに正規形なら素通し
  if (CLASSICAL_POS_SET.has(raw)) return raw as ClassicalPos;

  const lowered = raw.toLowerCase().replace(/\s+/g, '_');
  if (CLASSICAL_POS_SET.has(lowered)) return lowered as ClassicalPos;
  if (ENGLISH_POS_ALIASES[lowered]) return ENGLISH_POS_ALIASES[lowered];

  const compact = raw.replace(/\s+/g, '');
  for (const [pattern, pos] of CLASSICAL_POS_RULES) {
    if (compact.includes(pattern)) return pos;
  }

  return 'other';
}

/**
 * 品詞ラベルから活用型だけを取り出す（classical_entries.conjugation_type 用）。
 * キーではないので、判別できなければ元の文字列を丸めて残す（40字上限はCHECKに合わせる）。
 */
export function normalizeClassicalConjugationType(value: string | null | undefined): string | undefined {
  const raw = (value ?? '').normalize('NFKC').trim();
  if (!raw) return undefined;

  const compact = raw.replace(/\s+/g, '');
  for (const [pattern, conjugation] of CLASSICAL_CONJUGATION_RULES) {
    if (compact.includes(pattern)) return conjugation;
  }

  // 活用型として認識できない品詞ラベル（「名詞」など）は活用型ではないので落とす
  if (CLASSICAL_POS_RULES.some(([pattern]) => compact === pattern)) return undefined;

  return compact.slice(0, MAX_CONJUGATION_TYPE_LENGTH);
}

/**
 * 見出し語が日本語として書かれているか。
 *
 * AIの isClassical フラグを**降格させるためだけ**に使う一方向の安全弁。
 * 英単語が誤って古典語と判定されると、例文・語源解析・クイズ誤答生成といった
 * 英語向けの後処理がまるごと止まってしまうため、ラテン文字を含む見出し語は
 * 古典語として扱わない。逆に、このチェックで古典語へ“昇格”させることはしない
 * （現代日本語の語や英単語帳の訳語を誤って拾ってしまうため）。
 */
export function looksLikeClassicalJapanese(headword: string | null | undefined): boolean {
  const value = (headword ?? '').trim();
  if (!value) return false;
  if (/[A-Za-z]/.test(value)) return false;
  return /[぀-ゟ゠-ヿ一-鿿]/.test(value);
}
