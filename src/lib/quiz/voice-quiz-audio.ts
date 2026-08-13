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
  /** ファイル名に使う識別子。文言から導くので、並び順を変えても変わらない。 */
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
 * 文言から音声ファイル名を導く。
 *
 * 以前は「何番目のテンプレートの前half」といった位置で名前を付けていたが、
 * テンプレートを1つ足しただけで全部の名前がずれ、生成済みの音声が丸ごと
 * 使われなくなった。文言そのものから決めれば、変えた文だけが作り直しになる。
 */
function clipId(text: string): string {
  // FNV-1a。暗号用途ではなく、短い文言を安定した名前に落とすだけ。
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * 差し込み位置に入れる仮の語。実際の語彙と衝突しない文字列にしておく。
 * どの断片が単語ぶんかは、組み立てた側が `variable` で教えてくれる。
 */
const SAMPLE_WORD = { english: '\u0000EN\u0000', japanese: '\u0000JA\u0000' };

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
): VoiceQuizAudioClip[] {
  const clips: VoiceQuizAudioClip[] = [];

  for (let index = 0; index < templateCount; index += 1) {
    buildVoiceQuizPromptFor(direction, SAMPLE_WORD, index).forEach((segment) => {
      if (segment.variable) return;
      clips.push({ id: clipId(segment.text), text: segment.text, lang: segment.lang });
    });
  }

  return clips;
}

/** 「正解は、」「です。」など、正解を知らせる文の固定部分。 */
function answerAnnouncementFragments(): VoiceQuizAudioClip[] {
  const clips: VoiceQuizAudioClip[] = [];

  for (const direction of ['en-to-ja', 'ja-to-en'] as const) {
    buildVoiceQuizAnswerAnnouncement(direction, SAMPLE_WORD).forEach((segment) => {
      if (segment.variable) return;
      clips.push({ id: clipId(segment.text), text: segment.text, lang: segment.lang });
    });
  }

  return clips;
}

/** 事前生成する固定文のすべて。 */
export function voiceQuizAudioClips(): VoiceQuizAudioClip[] {
  const clips = [
    ...promptFragments('en-to-ja', VOICE_QUIZ_MEANING_PROMPT_TEMPLATES.length),
    ...promptFragments('ja-to-en', VOICE_QUIZ_WORD_PROMPT_TEMPLATES.length),
    ...VOICE_QUIZ_RETRY_TEMPLATES.map((text) => ({
      id: clipId(text),
      text,
      lang: 'ja' as const,
    })),
    ...answerAnnouncementFragments(),
    ...Object.values(VOICE_QUIZ_RESULT_ANNOUNCEMENTS).map((text) => ({
      id: clipId(text),
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
