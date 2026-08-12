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
  buildVoiceQuizAnswerAnnouncement,
  buildVoiceQuizPromptFor,
  VOICE_QUIZ_MEANING_PROMPT_TEMPLATES,
  VOICE_QUIZ_RETRY_TEMPLATES,
  VOICE_QUIZ_WORD_PROMPT_TEMPLATES,
  type VoiceQuizDirection,
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
} as const;

export type VoiceQuizResultKey = keyof typeof VOICE_QUIZ_RESULT_ANNOUNCEMENTS;

/**
 * 差し替え位置の目印。実際の語彙と衝突しない文字列を入れて組み立て、
 * これ以外の断片＝単語に依存しない固定部分、として拾う。
 */
const SAMPLE_WORD = { english: '\u0000EN\u0000', japanese: '\u0000JA\u0000' };

function isSampleText(text: string): boolean {
  return text === SAMPLE_WORD.english || text === SAMPLE_WORD.japanese;
}

/**
 * 出題文の固定部分を、実際に読み上げるビルダーから取り出す。
 *
 * ここでテンプレートを切り直すと、ビルダー側の切り方が変わったときに
 * 静かに食い違って「音声を用意したのに使われない」状態になる
 * (実際にそれで合成音声が残った)。組み立てた結果だけを見る。
 */
function promptFragments(
  direction: VoiceQuizDirection,
  templateCount: number,
  idPrefix: string,
): VoiceQuizAudioClip[] {
  const clips: VoiceQuizAudioClip[] = [];

  for (let index = 0; index < templateCount; index += 1) {
    buildVoiceQuizPromptFor(direction, SAMPLE_WORD, index).forEach((segment, position) => {
      if (isSampleText(segment.text)) return;
      clips.push({ id: `${idPrefix}-${index}-${position}`, text: segment.text, lang: segment.lang });
    });
  }

  return clips;
}

/** 「正解は、」「です。」など、正解を知らせる文の固定部分。 */
function answerAnnouncementFragments(): VoiceQuizAudioClip[] {
  const clips: VoiceQuizAudioClip[] = [];

  for (const direction of ['en-to-ja', 'ja-to-en'] as const) {
    buildVoiceQuizAnswerAnnouncement(direction, SAMPLE_WORD).forEach((segment, position) => {
      if (isSampleText(segment.text)) return;
      clips.push({ id: `answer-${direction}-${position}`, text: segment.text, lang: segment.lang });
    });
  }

  return clips;
}

/** 事前生成する固定文のすべて。 */
export function voiceQuizAudioClips(): VoiceQuizAudioClip[] {
  const clips = [
    ...promptFragments('en-to-ja', VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length, 'prompt'),
    ...promptFragments('ja-to-en', VOICE_QUIZ_WORD_PROMPT_TEMPLATES.length, 'word-prompt'),
    ...VOICE_QUIZ_RETRY_TEMPLATES.map((text, index) => ({
      id: `retry-${index}`,
      text,
      lang: 'ja' as const,
    })),
    ...answerAnnouncementFragments(),
    ...Object.entries(VOICE_QUIZ_RESULT_ANNOUNCEMENTS).map(([key, text]) => ({
      id: `result-${key}`,
      text,
      lang: 'ja' as const,
    })),
  ];

  // 同じ文言が複数のテンプレートに出ることがある。音声は1つでよい。
  const seen = new Set<string>();
  return clips.filter((clip) => {
    if (seen.has(clip.text)) return false;
    seen.add(clip.text);
    return true;
  });
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
