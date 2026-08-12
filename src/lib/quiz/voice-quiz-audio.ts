/**
 * 音読チャレンジで読み上げる「固定の文」の一覧と、その音声の置き場所。
 *
 * 出題文の枠・掛け声・正解/不正解のアナウンスは単語に依存しないので、
 * 毎回ブラウザの合成音声で読ませる必要がない。あらかじめ Text-to-Speech で
 * 作った自然な音声を置いておき、それを再生する。
 *
 * ここが唯一の台本 —— 生成スクリプト (scripts/generate-voice-quiz-audio.mjs) と
 * 再生側の両方がこの一覧を参照する。文言を足したり直したりしたら、
 * スクリプトを流し直して音声を作り直すこと。作り直すまでは、
 * 音声が見つからないものだけ従来の合成音声にフォールバックする。
 *
 * 単語そのもの (英単語・日本語訳) は語彙の数だけあるので対象外。
 * こちらは今までどおり合成音声で読む。
 */

import {
  VOICE_QUIZ_ANSWER_PREFIX,
  VOICE_QUIZ_ANSWER_SUFFIX,
  VOICE_QUIZ_MEANING_PROMPT_TEMPLATES,
  VOICE_QUIZ_RETRY_TEMPLATES,
  VOICE_QUIZ_WORD_PLACEHOLDER,
} from './voice-quiz-prompt';

/** 生成した音声を置くディレクトリ (public 配下)。 */
export const VOICE_QUIZ_AUDIO_DIR = '/audio/voice-quiz';

export interface VoiceQuizAudioClip {
  /** ファイル名に使う安定した識別子。 */
  id: string;
  /** 読み上げる文言。 */
  text: string;
  lang: 'ja' | 'en';
}

/** 結果のアナウンス。効果音だけでは何が起きたか耳で分からない。 */
export const VOICE_QUIZ_RESULT_ANNOUNCEMENTS = {
  correct: '正解!',
  incorrect: '不正解。',
  disqualified: '時間切れです。',
  gaveUp: '答えを見てみましょう。',
} as const;

export type VoiceQuizResultKey = keyof typeof VOICE_QUIZ_RESULT_ANNOUNCEMENTS;

/**
 * 英→日の出題文から、単語を挟む前後の固定部分だけを取り出す。
 * 「この単語、」「の意味を日本語で言ってみて。」のような断片になる。
 */
function meaningPromptFragments(): VoiceQuizAudioClip[] {
  const clips: VoiceQuizAudioClip[] = [];

  VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.forEach((template, index) => {
    const at = template.indexOf(VOICE_QUIZ_WORD_PLACEHOLDER);
    if (at < 0) return;

    const before = template.slice(0, at).trim();
    const after = template.slice(at + VOICE_QUIZ_WORD_PLACEHOLDER.length).trim();

    if (before) clips.push({ id: `prompt-${index}-before`, text: before, lang: 'ja' });
    if (after) clips.push({ id: `prompt-${index}-after`, text: after, lang: 'ja' });
  });

  return clips;
}

/** 事前生成する固定文のすべて。 */
export function voiceQuizAudioClips(): VoiceQuizAudioClip[] {
  return [
    ...meaningPromptFragments(),
    ...VOICE_QUIZ_RETRY_TEMPLATES.map((text, index) => ({
      id: `retry-${index}`,
      text,
      lang: 'ja' as const,
    })),
    { id: 'answer-prefix', text: VOICE_QUIZ_ANSWER_PREFIX, lang: 'ja' },
    { id: 'answer-suffix', text: VOICE_QUIZ_ANSWER_SUFFIX, lang: 'ja' },
    ...Object.entries(VOICE_QUIZ_RESULT_ANNOUNCEMENTS).map(([key, text]) => ({
      id: `result-${key}`,
      text,
      lang: 'ja' as const,
    })),
  ];
}

/** 文言から音声ファイルを引くための索引。同じ文言は1つの音声を共有する。 */
export function voiceQuizAudioIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const clip of voiceQuizAudioClips()) {
    // 先勝ち。同じ文言が複数のテンプレートに出ても音声は1つでよい。
    if (!index.has(clip.text)) index.set(clip.text, `${VOICE_QUIZ_AUDIO_DIR}/${clip.id}.mp3`);
  }
  return index;
}
