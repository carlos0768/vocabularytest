/**
 * 録音した音声を、Cloud Speech-to-Text が受け取れる形に直す。
 *
 * iOS Safari の MediaRecorder は webm/ogg を要求しても mp4 (AAC) で録音する。
 * GCP は AAC を受け付けないので、そのまま送れば必ず落ちる —— PCの Chromium は
 * webm/opus で録れるため、「スマホだけ音声認識が全問失敗する」という形で出る。
 *
 * opus で録れたときはそのまま送り (圧縮済みで軽い)、そうでないときだけ
 * ブラウザでデコードして LINEAR16 = 16kHzモノラルの生PCM に直す。
 * デコード以外は素の計算なので、ブラウザ無しで確かめられる。
 */

/**
 * 送信するサンプリングレート。音声認識はこれで十分で、
 * 48kHzのまま送るのに比べてデータが3分の1になる ——
 * 解答時間を長く取ったときに、リクエストの上限に当たらずに済む。
 */
export const LINEAR16_SAMPLE_RATE = 16000;

/**
 * 送る音声の長さの上限 (秒)。
 *
 * 生PCMは1秒32KBあるので、解答時間を長くとるとリクエストが際限なく育つ。
 * 答えは単語ひとつで、無音を落としたあと十数秒に及ぶことはまず無い ——
 * 上限を置いても答えを削らずに、送信量だけを予測可能にできる。
 */
export const MAX_LINEAR16_SECONDS = 15;

/** GCPが受け取れる、そのまま送れる録音形式。 */
export type PassthroughEncoding = 'WEBM_OPUS' | 'OGG_OPUS';

/**
 * MediaRecorder が実際に出した MIME から、そのまま送れる形式を決める。
 * 宣言 (isTypeSupported) ではなく実際の出力だけを見る —— Safari は
 * webm を「対応している」と答えたうえで mp4 を吐く。
 */
export function passthroughEncodingFor(mimeType: string): PassthroughEncoding | null {
  const type = mimeType.toLowerCase();
  if (type.includes('webm')) return 'WEBM_OPUS';
  if (type.includes('ogg')) return 'OGG_OPUS';
  return null;
}

/** 複数チャンネルを1本に混ぜる。認識にステレオは要らない。 */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];

  const length = channels[0].length;
  const mixed = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    mixed[i] = sum / channels.length;
  }
  return mixed;
}

/**
 * サンプリングレートを変換する。線形補間で十分 ——
 * 落とす先が16kHzで、対象は一息ぶんの発話。
 *
 * OfflineAudioContext を使えば同じことができるが、iOS Safari は
 * 44.1kHz以外のレートで作れないことがあり、ここで転ぶと元も子もない。
 */
export function resampleMono(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) {
    return new Float32Array(0);
  }
  if (fromRate === toRate || samples.length === 0) return samples;

  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const resampled = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    resampled[i] = samples[left] * (1 - weight) + samples[right] * weight;
  }

  return resampled;
}

/**
 * 前後の無音を落とす。
 *
 * 録音の窓は解答時間ぶん (既定6秒) 開いているが、実際に話しているのは
 * 1〜2秒で、残りは無音のまま送っている。生PCMは圧縮が効かないので、
 * この無音がそのまま送信量になる —— 携帯回線では効いてくるうえ、
 * 認識にも何も足さない。
 *
 * 閾値は最大音量からの相対で決める。固定値にすると、小さい声の録音を
 * 丸ごと無音と見なして消してしまう。
 */
export function trimSilence(
  samples: Float32Array,
  sampleRate: number,
  paddingSeconds = 0.15,
): Float32Array {
  if (samples.length === 0) return samples;

  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const level = Math.abs(samples[i]);
    if (level > peak) peak = level;
  }

  // 何も入っていない録音。切り詰めず、そのまま送って判断は認識側に任せる。
  if (peak === 0) return samples;

  const threshold = peak * 0.06;
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i += 1) {
    if (Math.abs(samples[i]) < threshold) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return samples;

  // 語頭・語尾を削り落とさないよう、前後に少し残す。
  const padding = Math.max(0, Math.floor(paddingSeconds * sampleRate));
  const start = Math.max(0, first - padding);
  const end = Math.min(samples.length, last + padding + 1);
  return samples.subarray(start, end);
}

/**
 * 長すぎる録音を頭から切り出す。答えは冒頭にあるので、後ろを落とす。
 */
export function capDuration(
  samples: Float32Array,
  sampleRate: number,
  maxSeconds: number,
): Float32Array {
  const limit = Math.floor(sampleRate * maxSeconds);
  if (limit <= 0 || samples.length <= limit) return samples;
  return samples.subarray(0, limit);
}

/** -1〜1 の波形を 16bit リトルエンディアンの生PCMにする。 */
export function floatsToPcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);

  for (let i = 0; i < samples.length; i += 1) {
    // 範囲外の値をそのまま丸めると、大きい音が反対の極に折り返って歪む。
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(clamped * 32767), true);
  }

  return bytes;
}

/**
 * バイト列を base64 にする。
 *
 * `String.fromCharCode(...bytes)` は展開したぶんが引数になるため、
 * 配列が大きいと呼び出しの上限に当たって RangeError で落ちる。
 * 上限は処理系とスタックの余裕で決まり、スマホのほうが先に当たる ——
 * 「PCでは通るのにスマホだけ音声認識が失敗する」の形で出る。
 * 1バイトずつ積めば上限そのものが無い。
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export interface Linear16Audio {
  pcm: Uint8Array;
  sampleRateHertz: number;
}

/**
 * 録音をデコードして LINEAR16 に直す。
 * デコードできない (対応していない形式・空の録音) ときは null。
 */
export async function toLinear16(blob: Blob): Promise<Linear16Audio | null> {
  const Ctor = audioContextConstructor();
  if (!Ctor || blob.size === 0) return null;

  let context: AudioContext | null = null;
  try {
    // 生成自体が落ちることがある (音声セッションを取れない、など)。
    context = new Ctor();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i),
    );
    const mono = resampleMono(mixToMono(channels), decoded.sampleRate, LINEAR16_SAMPLE_RATE);
    if (mono.length === 0) return null;

    const spoken = capDuration(
      trimSilence(mono, LINEAR16_SAMPLE_RATE),
      LINEAR16_SAMPLE_RATE,
      MAX_LINEAR16_SECONDS,
    );
    return { pcm: floatsToPcm16(spoken), sampleRateHertz: LINEAR16_SAMPLE_RATE };
  } catch {
    return null;
  } finally {
    // 端末のオーディオを掴んだままにしない。閉じられなくても実害は無い。
    void context?.close?.();
  }
}
