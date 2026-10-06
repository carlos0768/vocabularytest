/**
 * 誤答選択肢の安全性検査 (出題語の正しい訳が誤答に混ざっていないか)。
 *
 * 誤答生成 (`src/lib/ai/generate-quiz-content.ts`) の後処理と、四択の「選択肢の報告」
 * (`src/lib/quiz/option-report.ts`、クライアントからも import される) が共用する。
 * AI プロバイダや Node 専用モジュールに依存しない純粋な関数だけを置くこと ——
 * ここに providers を import すると、クイズ画面のクライアントバンドルに
 * `node:async_hooks` が混ざってビルドが落ちる。
 */

export interface DistractorSafetyWord {
  english: string;
  japanese: string;
  /** 出題語が持つ「正解以外の訳」。これらも出題語の正しい訳として扱う。 */
  knownTranslations?: readonly string[];
}

/** モデルに要求する誤答候補の数。フィルタで落ちる分の余裕として 3 より多く作らせ、採用は 3 つ。 */
export const DISTRACTOR_CANDIDATE_COUNT = 4;
export const DISTRACTOR_COUNT = 3;

const SENSE_SEPARATOR = /[、,，;；/／・\n]+/;

/**
 * 日本語訳どうしを突き合わせるための正規化。全角半角・空白・括弧注記・
 * 先頭の「〜」を落として、表記ゆれで比較がすり抜けないようにする。
 */
export function normalizeJapaneseSense(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[〔\[][^〕\]]*[〕\]]/g, '')
    .replace(/\s+/g, '')
    .replace(/^[〜～…]+/, '')
    .toLowerCase();
}

function splitSenses(value: string): string[] {
  const whole = normalizeJapaneseSense(value);
  const parts = value.split(SENSE_SEPARATOR).map(normalizeJapaneseSense).filter(Boolean);
  return [...new Set([whole, ...parts].filter(Boolean))];
}

/**
 * 出題語の正しい訳として扱う文字列の集合（正解＋既知の他の訳）を語義単位に割ったもの。
 */
export function collectForbiddenSenses(word: Pick<DistractorSafetyWord, 'japanese' | 'knownTranslations'>): string[] {
  const senses = new Set<string>();
  for (const sense of splitSenses(word.japanese)) senses.add(sense);
  for (const translation of word.knownTranslations ?? []) {
    if (typeof translation !== 'string') continue;
    for (const sense of splitSenses(translation)) senses.add(sense);
  }
  return [...senses];
}

/**
 * 誤答が出題語の訳と「同じ」か「含む／含まれる」かを判定する。
 * 完全一致は長さに関わらず弾き、部分一致は短い側が2文字以上のときだけ弾く
 * （「本」が「本当の」に含まれるような1文字の偶然を過剰に落とさないため）。
 */
export function isDistractorSenseOfWord(distractor: string, forbiddenSenses: readonly string[]): boolean {
  const candidates = splitSenses(distractor);
  for (const candidate of candidates) {
    for (const forbidden of forbiddenSenses) {
      if (candidate === forbidden) return true;
      const shorter = candidate.length <= forbidden.length ? candidate : forbidden;
      const longer = shorter === candidate ? forbidden : candidate;
      if (shorter.length >= 2 && longer.includes(shorter)) return true;
    }
  }
  return false;
}

function normalizeEnglishHeadword(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^to\s+/, '')
    .replace(/[^a-z\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DERIVATION_PREFIX_MIN_LENGTH = 5;

/**
 * 誤答の元になった英単語が出題語そのもの、または出題語の派生語・活用形と
 * 思われるかどうか。派生語は「一方が他方の先頭5文字以上を共有しそのまま
 * 始まる」(predict → prediction / predictable) で検出する。
 */
export function isSourceSameOrDerivedWord(source: string, english: string): boolean {
  const a = normalizeEnglishHeadword(source);
  const b = normalizeEnglishHeadword(english);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  return shorter.length >= DERIVATION_PREFIX_MIN_LENGTH && longer.startsWith(shorter);
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : '')) : [];
}

/**
 * モデルが返した誤答候補から、出題語の訳として成立しうるものを落として
 * 3 つに絞る。足りなければ汎用の訳で埋める（従来どおり）。
 */
export function selectSafeDistractors(
  word: DistractorSafetyWord,
  rawDistractors: unknown,
  rawSources: unknown,
): string[] {
  const candidates = toStringList(rawDistractors);
  const sources = toStringList(rawSources);
  const forbiddenSenses = collectForbiddenSenses(word);
  const accepted: string[] = [];
  const seen = new Set<string>();

  candidates.forEach((candidate, index) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const key = normalizeJapaneseSense(trimmed);
    if (!key || seen.has(key)) return;
    if (isDistractorSenseOfWord(trimmed, forbiddenSenses)) return;
    const source = sources[index];
    if (source && isSourceSameOrDerivedWord(source, word.english)) return;
    seen.add(key);
    accepted.push(trimmed);
  });

  const correctAnswer = normalizeJapaneseSense(word.japanese);
  const fallbacks = ['確認する', '提供する', '参加する', '検討する', '対応する'];
  let fallbackIndex = 0;
  while (accepted.length < DISTRACTOR_COUNT && fallbackIndex < fallbacks.length) {
    const fb = fallbacks[fallbackIndex];
    const fbKey = normalizeJapaneseSense(fb);
    if (!seen.has(fbKey) && fbKey !== correctAnswer && !isDistractorSenseOfWord(fb, forbiddenSenses)) {
      seen.add(fbKey);
      accepted.push(fb);
    }
    fallbackIndex += 1;
  }

  return accepted.slice(0, DISTRACTOR_COUNT);
}
