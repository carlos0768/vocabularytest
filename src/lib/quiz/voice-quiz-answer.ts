/**
 * 音読チャレンジ (英→日) の解答判定。
 *
 * 英単語の意味を音声で答えさせるので、英語のときのような
 * 「小文字化して完全一致」では厳しすぎる:
 *
 * - 音声認識はひらがな/カタカナ/漢字のどれで返すか安定しない
 * - 語義が「気づく、認識する」のように複数入っていることがある
 * - 話し言葉なので句読点や「えっと」由来の記号が混ざる
 *
 * そこで表記を畳んでから、語義候補ごとに突き合わせる。
 * 判定は「厳しすぎて正解を弾く」より「多少ゆるい」側に倒してある。
 * 不正解でも正解は必ず提示されるので、取りこぼしのほうが体験を損なう。
 */

/** 語義の区切りに使われる文字。 */
const MEANING_SEPARATORS = /[、,，・/／;；|｜\n]/;

/** 判定に影響しない記号・空白。 */
const IGNORED_CHARACTERS = /[\s　。．.!！?？「」『』（）()［］[\]【】〈〉《》~〜ー―-]/g;

/**
 * 括弧書きの補足。訳には「(人に)与える」「【他動詞】〜を許す」のように
 * 品詞や用法が添えられていることがあり、声に出して答えるときは読まれない。
 * 中身ごと落とした形も候補に入れて、本体だけ answered ても正解にする。
 */
const PARENTHETICAL = /[（(【〔［[][^）)】〕］\]]*[）)】〕］\]]/g;

/** 括弧の記号そのもの。中身は残したいが、記号は読み上げにも判定にも要らない。 */
const BRACKET_CHARACTERS = /[（)(）【】〔〕［\][]/g;

/** 括弧書きを中身ごと取り除く。 */
export function stripParentheticals(value: string): string {
  return value.replace(PARENTHETICAL, ' ').replace(/\s+/g, ' ').trim();
}

/** カタカナをひらがなに畳む (「コーヒー」と「こーひー」を同一視する)。 */
function katakanaToHiragana(value: string): string {
  return value.replace(/[ァ-ヶ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

/**
 * 比較用に表記を畳む。
 * NFKC で全角英数と半角カナを揃えてから、記号を落としてかなに寄せる。
 */
export function normalizeJapaneseAnswer(value: string): string {
  return katakanaToHiragana(
    value.normalize('NFKC').replace(IGNORED_CHARACTERS, ''),
  ).toLowerCase();
}

/**
 * 登録されている日本語訳を、突き合わせ可能な語義候補に分解する。
 * 「気づく、認識する」→ ["きづく", "にんしきする"] のように畳んだ形で返す。
 * 括弧書きの補足 (例:「(人に)与える」) は本体と補足の両方を候補に入れる。
 */
export function japaneseAnswerCandidates(japanese: string): string[] {
  const candidates = new Set<string>();

  // 括弧を落としてから割る。中に区切り文字が入っていることがあり
  //(「(人に、物を)与える」)、先に割ると括弧が閉じないまま残ってしまう。
  for (const source of [japanese, stripParentheticals(japanese)]) {
    for (const part of source.split(MEANING_SEPARATORS)) {
      const normalized = normalizeJapaneseAnswer(part);
      if (normalized) candidates.add(normalized);
    }
  }

  return [...candidates];
}

/** 意味を持つ最小限の単語形。judging に必要な項目だけ受け取る。 */
export interface WordMeaningsSource {
  japanese: string;
  translations?: ReadonlyArray<{ translationJa: string }>;
}

/**
 * 判定・ヒントに使う「その単語の意味すべて」を1つの文字列にまとめる。
 *
 * 単語には主たる訳 (japanese) のほかに訳が複数ぶら下がることがあり、
 * 主たる訳だけで突き合わせると、2つ目以降の意味を正しく答えても不正解に
 * なってしまう。ここで全部つないでおけば、この先の処理は今まで通り
 * 区切り文字で割るだけで意味ごとの判定になる (「気づく、悟る」のように
 * 1つの訳の中で「、」で並んでいる場合も同じ扱いで割れる)。
 */
export function combineWordMeanings(word: WordMeaningsSource): string {
  const meanings: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = normalizeJapaneseAnswer(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    meanings.push(trimmed);
  };

  // 主たる訳を先頭に置く。ヒントは上限で切られるので、優先度が効く。
  add(word.japanese);
  for (const translation of word.translations ?? []) add(translation.translationJa);

  return meanings.join('、');
}

/**
 * 認識APIに渡せるヒントの数。
 * 訳が「A、B、C…」と長く並ぶ単語では候補がいくらでも増えるので、
 * ここで頭打ちにしないとリクエストが弾かれて認識そのものが失敗する。
 */
export const MAX_ANSWER_HINTS = 8;

/**
 * 音声認識に渡すヒント語。
 *
 * 比較用の候補 (japaneseAnswerCandidates) は正規化で長音やカタカナを畳んでおり
 * 「コーヒー」が「こひ」になってしまうため、ヒントには使えない。
 * ここでは区切りだけ分けて、表記はそのまま残す。
 *
 * 読み (japaneseAnswerReadingForms) を引くときのキーにもなるので、
 * クライアントとサーバーで同じ文字列が出るようこの関数だけを通す。
 */
export function japaneseAnswerHints(japanese: string): string[] {
  const hints = new Set<string>();

  // 括弧の記号が混じったままだと、認識のヒントとしては使いものにならない。
  // 中身を残した形と、括弧書きごと落とした形の両方を渡す。
  for (const source of [japanese.replace(BRACKET_CHARACTERS, ''), stripParentheticals(japanese)]) {
    for (const part of source.split(MEANING_SEPARATORS)) {
      const trimmed = part.replace(/\s+/g, ' ').trim();
      if (trimmed) hints.add(trimmed);
    }
  }

  return [...hints].slice(0, MAX_ANSWER_HINTS);
}

/**
 * 表記 → 読み(ひらがな) の対応表。
 *
 * 音読の答え合わせは本来「音が合っているか」を見たいのに、認識結果は漢字に
 * 変換されて返るので、正しく発音していても表記が割れて不正解になる
 * (「恩赦」が「御社」、「コケ」が「苔」)。読みが分かっている語は読みでも
 * 突き合わせて、この取りこぼしを拾う。
 *
 * 読みは `/api/voice-quiz/recognize` が必要なときだけ引いて返す。
 * 引けなかった語は表記だけで判定するので、無くても今まで通り動く。
 */
export type JapaneseReadings = Readonly<Record<string, string>>;

/** 対応表から読みを引く。サーバーに渡した文字列そのものがキーになる。 */
function lookupReading(text: string, readings?: JapaneseReadings): string | undefined {
  if (!readings) return undefined;
  return readings[text] ?? readings[text.trim()];
}

/**
 * 突き合わせに使う形を畳んで返す。
 * 表記そのものと、分かっていればその読みの両方を候補にする。
 */
function comparableForms(text: string, readings?: JapaneseReadings): string[] {
  const forms = new Set<string>();

  const surface = normalizeJapaneseAnswer(text);
  if (surface) forms.add(surface);

  const reading = lookupReading(text, readings);
  if (reading) {
    const normalized = normalizeJapaneseAnswer(reading);
    if (normalized) forms.add(normalized);
  }

  return [...forms];
}

/**
 * 登録されている訳の、突き合わせ可能な形すべて。
 * 表記から作った候補に、読みが分かっているものを足す。
 */
export function japaneseAnswerReadingForms(
  japanese: string,
  readings?: JapaneseReadings,
): string[] {
  const forms = new Set<string>(japaneseAnswerCandidates(japanese));

  if (readings) {
    for (const hint of japaneseAnswerHints(japanese)) {
      for (const form of comparableForms(hint, readings)) forms.add(form);
    }
  }

  return [...forms];
}

/**
 * 一方がもう一方を含み、かつ短いほうが長いほうの半分以上あれば正解扱いにする。
 * 「入念に作り上げる」に対して「作り上げる」だけ答えた場合を拾うため。
 * 長さの下限を置かないと「する」だけで通ってしまうので 2 文字未満は弾く。
 */
function isCloseEnough(said: string, candidate: string): boolean {
  if (said === candidate) return true;

  const [shorter, longer] =
    said.length <= candidate.length ? [said, candidate] : [candidate, said];

  if (shorter.length < 2) return false;
  if (!longer.includes(shorter)) return false;
  return shorter.length * 2 >= longer.length;
}

/**
 * 音声認識の結果が、その単語の日本語訳として妥当かを判定する。
 *
 * @param transcript 認識されたユーザーの発話
 * @param japanese   単語に登録されている日本語訳
 * @param readings   表記→読みの対応表 (あれば読みでも突き合わせる)
 */
export function isJapaneseAnswerCorrect(
  transcript: string,
  japanese: string,
  readings?: JapaneseReadings,
): boolean {
  const said = comparableForms(transcript, readings);
  if (said.length === 0) return false;

  const candidates = japaneseAnswerReadingForms(japanese, readings);
  return said.some((form) => candidates.some((candidate) => isCloseEnough(form, candidate)));
}

/**
 * 音声認識が返した候補のどれかが正解なら正解とみなす。
 *
 * 日本語は同音異義語が多く、正しく発音していても最有力の変換が別の漢字に
 * なることがある (「きづく」→「築く」/「気づく」)。まず認識側から複数の変換候補を
 * 受け取り、その中に正しい表記があれば拾う。それでも表記が割れる
 * (「恩赦」→「御社」/「コケ」→「苔」) ぶんは、readings があれば読みで突き合わせる。
 * 音が違う語は同じ読みにならないので、これで正解が甘くなることはない。
 */
export function isAnyJapaneseAnswerCorrect(
  transcripts: readonly string[],
  japanese: string,
  readings?: JapaneseReadings,
): boolean {
  return transcripts.some((transcript) =>
    isJapaneseAnswerCorrect(transcript, japanese, readings),
  );
}

// ============ 日→英 (英単語を答える) ============

/**
 * 英語の答えを比較用に畳む。
 * 認識結果には句読点や語間の揺れが混ざるので、英数字と1つの空白だけに落とす。
 */
export function normalizeEnglishAnswer(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * 綴りの側にも「take (after)」のような補足が入っていることがある。
 * 括弧の中まで言わないと不正解、では厳しすぎるので、落とした形も認める。
 */
export function englishAnswerCandidates(english: string): string[] {
  const candidates = new Set<string>();

  for (const source of [english, stripParentheticals(english)]) {
    const normalized = normalizeEnglishAnswer(source);
    if (normalized) candidates.add(normalized);
  }

  return [...candidates];
}

/** 認識結果が、その単語の綴りとして妥当かを判定する。 */
export function isEnglishAnswerCorrect(transcript: string, english: string): boolean {
  const said = normalizeEnglishAnswer(transcript);
  return said.length > 0 && englishAnswerCandidates(english).includes(said);
}

/**
 * 候補のどれかが正解なら正解とみなす。
 * 英語でも "to elaborate" と "elaborate" のように候補が割れることがある。
 */
export function isAnyEnglishAnswerCorrect(
  transcripts: readonly string[],
  english: string,
): boolean {
  return transcripts.some((transcript) => isEnglishAnswerCorrect(transcript, english));
}
