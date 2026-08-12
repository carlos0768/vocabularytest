/**
 * 音読チャレンジ (/voice-quiz) の出題ナレーション。
 *
 * 出題文の「枠」は単語に依存しない ——「〜って、どういう意味かな?」の 〜 の部分に
 * 英単語を差し込むだけなので、単語ごとにAIで生成してDBへ持つ必要がない。
 * 定型文を複数用意して問題ごとにローテーションさせることで、
 * AI呼び出しゼロ・DB列ゼロ・待ち時間ゼロのまま読み上げの単調さを避ける。
 *
 * 出題文には日本語訳（正解）を絶対に含めない。英単語だけから組み立てているので、
 * 構造上、答えが漏れる経路が存在しない。
 */

/** テンプレート内で英単語に置き換わる位置。 */
export const VOICE_QUIZ_WORD_PLACEHOLDER = '{word}';

/**
 * 英→日の出題文。英単語を文の途中に挟んだ、読み上げて自然な日本語1文にする。
 * 単語を文末に置くと「単語 → 質問」と切れて聞こえるので、必ず前後に日本語が残る
 * 形にしてある (buildVoiceQuizMeaningPrompt がこれを前提に分割する)。
 */
export const VOICE_QUIZ_MEANING_PROMPT_TEMPLATES: readonly string[] = [
  `${VOICE_QUIZ_WORD_PLACEHOLDER} って、どういう意味かな?`,
  `では ${VOICE_QUIZ_WORD_PLACEHOLDER} の意味を日本語で答えてください。`,
  `${VOICE_QUIZ_WORD_PLACEHOLDER} は日本語でどういう意味でしょう?`,
  `次の単語、${VOICE_QUIZ_WORD_PLACEHOLDER} の意味は分かるかな?`,
  `${VOICE_QUIZ_WORD_PLACEHOLDER} を日本語にすると、どうなる?`,
  `さて、${VOICE_QUIZ_WORD_PLACEHOLDER} ってどんな意味だったかな?`,
  `${VOICE_QUIZ_WORD_PLACEHOLDER} という単語の意味を教えてください。`,
  `この単語、${VOICE_QUIZ_WORD_PLACEHOLDER} の意味を日本語で言ってみて。`,
];

/** 読み上げの一区切り。英単語だけ英語の声に切り替えるために言語を持つ。 */
export interface VoiceQuizPromptSegment {
  text: string;
  lang: 'ja' | 'en';
}

/** 間違えたときに、もう一度promptするための掛け声。 */
export const VOICE_QUIZ_RETRY_TEMPLATES: readonly string[] = [
  'もう一回!',
  'おしい! もう一度。',
  'ちがうよ。もう一回!',
  'もう一度どうぞ。',
];

function rotate(templates: readonly string[], index: number): string {
  const count = templates.length;
  const safeIndex = Number.isFinite(index) ? Math.floor(index) : 0;
  return templates[((safeIndex % count) + count) % count];
}

/**
 * 英→日の出題文を、読み上げ用のセグメントに分けて組み立てる。
 *
 * 英単語を日本語の声で読ませると別物に聞こえるので、テンプレートを
 * プレースホルダで割って「日本語 → 英単語 → 日本語」の3片にする。
 * 呼び出し側はこれを順に読み上げるだけで、1文の途中だけ声が変わる。
 *
 * @param word  出題する英単語
 * @param index 問題の通し番号。テンプレートのローテーションに使う
 */
export function buildVoiceQuizMeaningPrompt(
  word: string,
  index: number,
): VoiceQuizPromptSegment[] {
  const template = rotate(VOICE_QUIZ_MEANING_PROMPT_TEMPLATES, index);
  const placeholderAt = template.indexOf(VOICE_QUIZ_WORD_PLACEHOLDER);
  const trimmedWord = word.trim();

  // プレースホルダが無いテンプレートが紛れ込んでも、単語だけは必ず読み上げる。
  if (placeholderAt < 0) {
    return [
      { text: trimmedWord, lang: 'en' },
      { text: template, lang: 'ja' },
    ].filter((segment) => segment.text.length > 0) as VoiceQuizPromptSegment[];
  }

  const before = template.slice(0, placeholderAt);
  const after = template.slice(placeholderAt + VOICE_QUIZ_WORD_PLACEHOLDER.length);

  return [
    { text: before.trim(), lang: 'ja' as const },
    { text: trimmedWord, lang: 'en' as const },
    { text: after.trim(), lang: 'ja' as const },
  ].filter((segment) => segment.text.length > 0);
}

/** 出題文を画面に出すときの表示用テキスト (読み上げと同じ並び)。 */
export function voiceQuizPromptToText(segments: VoiceQuizPromptSegment[]): string {
  return segments.map((segment) => segment.text).join(' ');
}

/** 再挑戦を促す掛け声を選ぶ。 */
export function pickVoiceQuizRetryPrompt(index: number): string {
  return rotate(VOICE_QUIZ_RETRY_TEMPLATES, index);
}

/** セッションごとに開始テンプレートをずらし、毎回同じ文で始まらないようにする。 */
export function randomVoiceQuizPromptOffset(
  random: () => number = Math.random,
): number {
  return Math.floor(random() * VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length);
}

// ============ 試行回数 (attempts) ============

export const MIN_VOICE_QUIZ_ATTEMPTS = 1;
export const MAX_VOICE_QUIZ_ATTEMPTS = 3;
export const DEFAULT_VOICE_QUIZ_ATTEMPTS = 1;

/** 選択肢として並べる試行回数。 */
export const VOICE_QUIZ_ATTEMPT_OPTIONS: readonly number[] = [1, 2, 3];

// ============ 出題数 (count) ============

export const DEFAULT_VOICE_QUIZ_COUNT = 10;
export const MAX_VOICE_QUIZ_COUNT = 100;

/**
 * 通常クイズから引き継いだ `?count=` を 1〜MAX に丸める。
 * 未指定・不正な値は既定値に落とす (実際の出題数は単語数でさらに切り詰められる)。
 */
export function resolveVoiceQuizCount(raw: string | null | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_VOICE_QUIZ_COUNT;
  return Math.min(parsed, MAX_VOICE_QUIZ_COUNT);
}

/** 外から来た試行回数を 1〜3 に丸める。 */
export function normalizeVoiceQuizAttempts(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_VOICE_QUIZ_ATTEMPTS;
  const floored = Math.floor(parsed);
  if (floored < MIN_VOICE_QUIZ_ATTEMPTS) return MIN_VOICE_QUIZ_ATTEMPTS;
  if (floored > MAX_VOICE_QUIZ_ATTEMPTS) return MAX_VOICE_QUIZ_ATTEMPTS;
  return floored;
}

/**
 * 不正解だったときに、まだ再挑戦できるかを判定する。
 *
 * @param attemptsUsed   これまでに使った試行回数 (1始まり)
 * @param attemptsAllowed 設定された試行回数 (1〜3)
 */
export function canRetryVoiceQuiz(attemptsUsed: number, attemptsAllowed: number): boolean {
  return attemptsUsed < normalizeVoiceQuizAttempts(attemptsAllowed);
}
