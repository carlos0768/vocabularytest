'use client';

/**
 * 音読チャレンジの読み上げ。
 *
 * 固定文は事前生成した自然な音声を鳴らし、単語のように毎回変わるものは
 * これまでどおりブラウザの合成音声で読む。呼び出し側はどちらか意識しない。
 * 音声そのものの鳴らし方は `voice-quiz-clips.ts` を見ること。
 *
 * ここでの絶対条件は「必ず終わること」。読み上げの完了待ちで止まると、
 * 呼び出し側は次の処理 (録音の開始) に進めず、クイズが始まらないまま
 * 固まって見える。音声が鳴らないより、鳴らずに先へ進むほうが良い。
 * そのため、
 *   - 再生が始まらない / 終わらないときは打ち切る
 *   - 外から止められたときも待っている側を必ず解放する
 * の2つを保証する。
 */

import { speakAndWait, type SpeechLang } from '@/lib/speech';
import { voiceQuizAudioIndex } from './voice-quiz-audio';
import {
  playVoiceQuizClip,
  prefetchVoiceQuizClips,
  primeVoiceQuizClips,
  stopVoiceQuizClips,
} from './voice-quiz-clips';

export { playbackTimeoutMs } from './voice-quiz-clips';

/**
 * 画面を開いた時点の下ごしらえ。固定文の音声を先に取ってきておく。
 * 再生のたびにネットワークを待つと、その待ちがそのまま出題の遅れになる。
 */
export function prefetchVoiceQuizAudio(): void {
  prefetchVoiceQuizClips();
}

/**
 * 開始ボタンなど、ユーザー操作の中で呼ぶ。以降の再生を許可させる。
 * これを通さないと、インストール済みPWAでは事前生成の音声が丸ごと弾かれ、
 * 全部が合成音声で読まれる。
 */
export function primeVoiceQuizAudio(): void {
  primeVoiceQuizClips();
}

/** 再生中の音声を止める。待っている側は解放する。 */
export function stopVoiceQuizAudio(): void {
  stopVoiceQuizClips();
}

/** 文言 → 音声ファイルの索引。1度だけ組み立てる。 */
let audioIndex: Map<string, string> | null = null;

function urlForText(text: string): string | null {
  if (!audioIndex) audioIndex = voiceQuizAudioIndex();
  return audioIndex.get(text.trim()) ?? null;
}

/**
 * 合成音声に回した文言。同じ文で何度も警告しないために覚えておく。
 */
const reportedFallbacks = new Set<string>();

/**
 * 合成音声で読んだことを知らせる。
 *
 * 単語や訳が合成音声なのは設計どおりだが、固定文がそうなっているのは
 * 台本と音声のズレか再生の失敗で、耳で気づくしかなかった。どの文が落ちたのかを出す。
 */
function reportFallback(text: string, indexed: boolean): void {
  if (reportedFallbacks.has(text)) return;
  reportedFallbacks.add(text);
  console.warn(
    indexed
      ? `[voice-quiz] 事前生成の音声を再生できず合成音声で読みました: 「${text}」(mp3が未生成か、読み込めていません)`
      : `[voice-quiz] 台本に無いので合成音声で読みました: 「${text}」`,
  );
}

/**
 * 1片を読み上げて、読み終わるまで待つ。
 * 固定文なら事前生成の音声、無ければ合成音声。
 */
export async function speakVoiceQuiz(
  text: string,
  lang: SpeechLang,
  options?: { variable?: boolean },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const url = urlForText(trimmed);
  if (url && (await playVoiceQuizClip(url))) return;

  // 単語や訳が合成音声なのは設計どおりなので、知らせる価値があるのは固定文だけ。
  if (!options?.variable) reportFallback(trimmed, url !== null);
  await speakAndWait(trimmed, lang);
}
