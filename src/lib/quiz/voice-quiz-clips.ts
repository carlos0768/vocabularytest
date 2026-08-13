'use client';

/**
 * 音読チャレンジの固定文音声 (public/audio/voice-quiz/*.mp3) を鳴らす。
 *
 * インストール済みのPWA (特に iOS) では、鳴らすたびに `new Audio()` を作って
 * play() すると音が出ない —— 自動再生の解錠を受け取るのはユーザー操作中に
 * play() した「その要素」だけで、次の一片のために作った要素は対象外になる。
 * さらに一度失敗した音声を二度と使わない作りだったので、1問目で弾かれた
 * 時点で残り全部が合成音声に落ちていた。「自然音声のはずが合成音声」で
 * 聞こえていたのはこれ。
 *
 * そこで再生の仕方を変える:
 *   - 開始ボタンの操作で AudioContext を解錠し、以降はデコード済みの
 *     バッファを鳴らす。要素ごとの解錠が要らないので、操作から離れた
 *     2片目以降でもそのまま鳴る。
 *   - 音声は画面を開いた時点で取ってきて、解錠と同時にデコードまで済ませる。
 *     再生のたびにネットワークを待たない —— その待ちがそのまま出題の遅れになる。
 *   - 失敗を覚えるのは「ファイルが無い/読めない」と分かったときだけ。
 *     通信の揺れで諦めたら、次の問題でまた試す。
 *
 * AudioContext が無い環境やデコードできない音声のために、解錠済みの
 * <audio> 要素を1つだけ使い回す道も残す。どちらでも鳴らせなかったときだけ、
 * 呼び出し側が合成音声に回す。
 */

import { voiceQuizAudioIndex } from './voice-quiz-audio';

/** 鳴り終わりを待つ上限の天井。音声の長さが分からないときの保険。 */
const PLAY_END_TIMEOUT_MS = 12_000;

/** まだ読み込めていない音声を待つ上限。これを過ぎたら合成音声に回す。 */
const CLIP_LOAD_WAIT_MS = 1200;

/** <audio> 経由での再生が始まるのを待つ上限。 */
const ELEMENT_START_TIMEOUT_MS = 2000;

/**
 * 解錠用の無音。サンプルを持たない WAV なので、鳴らしても何も聞こえない。
 * これを操作中に鳴らして、要素と AudioContext を「操作から始まった再生」にする。
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

/**
 * 音声の長さから、鳴り終わりを待つ上限を決める。
 *
 * 一律で長く待つと、終わりの通知が来なかったときにそのぶん丸ごと止まる ——
 * iOS は再生が中断されるとイベントを上げないことがあり、1片ごとに
 * 十数秒の沈黙になって「出題が始まらない」ように見える。
 * 実際の長さが分かるなら、それを少し超えたところで見切る。
 */
export function playbackTimeoutMs(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return PLAY_END_TIMEOUT_MS;
  // 再生の遅れぶんの余裕を足す。短い掛け声でも1秒は待つ。
  return Math.min(Math.round(durationSeconds * 1000 * 1.5) + 1000, PLAY_END_TIMEOUT_MS);
}

export type ClipFailure = 'network' | 'http' | 'decode' | 'playback';

/**
 * 失敗した音声を、次の機会にもう一度試すか。
 *
 * 何であれ一度の失敗で諦めると、圏外の一瞬や自動再生の制限に当たっただけで
 * セッション中ずっと合成音声になる (実際そうなっていた)。
 * サーバーが「無い」と答えた・そもそもデコードできない、と分かったものだけ諦める。
 */
export function isRetriableClipFailure(reason: ClipFailure): boolean {
  return reason === 'network' || reason === 'playback';
}

/**
 * <audio> の `error.code` を、諦めてよい失敗かどうかに読み替える。
 *
 * 中断 (次の一片へ進むために差し替えた) と通信のエラーは、その場かぎり。
 * デコードできない・そもそも無い、だけが「この音声は使えない」。
 */
export function elementFailureReason(code: number | undefined): ClipFailure {
  if (code === 3 /* MEDIA_ERR_DECODE */) return 'decode';
  if (code === 4 /* MEDIA_ERR_SRC_NOT_SUPPORTED */) return 'http';
  // 1: ABORTED (差し替えで打ち切った), 2: NETWORK, それ以外は判断がつかない。
  return 'network';
}

// --- 読み込み ---------------------------------------------------------------

/** デコード済みの音声。文言ぶんしか無い (現状30件・約500KB) ので全部持っておく。 */
const buffers = new Map<string, AudioBuffer>();
/** 取得済みの生データ。AudioContext がまだ無くても貯めておける。 */
const bytesByUrl = new Map<string, ArrayBuffer>();
/** 取得中・デコード中のもの。同じ音声を二重に処理しない。 */
const fetching = new Map<string, Promise<ArrayBuffer | null>>();
const decoding = new Map<string, Promise<AudioBuffer | null>>();
/** 鳴らせないと分かったもの。ここに入るのは再試行しても無駄なものだけ。 */
const abandoned = new Set<string>();

let context: AudioContext | null = null;
let contextUnavailable = false;

/**
 * AudioContext。**ユーザー操作の中でしか作らない** ——
 * 操作より前に作った context は解錠されないまま止まる端末があり、
 * そうなると事前生成の音声が一片も鳴らない。
 */
function audioContext(): AudioContext | null {
  return context;
}

function createAudioContext(): AudioContext | null {
  if (context || contextUnavailable) return context;
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    contextUnavailable = true;
    return null;
  }
  try {
    context = new Ctor();
  } catch {
    contextUnavailable = true;
  }
  return context;
}

/** Safari の古い実装は Promise を返さないので、コールバック形式にも備える。 */
function decode(ctx: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    // decodeAudioData は渡したバッファを取り上げる。作り直せるよう複製を渡す。
    const maybePromise = ctx.decodeAudioData(bytes.slice(0), resolve, reject) as
      | Promise<AudioBuffer>
      | undefined;
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.then(resolve, reject);
    }
  });
}

/** 音声を取ってくる。デコードはしない (AudioContext が要らない)。 */
function fetchClip(url: string): Promise<ArrayBuffer | null> {
  const ready = bytesByUrl.get(url);
  if (ready) return Promise.resolve(ready);
  if (abandoned.has(url)) return Promise.resolve(null);

  const inFlight = fetching.get(url);
  if (inFlight) return inFlight;

  const task = (async (): Promise<ArrayBuffer | null> => {
    let reason: ClipFailure = 'network';
    try {
      const response = await fetch(url);
      if (!response.ok) {
        reason = 'http';
        throw new Error(`${response.status}`);
      }
      const bytes = await response.arrayBuffer();
      bytesByUrl.set(url, bytes);
      return bytes;
    } catch {
      if (!isRetriableClipFailure(reason)) abandoned.add(url);
      return null;
    } finally {
      fetching.delete(url);
    }
  })();

  fetching.set(url, task);
  return task;
}

/** 鳴らせる形にする。AudioContext が無ければ (=まだ解錠前なら) 何もしない。 */
function loadClip(url: string): Promise<AudioBuffer | null> {
  const ready = buffers.get(url);
  if (ready) return Promise.resolve(ready);
  if (abandoned.has(url)) return Promise.resolve(null);

  const inFlight = decoding.get(url);
  if (inFlight) return inFlight;

  const ctx = audioContext();
  if (!ctx) return Promise.resolve(null);

  const task = (async (): Promise<AudioBuffer | null> => {
    try {
      const bytes = await fetchClip(url);
      if (!bytes) return null;
      const buffer = await decode(ctx, bytes);
      buffers.set(url, buffer);
      return buffer;
    } catch {
      // ここまで来た失敗はデコードの失敗。取り直しても同じ結果になる。
      abandoned.add(url);
      return null;
    } finally {
      decoding.delete(url);
    }
  })();

  decoding.set(url, task);
  return task;
}

/** 台本にある音声すべてのURL。 */
function allClipUrls(): string[] {
  return [...new Set(voiceQuizAudioIndex().values())];
}

/**
 * 固定文の音声をまとめて取ってきておく。画面を開いた時点で呼ぶ。
 * 設定を選んでいる間に済むので、1問目から待たずに鳴らせる。
 */
export function prefetchVoiceQuizClips(): void {
  if (typeof window === 'undefined') return;
  for (const url of allClipUrls()) void fetchClip(url);
}

// --- 解錠 -------------------------------------------------------------------

let element: HTMLAudioElement | null = null;

function sharedElement(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!element) {
    element = new Audio();
    element.preload = 'auto';
    // インラインで鳴らす。iOS で全画面プレイヤーに奪われないようにする。
    // (型上は video だけの属性だが、iOS の audio 要素も見ている)
    (element as unknown as { playsInline?: boolean }).playsInline = true;
  }
  return element;
}

/**
 * ユーザー操作の中で呼んで、以降の再生を許可させる。
 * 操作から離れたところで呼んでも害は無い (拒否されるだけ) が、効きもしない。
 */
export function unlockVoiceQuizClips(): void {
  const ctx = createAudioContext();
  if (ctx) {
    void ctx.resume?.().catch(() => {});
    try {
      // 無音を1つ鳴らして、この文脈を解錠済みにする。
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // 解錠できなくても、鳴らす段でもう一度 resume を試みる。
    }
    // 取得済みのぶんをここでデコードしておく。1問目の読み上げで待たない。
    for (const url of allClipUrls()) void loadClip(url);
  }

  // <audio> 側は要素ごとに解錠が要る。使い回す1つをここで通しておく。
  // 鳴っている最中に差し替えると、その一片を打ち切ってしまうので触らない。
  const audio = sharedElement();
  if (!audio || !audio.paused) return;
  try {
    audio.src = SILENT_WAV;
    const played = audio.play();
    if (played && typeof played.then === 'function') {
      played.then(() => audio.pause()).catch(() => {});
    }
  } catch {
    // 解錠に失敗しても、鳴らせなければ合成音声に回るだけ。
  }
}

/** 画面を開いたときの下ごしらえ。操作の中で呼べるなら解錠まで済ませる。 */
export function primeVoiceQuizClips(): void {
  unlockVoiceQuizClips();
  prefetchVoiceQuizClips();
}

// --- 再生 -------------------------------------------------------------------

/** いま鳴っているものと、それを待っている側を解放する手段。 */
let current: { stop: () => void; settle: () => void } | null = null;

/**
 * 再生を止める。待っている側は「鳴らし終えた」扱いで解放する ——
 * ここで解決し損ねると、読み上げループが永久に待ち続けて先へ進めなくなる。
 */
export function stopVoiceQuizClips(): void {
  const playing = current;
  if (!playing) return;
  current = null;
  try {
    playing.stop();
  } catch {
    // 再生前に止めた場合など。放っておいてよい。
  }
  playing.settle();
}

/** 読み込みを待つが、待ちすぎない。間に合わなければ合成音声に回す。 */
function loadWithinBudget(url: string): Promise<AudioBuffer | null> {
  const ready = buffers.get(url);
  if (ready) return Promise.resolve(ready);

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), CLIP_LOAD_WAIT_MS);
    void loadClip(url).then(
      (buffer) => {
        window.clearTimeout(timer);
        resolve(buffer);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer): Promise<boolean> {
  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    let settled = false;
    let timer = 0;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (current?.settle === settle) current = null;
      resolve(true);
    };

    source.onended = settle;
    // 終わりの通知が来ない環境の保険。長さが分かっているので少しだけ余裕を見る。
    timer = window.setTimeout(settle, playbackTimeoutMs(buffer.duration));
    current = { stop: () => source.stop(), settle };

    try {
      source.start();
    } catch {
      settled = true;
      window.clearTimeout(timer);
      current = null;
      resolve(false);
    }
  });
}

/** <audio> 経由。AudioContext が使えない・鳴らせないときの控え。 */
function playElement(url: string): Promise<boolean> {
  const audio = sharedElement();
  if (!audio) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    let startTimer = 0;
    let endTimer = 0;

    const settle = (played: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.onpause = null;
      if (current?.settle === finish) current = null;
      resolve(played);
    };
    const finish = () => settle(true);

    audio.onended = finish;
    audio.onerror = () => {
      // 中断や通信のエラーで諦めると、以降ずっと合成音声になる。
      // 「その音声が使えない」と分かったときだけ覚える。
      const reason = elementFailureReason(audio.error?.code);
      if (!isRetriableClipFailure(reason)) abandoned.add(url);
      settle(false);
    };
    audio.onplaying = () => {
      started = true;
      window.clearTimeout(startTimer);
      endTimer = window.setTimeout(finish, playbackTimeoutMs(audio.duration));
    };
    // iOS は着信や音声セッションの切り替えで再生を止め、`ended` を上げない。
    audio.onpause = () => {
      if (started && !audio.ended) finish();
    };

    startTimer = window.setTimeout(() => {
      if (!started) settle(false);
    }, ELEMENT_START_TIMEOUT_MS);

    current = { stop: () => audio.pause(), settle: finish };

    try {
      // src を差し替えれば頭出しも一緒に済む。currentTime を触ると、
      // まだ何も読めていない要素では例外になる。
      audio.src = url;
      const played = audio.play();
      if (played && typeof played.then === 'function') {
        played.catch(() => settle(false));
      }
    } catch {
      settle(false);
    }
  });
}

/**
 * 事前生成の音声を鳴らし、鳴らし終わるまで待つ。
 * 鳴らし切れた (あるいは途中で止められた) なら true。
 * 鳴らせなかったときだけ false を返し、呼び出し側が合成音声に回せるようにする。
 */
export async function playVoiceQuizClip(url: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const buffer = await loadWithinBudget(url);

  // 前の一片がまだ鳴っていれば止める。合成音声側は speakInternal が
  // 自分でキャンセルするので、事前生成音声もそれに揃える。
  stopVoiceQuizClips();

  const ctx = audioContext();
  if (ctx && buffer) {
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // 解錠されていない。<audio> 側に賭ける。
      }
    }
    if (ctx.state === 'running') return playBuffer(ctx, buffer);
  }

  if (abandoned.has(url)) return false;
  return playElement(url);
}
