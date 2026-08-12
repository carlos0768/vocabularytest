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

/**
 * 出題の向き。
 * - `en-to-ja`: 英単語を出して、意味を日本語で答えさせる
 * - `ja-to-en`: 日本語の意味を読み上げて、英単語を答えさせる
 */
export type VoiceQuizDirection = 'en-to-ja' | 'ja-to-en';

export const DEFAULT_VOICE_QUIZ_DIRECTION: VoiceQuizDirection = 'en-to-ja';

export function isVoiceQuizDirection(value: unknown): value is VoiceQuizDirection {
  return value === 'en-to-ja' || value === 'ja-to-en';
}

/** 向きごとの音声認識の言語。答えを話す側の言語になる。 */
export function recognitionLanguageFor(direction: VoiceQuizDirection): 'ja-JP' | 'en-US' {
  return direction === 'en-to-ja' ? 'ja-JP' : 'en-US';
}

/** テンプレート内で英単語に置き換わる位置。 */
export const VOICE_QUIZ_WORD_PLACEHOLDER = '{word}';

/** テンプレート内で日本語訳に置き換わる位置。 */
export const VOICE_QUIZ_MEANING_PLACEHOLDER = '{meaning}';

/**
 * 日→英の出題文。読み上げるのは日本語訳だけで、英単語(正解)は出てこない。
 * 全体が日本語なので、英→日と違って声を切り替える必要がない。
 */
export const VOICE_QUIZ_WORD_PROMPT_TEMPLATES: readonly string[] = [
  `${VOICE_QUIZ_MEANING_PLACEHOLDER}。これを英語で何と言う?`,
  `${VOICE_QUIZ_MEANING_PLACEHOLDER}。英語で言うと?`,
  `次の意味に当てはまる英単語は? ${VOICE_QUIZ_MEANING_PLACEHOLDER}`,
  `${VOICE_QUIZ_MEANING_PLACEHOLDER}。これを英語で答えてください。`,
  `英語で何と言うでしょう? ${VOICE_QUIZ_MEANING_PLACEHOLDER}`,
  `${VOICE_QUIZ_MEANING_PLACEHOLDER}。この意味の英単語を答えてください。`,
  `では次です。${VOICE_QUIZ_MEANING_PLACEHOLDER}。英語で。`,
  `${VOICE_QUIZ_MEANING_PLACEHOLDER}。これにあたる英単語は何でしょう?`,
];

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

/**
 * 不正解・失格・「わからない」のあとに正解を知らせる文。
 * 答えの語だけが可変で、前後は固定なので、読み上げ音声を作り置きできる。
 */
export const VOICE_QUIZ_ANSWER_PREFIX = '正解は、';
export const VOICE_QUIZ_ANSWER_SUFFIX = 'です。';

/**
 * 「正解は、○○ です。」を読み上げ用のセグメントで組み立てる。
 * 日→英では答えが英単語なので、そこだけ英語の声に切り替える。
 */
export function buildVoiceQuizAnswerAnnouncement(
  direction: VoiceQuizDirection,
  word: { english: string; japanese: string },
): VoiceQuizPromptSegment[] {
  const answer = direction === 'en-to-ja' ? word.japanese.trim() : word.english.trim();
  if (!answer) return [];

  // 向きによらず前後を切り分ける。つなげて1文にすると、せっかく作り置きした
  // 「正解は、」「です。」に一致せず、文まるごと合成音声になってしまう。
  if (direction === 'en-to-ja') {
    return [
      { text: VOICE_QUIZ_ANSWER_PREFIX, lang: 'ja' },
      { text: answer, lang: 'ja' },
      { text: VOICE_QUIZ_ANSWER_SUFFIX, lang: 'ja' },
    ];
  }

  return [
    { text: VOICE_QUIZ_ANSWER_PREFIX, lang: 'ja' },
    { text: answer, lang: 'en' },
    { text: VOICE_QUIZ_ANSWER_SUFFIX, lang: 'ja' },
  ];
}

/** 間違えたときに、もう一度promptするための掛け声。 */
export const VOICE_QUIZ_RETRY_TEMPLATES: readonly string[] = [
  'もう一回!',
  'おしい! もう一度。',
  'ちがうよ。もう一回!',
  'もう一度どうぞ。',
];

/**
 * 読み上げる価値のある断片か。
 * テンプレートの切れ端が句読点やカギ括弧だけになることがあり、そのまま渡すと
 * 무音や不自然な読みになるうえ、音声を作る分だけ無駄になる。
 */
function trimFragment(text: string): string {
  // 差し込み位置の直後に残る句読点は、前の語で切れているので読ませない。
  return text.trim().replace(/^[、。，．\s]+/, '').trim();
}

function isSpeakable(text: string): boolean {
  return /[\p{Letter}\p{Number}]/u.test(text);
}

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
    { text: trimFragment(before), lang: 'ja' as const },
    { text: trimmedWord, lang: 'en' as const },
    { text: trimFragment(after), lang: 'ja' as const },
  ].filter((segment) => isSpeakable(segment.text));
}

/**
 * 日→英の出題文。全体が日本語だが、英→日と同じように意味の前後で切り分ける。
 * 固定部分は作り置きの音声で読めるので、合成音声になるのは日本語訳だけで済む。
 */
export function buildVoiceQuizWordPrompt(
  meaning: string,
  index: number,
): VoiceQuizPromptSegment[] {
  const template = rotate(VOICE_QUIZ_WORD_PROMPT_TEMPLATES, index);
  const at = template.indexOf(VOICE_QUIZ_MEANING_PLACEHOLDER);
  const trimmed = meaning.trim();

  if (at < 0) {
    return [{ text: template, lang: 'ja' }];
  }

  return [
    { text: trimFragment(template.slice(0, at)), lang: 'ja' as const },
    { text: trimmed, lang: 'ja' as const },
    { text: trimFragment(template.slice(at + VOICE_QUIZ_MEANING_PLACEHOLDER.length)), lang: 'ja' as const },
  ].filter((segment) => isSpeakable(segment.text));
}

/** 出題の向きに応じた読み上げを組み立てる。 */
export function buildVoiceQuizPromptFor(
  direction: VoiceQuizDirection,
  word: { english: string; japanese: string },
  index: number,
): VoiceQuizPromptSegment[] {
  return direction === 'en-to-ja'
    ? buildVoiceQuizMeaningPrompt(word.english, index)
    : buildVoiceQuizWordPrompt(word.japanese, index);
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

// ============ 解答時間 (duration) ============

export const MIN_VOICE_QUIZ_DURATION_SEC = 3;
/**
 * 上限。Cloud Speech-to-Text の同期認識は1分までなので、そこには十分収まる。
 * 実用上これ以上待たせても答えは出てこないという判断で60秒までは開けない。
 */
export const MAX_VOICE_QUIZ_DURATION_SEC = 30;
export const DEFAULT_VOICE_QUIZ_DURATION_SEC = 6;

/** 開始画面に並べる解答時間の選択肢 (秒)。これ以外は自分で入力する。 */
export const VOICE_QUIZ_DURATION_OPTIONS: readonly number[] = [4, 6, 10, 15];

/**
 * 外から来た解答時間を 4〜15秒 に丸める。
 * 未指定 (null/undefined/空文字) は既定値に落とす。`Number(null)` は 0 になるため、
 * ここで弾かないと「未指定」が最短の4秒として扱われてしまう。
 */
export function normalizeVoiceQuizDuration(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_VOICE_QUIZ_DURATION_SEC;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_VOICE_QUIZ_DURATION_SEC;
  const floored = Math.floor(parsed);
  if (floored < MIN_VOICE_QUIZ_DURATION_SEC) return MIN_VOICE_QUIZ_DURATION_SEC;
  if (floored > MAX_VOICE_QUIZ_DURATION_SEC) return MAX_VOICE_QUIZ_DURATION_SEC;
  return floored;
}

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
