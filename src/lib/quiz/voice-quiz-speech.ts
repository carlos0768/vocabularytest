'use client';

/**
 * 音読チャレンジの読み上げ。
 *
 * 固定文は事前生成した自然な音声を鳴らし、単語のように毎回変わるものは
 * これまでどおりブラウザの合成音声で読む。呼び出し側はどちらか意識しない。
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

/** 再生が始まるまでの猶予。これを過ぎたら鳴らないものとして合成音声に回す。 */
const PLAY_START_TIMEOUT_MS = 1500;

/**
 * 鳴り始めたあと、鳴り終わるのを待つ上限。
 * 読み上げるのは一息ぶんの短い文なので、これを超えるのは異常。
 */
const PLAY_END_TIMEOUT_MS = 12_000;

/** 文言 → 音声ファイルの索引。1度だけ組み立てる。 */
let audioIndex: Map<string, string> | null = null;

function urlForText(text: string): string | null {
  if (!audioIndex) audioIndex = voiceQuizAudioIndex();
  return audioIndex.get(text.trim()) ?? null;
}

/**
 * 鳴らせないと分かった音声。
 * 未生成・破損・再生できない環境で毎回待たされないよう、一度諦めたら覚えておく。
 */
const unavailable = new Set<string>();

/** いま鳴っている音声と、それを待っている側を解放する手段。 */
let current: { audio: HTMLAudioElement; abandon: () => void } | null = null;

/**
 * 再生を止める。待っている側は「鳴らし終えた」扱いで解放する ——
 * ここで解決し損ねると、読み上げループが永久に待ち続けて先へ進めなくなる。
 */
export function stopVoiceQuizAudio(): void {
  const playing = current;
  if (!playing) return;
  current = null;

  try {
    playing.audio.pause();
    playing.audio.currentTime = 0;
  } catch {
    // 再生前に止めた場合など。放っておいてよい。
  }
  playing.abandon();
}

/**
 * 事前生成の音声を鳴らす。
 * 鳴らし切れたか、あるいは途中で止められたら true。
 * 鳴らせなかった (未生成・失敗・始まらない) 場合だけ false を返し、
 * 呼び出し側が合成音声に回せるようにする。
 */
async function playClip(url: string): Promise<boolean> {
  if (typeof Audio === 'undefined' || unavailable.has(url)) return false;

  // 前の一片がまだ鳴っていれば止める。合成音声側は speakInternal が
  // 自分でキャンセルするので、事前生成音声もそれに揃える。
  stopVoiceQuizAudio();

  return new Promise<boolean>((resolve) => {
    const audio = new Audio(url);
    let settled = false;
    let started = false;
    let startTimer = 0;
    let endTimer = 0;

    const settle = (playedSomething: boolean, markUnusable: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
      if (markUnusable) unavailable.add(url);
      if (current?.audio === audio) current = null;
      resolve(playedSomething);
    };

    // 外から止められたとき。鳴らした扱いで解放し、二重に喋らせない。
    current = { audio, abandon: () => settle(true, false) };

    audio.onended = () => settle(true, false);
    audio.onerror = () => settle(false, true);

    audio.onplaying = () => {
      started = true;
      window.clearTimeout(startTimer);
      // 鳴り始めたら、終わらない場合に備えて上限だけ張る。
      endTimer = window.setTimeout(() => settle(true, false), PLAY_END_TIMEOUT_MS);
    };

    // 再生が始まらないまま黙っているケース (自動再生の制限や読み込み停滞)。
    // ここで諦めないと、待っている側が永久に止まる。
    startTimer = window.setTimeout(() => {
      if (!started) settle(false, true);
    }, PLAY_START_TIMEOUT_MS);

    audio.play().catch(() => {
      // 自動再生がユーザー操作より前に来た場合など。合成音声に任せる。
      settle(false, true);
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
