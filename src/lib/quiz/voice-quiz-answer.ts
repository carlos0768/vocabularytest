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
  const parts = japanese.split(MEANING_SEPARATORS);
  const candidates = new Set<string>();

  for (const part of parts) {
    const normalized = normalizeJapaneseAnswer(part);
    if (normalized) candidates.add(normalized);

    // 括弧を外した形でも答えられるようにする。
    const withoutParenthetical = normalizeJapaneseAnswer(
      part.replace(/[（(][^）)]*[）)]/g, ''),
    );
    if (withoutParenthetical) candidates.add(withoutParenthetical);
  }

  return [...candidates];
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
 */
export function isJapaneseAnswerCorrect(transcript: string, japanese: string): boolean {
  const said = normalizeJapaneseAnswer(transcript);
  if (!said) return false;

  return japaneseAnswerCandidates(japanese).some((candidate) =>
    isCloseEnough(said, candidate),
  );
}
