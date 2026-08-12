/**
 * 音読チャレンジ (/voice-quiz) の出題ナレーション。
 *
 * 出題文の「枠」は単語に依存しない ——「〜という意味の単語、英語で何と言う?」の
 * 〜の部分に日本語訳を差し込むだけなので、単語ごとにAIで生成してDBへ持つ必要がない。
 * 定型文を複数用意して問題ごとにローテーションさせることで、
 * AI呼び出しゼロ・DB列ゼロ・待ち時間ゼロのまま読み上げの単調さを避ける。
 *
 * 出題文には英単語（正解）を絶対に含めない。日本語訳だけから組み立てているので、
 * 構造上スペルが漏れる経路が存在しない。
 */

/** テンプレート内で日本語訳に置き換わる位置。 */
export const VOICE_QUIZ_MEANING_PLACEHOLDER = '{meaning}';

/**
 * 保護者が口頭で出題するときの言い回し。
 * 読み上げて自然な長さに保ち、必ず英語での回答を促す一言で締める。
 */
export const VOICE_QUIZ_PROMPT_TEMPLATES: readonly string[] = [
  `「${VOICE_QUIZ_MEANING_PLACEHOLDER}」という意味の単語、英語で何と言う?`,
  `「${VOICE_QUIZ_MEANING_PLACEHOLDER}」を英語で言うと?`,
  `次の意味に当てはまる英単語は? 「${VOICE_QUIZ_MEANING_PLACEHOLDER}」`,
  `「${VOICE_QUIZ_MEANING_PLACEHOLDER}」。これを英語で答えてください。`,
  `英語で何と言うでしょう? 「${VOICE_QUIZ_MEANING_PLACEHOLDER}」`,
  `「${VOICE_QUIZ_MEANING_PLACEHOLDER}」という意味の英単語を答えてください。`,
  `では次です。「${VOICE_QUIZ_MEANING_PLACEHOLDER}」を英語で。`,
  `「${VOICE_QUIZ_MEANING_PLACEHOLDER}」にあたる英単語は何でしょう?`,
];

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
 * 出題文を組み立てる。
 *
 * @param meaning 読み上げる日本語訳
 * @param index   問題の通し番号。テンプレートをローテーションさせるために使う
 *                (負値や小数が来ても必ず有効なテンプレートに落ちる)
 */
export function buildVoiceQuizPrompt(meaning: string, index: number): string {
  return rotate(VOICE_QUIZ_PROMPT_TEMPLATES, index)
    .replaceAll(VOICE_QUIZ_MEANING_PLACEHOLDER, meaning.trim());
}

/** 再挑戦を促す掛け声を選ぶ。 */
export function pickVoiceQuizRetryPrompt(index: number): string {
  return rotate(VOICE_QUIZ_RETRY_TEMPLATES, index);
}

/** セッションごとに開始テンプレートをずらし、毎回同じ文で始まらないようにする。 */
export function randomVoiceQuizPromptOffset(
  random: () => number = Math.random,
): number {
  return Math.floor(random() * VOICE_QUIZ_PROMPT_TEMPLATES.length);
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
