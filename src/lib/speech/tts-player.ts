'use client';

/**
 * 合成音声 (mp3) をひとつのオーディオ要素で連続再生するプレイヤー。
 *
 * なぜ SpeechSynthesis ではなくこれが要るか:
 * iOS は画面がロックされると SpeechSynthesis が発話しない。フラッシュカードの
 * 自動再生を「画面を消しても鳴り続ける」状態にするには、普通のメディア再生に
 * 乗せるしかない。メディア再生ならロック中も継続でき、ロック画面の再生操作
 * (Media Session) にも乗る。
 *
 * 要素を毎回 new しないのが肝。iOS はユーザー操作の外で作られた Audio の
 * 再生を拒む (音読チャレンジで同じ罠を踏んでいる)。再生ボタンのタップの中で
 * 1つだけ作って解錠し、以降はその要素の src を差し替えて使い回す。
 */

import type { TtsLang } from '@/lib/speech/cloud-text-to-speech';

/** 解錠用の無音 mp3 (ごく短い)。ユーザー操作の中で一度だけ鳴らす。 */
const SILENT_MP3 =
  'data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP///////' +
  '////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAA' +
  'JAAAAAAAAAAAAnGDdQ2CAAAA';

/** 1クリップの再生を諦めるまでの時間。ここで詰まると自動再生が止まるので必ず抜ける。 */
const PLAY_TIMEOUT_MS = 20_000;

export type TtsPlayResult = 'played' | 'unavailable';

export interface TtsPlayer {
  /** 再生ボタンのタップなど、ユーザー操作の中で呼ぶ。 */
  unlock(): void;
  /** 再生し、鳴り終わったら解決する。失敗したら 'unavailable' (呼び出し側で読み上げにフォールバック)。 */
  play(text: string | null | undefined, lang: TtsLang): Promise<TtsPlayResult>;
  /** 次に鳴らす音声を先に取りに行く (HTTPキャッシュに載せる)。 */
  prefetch(text: string | null | undefined, lang: TtsLang): void;
  stop(): void;
  dispose(): void;
}

export interface TtsPlayerDeps {
  createAudio?: () => HTMLAudioElement;
  fetchImpl?: typeof fetch;
}

/** 音声を取るURL。テキストそのもので決まるのでブラウザのキャッシュがそのまま効く。 */
export function ttsAudioUrl(text: string, lang: TtsLang): string {
  const params = new URLSearchParams({ text, lang });
  return `/api/tts?${params.toString()}`;
}

export function createTtsPlayer(deps?: TtsPlayerDeps): TtsPlayer {
  const createAudio = deps?.createAudio ?? (() => new Audio());
  const fetchImpl = deps?.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  let audio: HTMLAudioElement | null = null;
  let disposed = false;
  const prefetched = new Set<string>();

  const ensureAudio = (): HTMLAudioElement | null => {
    if (disposed) return null;
    if (!audio) {
      audio = createAudio();
      audio.preload = 'auto';
      // iOS でインライン再生させる (フルスクリーン再生に奪われないように)。
      audio.setAttribute('playsinline', '');
    }
    return audio;
  };

  return {
    unlock() {
      const element = ensureAudio();
      if (!element) return;
      // 操作の呼び出しスタックの中で一度鳴らしておくと、以降はタイマーからの
      // 再生 (=画面消灯中の次のカード) も許可される。
      element.src = SILENT_MP3;
      void element.play().catch(() => {});
    },

    async play(text, lang) {
      const trimmed = text?.trim();
      const element = ensureAudio();
      if (!trimmed || !element) return 'unavailable';

      return new Promise<TtsPlayResult>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          element.removeEventListener('ended', onEnded);
          element.removeEventListener('error', onError);
          if (timer) clearTimeout(timer);
        };
        const settle = (result: TtsPlayResult) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        };
        const onEnded = () => settle('played');
        const onError = () => settle('unavailable');

        element.addEventListener('ended', onEnded);
        element.addEventListener('error', onError);

        // 音源が壊れている・応答が返らない場合でも必ず抜ける。
        timer = setTimeout(() => settle('unavailable'), PLAY_TIMEOUT_MS);

        element.src = ttsAudioUrl(trimmed, lang);
        const started = element.play();
        if (started && typeof started.catch === 'function') {
          started.catch(() => settle('unavailable'));
        }
      });
    },

    prefetch(text, lang) {
      const trimmed = text?.trim();
      if (!trimmed || disposed) return;
      const url = ttsAudioUrl(trimmed, lang);
      if (prefetched.has(url)) return;
      prefetched.add(url);
      void fetchImpl(url, { credentials: 'same-origin' }).catch(() => {
        // 取れなくても再生時に取り直せばよい。次の機会のために覚えておかない。
        prefetched.delete(url);
      });
    },

    stop() {
      if (!audio) return;
      audio.pause();
    },

    dispose() {
      disposed = true;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        audio = null;
      }
      prefetched.clear();
    },
  };
}
