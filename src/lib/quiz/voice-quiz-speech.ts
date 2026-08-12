'use client';

/**
 * 音読チャレンジの読み上げ。
 *
 * 固定文は事前生成した自然な音声を鳴らし、単語のように毎回変わるものは
 * これまでどおりブラウザの合成音声で読む。呼び出し側はどちらか意識しない。
 *
 * 音声ファイルがまだ無い/取得に失敗した場合は必ず合成音声に落ちる。
 * 生成スクリプトを流していない環境でもクイズは成立させる。
 */

import { speakAndWait, type SpeechLang } from '@/lib/speech';
import { voiceQuizAudioIndex } from './voice-quiz-audio';

/** 文言 → 音声ファイルの索引。1度だけ組み立てる。 */
let audioIndex: Map<string, string> | null = null;

function urlForText(text: string): string | null {
  if (!audioIndex) audioIndex = voiceQuizAudioIndex();
  return audioIndex.get(text.trim()) ?? null;
}

/**
 * 取得できないと分かった音声。
 * 未生成の環境で毎回404を取りに行かないよう、一度失敗したら覚えておく。
 */
const unavailable = new Set<string>();

/** いま鳴っている事前生成音声。次を鳴らす前に止める。 */
let current: HTMLAudioElement | null = null;

export function stopVoiceQuizAudio(): void {
  if (!current) return;
  try {
    current.pause();
    current.currentTime = 0;
  } catch {
    // 再生前に止めた場合など。放っておいてよい。
  }
  current = null;
}

/** 事前生成の音声を鳴らし、鳴らし終えたら true。鳴らせなければ false。 */
async function playClip(url: string): Promise<boolean> {
  if (typeof Audio === 'undefined' || unavailable.has(url)) return false;

  // 前の一片がまだ鳴っていれば止める。合成音声側は speakInternal が
  // 自分でキャンセルするので、事前生成音声もそれに揃える。
  stopVoiceQuizAudio();

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (!ok) unavailable.add(url);
      if (current === audio) current = null;
      resolve(ok);
    };

    const audio = new Audio(url);
    current = audio;
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);

    audio.play().catch(() => {
      // 自動再生がユーザー操作より前に来た場合など。合成音声に任せる。
      finish(false);
    });
  });
}

/**
 * 1片を読み上げて、読み終わるまで待つ。
 * 固定文なら事前生成の音声、無ければ合成音声。
 */
export async function speakVoiceQuiz(text: string, lang: SpeechLang): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const url = urlForText(trimmed);
  if (url && (await playClip(url))) return;

  await speakAndWait(trimmed, lang);
}
