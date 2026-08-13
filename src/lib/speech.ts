/**
 * Web Speech API での読み上げの共通ユーティリティ。
 *
 * デスクトップブラウザ固有の不具合への対策を1箇所に集約する:
 * - Chrome/Edge (デスクトップ) は `cancel()` 直後に同期的に `speak()` すると
 *   発話が無視されることがある → 1ティック遅らせてから speak する
 * - Chrome (デスクトップ) はタブ切替や cancel 後に paused 状態のまま固まる
 *   ことがある → speak 前に必ず `resume()` する
 * - 日本語環境のデスクトップ (特に macOS Safari / Windows) では
 *   `utterance.lang = 'en-US'` だけでは既定の日本語ボイスが使われ、
 *   英単語がカタカナ読みされることがある → 英語ボイスを明示的に選択する
 * - Chrome (デスクトップ) は発話中の utterance が GC されると音声が
 *   途中で途切れることがある → 再生中はモジュール変数で参照を保持する
 */

// Chrome の cancel→speak 競合を避けるための遅延 (ms)
const SPEAK_DELAY_MS = 60;

export type SpeechLang = 'en' | 'ja';

const BCP47_BY_LANG: Record<SpeechLang, string> = {
  en: 'en-US',
  ja: 'ja-JP',
};

let activeUtterance: SpeechSynthesisUtterance | null = null;
/** いま待たれている読み上げを解放する手段。stopSpeaking から呼ぶ。 */
let activeRelease: (() => void) | null = null;
const cachedVoiceByLang = new Map<SpeechLang, SpeechSynthesisVoice | null>();
let voiceListenerAttached = false;

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

/** 利用可能なボイス一覧から指定言語の読み上げに最適なボイスを選ぶ (テスト用に公開) */
export function pickVoiceForLang(
  voices: readonly Pick<SpeechSynthesisVoice, 'lang' | 'default' | 'localService'>[],
  lang: SpeechLang,
): number {
  let best = -1;
  let bestScore = -1;
  voices.forEach((voice, index) => {
    const voiceLang = (voice.lang ?? '').toLowerCase().replace('_', '-');
    if (!voiceLang.startsWith(lang)) return;
    let score = 1;
    const preferredRegion = lang === 'en' ? 'en-us' : 'ja-jp';
    const secondaryRegion = lang === 'en' ? 'en-gb' : null;
    if (voiceLang === preferredRegion) score += 4;
    else if (secondaryRegion && voiceLang === secondaryRegion) score += 2;
    if (voice.localService) score += 2; // ローカルボイスはオフラインでも即時に鳴る
    if (voice.default) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/** @deprecated use `pickVoiceForLang(voices, 'en')` */
export function pickEnglishVoice(
  voices: readonly Pick<SpeechSynthesisVoice, 'lang' | 'default' | 'localService'>[],
): number {
  return pickVoiceForLang(voices, 'en');
}

function getVoiceForLang(lang: SpeechLang): SpeechSynthesisVoice | null {
  const synth = window.speechSynthesis;
  if (!voiceListenerAttached) {
    voiceListenerAttached = true;
    // Chrome はボイス一覧を非同期で読み込むため、更新されたら選び直す
    synth.addEventListener?.('voiceschanged', () => {
      cachedVoiceByLang.clear();
    });
  }
  if (cachedVoiceByLang.has(lang)) return cachedVoiceByLang.get(lang) ?? null;
  const voices = synth.getVoices();
  const index = pickVoiceForLang(voices, lang);
  const voice = index >= 0 ? voices[index] : null;
  cachedVoiceByLang.set(lang, voice);
  return voice;
}

export interface SpeakOptions {
  rate?: number;
}

function speakInternal(text: string, lang: SpeechLang, options: SpeakOptions, onDone?: () => void): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = BCP47_BY_LANG[lang];
  utterance.rate = options.rate ?? (lang === 'en' ? 0.9 : 1);
  const voice = getVoiceForLang(lang);
  if (voice) utterance.voice = voice;

  const release = () => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
      activeRelease = null;
    }
    onDone?.();
  };
  utterance.onend = release;
  utterance.onerror = release;
  // 鳴り始めたなら、合成音声は使える。捨てられた数を数え直す。
  utterance.onstart = () => {
    consecutiveDrops = 0;
  };
  activeUtterance = utterance;
  activeRelease = release;

  window.setTimeout(() => {
    // 遅延中に新しい読み上げや stopSpeaking() があれば発話しない
    if (activeUtterance !== utterance) {
      onDone?.();
      return;
    }
    synth.resume();
    synth.speak(utterance);
  }, SPEAK_DELAY_MS);
}

/** 英語テキストを読み上げる。再生中の音声はキャンセルして置き換える。 */
export function speakEnglish(text: string | null | undefined, options: SpeakOptions = {}): void {
  if (!isSupported()) return;
  const trimmed = text?.trim();
  if (!trimmed) return;
  speakInternal(trimmed, 'en', options);
}

/** 日本語テキストを読み上げる。再生中の音声はキャンセルして置き換える。 */
export function speakJapanese(text: string | null | undefined, options: SpeakOptions = {}): void {
  if (!isSupported()) return;
  const trimmed = text?.trim();
  if (!trimmed) return;
  speakInternal(trimmed, 'ja', options);
}

/**
 * 読み上げが終わるまで待つ版。音読チャレンジのように「出題文の読み上げが
 * 終わってからリスニング(タイマー+録音)を開始する」といった逐次制御に使う。
 * 非対応環境・空文字では即座に resolve する。
 */
export function speakAndWait(
  text: string | null | undefined,
  lang: SpeechLang,
  options: SpeakOptions = {},
): Promise<void> {
  const trimmed = text?.trim();
  if (!isSupported() || !trimmed) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    let watcher = 0;

    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(watcher);
      resolve();
    };

    // 諦めるとき用。遅れて鳴り始めた声が録音に被らないよう、打ち切ってから返す。
    const giveUp = () => {
      if (settled) return;
      try { window.speechSynthesis.cancel(); } catch {}
      done();
    };

    // onend も onerror も来ないことがある —— iOS Safari では発話が黙って
    // 捨てられたり、cancel の後にイベントが上がらなかったりする。
    // そのまま待つと呼び出し側が永久に止まるので、読み上げにかかるであろう
    // 時間から上限を決めて必ず解決する。実際に鳴っていたとしても、次の
    // speakInternal が cancel するので声が重なることはない。
    timer = window.setTimeout(giveUp, speechTimeoutMs(trimmed));

    // 上限だけに頼ると、捨てられた発話でも文字数ぶん待たされる。
    // 鳴っているかを実際に見て、鳴らない/鳴り終わったと分かった時点で返す。
    const startedAt = Date.now();
    const graceMs = SPEAK_DELAY_MS + speechStartGraceMs(consecutiveDrops);
    let spoke = false;
    watcher = window.setInterval(() => {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) spoke = true;

      const stop = shouldStopWaitingForSpeech({
        spoke,
        speaking: synth.speaking,
        pending: synth.pending,
        elapsedMs: Date.now() - startedAt,
        graceMs,
      });
      if (!stop) return;

      // 鳴らないまま終わったのなら、遅れて鳴り出さないよう打ち切る。
      if (spoke) {
        consecutiveDrops = 0;
        done();
      } else {
        consecutiveDrops += 1;
        giveUp();
      }
    }, SPEECH_WATCH_INTERVAL_MS);

    speakInternal(trimmed, lang, options, done);
  });
}

/**
 * 読み上げを待つ上限。1文字あたりの所要時間は言語や声で変わるので、
 * 短く切りすぎないよう多めに見積もる。
 */
function speechTimeoutMs(text: string): number {
  return Math.min(3000 + text.length * 300, 20_000);
}

/** 続けて捨てられた発話の数。合成音声が使えない端末を見分けるための目印。 */
let consecutiveDrops = 0;

/**
 * 発話が始まるのを待つ猶予。これを過ぎて鳴っていなければ捨てられたとみなす。
 *
 * 合成音声がそもそも鳴らない端末 (インストール済みPWAの iOS など) では、
 * 読み上げ1片ごとにこの猶予を丸ごと待つ。出題文が数片に分かれているので、
 * 一定にすると「開始を押したのに何も起きない」数秒が毎問積み上がる。
 * 続けて捨てられたら、待つ意味が薄いとみて短くする。一度でも鳴れば元に戻す。
 */
export function speechStartGraceMs(drops: number): number {
  if (drops >= 2) return 300;
  if (drops >= 1) return 600;
  return 1500;
}

/** 発話しているかを見に行く間隔。 */
const SPEECH_WATCH_INTERVAL_MS = 200;

export interface SpeechProgress {
  /** 一度でも鳴っているのを見たか。 */
  spoke: boolean;
  speaking: boolean;
  pending: boolean;
  /** speak() を頼んでからの経過。 */
  elapsedMs: number;
  graceMs: number;
}

/**
 * 読み上げを待つのをやめてよいか。
 *
 * onend も onerror も来ないことがあるので、実際に鳴っているかを見て決める:
 * - 鳴っていた声が止まった → 読み終えた
 * - 猶予を過ぎても鳴り始めない → 捨てられた (iOS でよく起きる)
 *
 * これが無いと、捨てられた発話を文字数から決めた上限いっぱい待つことになり、
 * 1問あたり十数秒の沈黙になって「出題が始まらない」ように見える。
 */
export function shouldStopWaitingForSpeech(progress: SpeechProgress): boolean {
  if (progress.speaking || progress.pending) return false;
  if (progress.spoke) return true;
  return progress.elapsedMs >= progress.graceMs;
}

/** 再生中・待機中の読み上げをすべて停止する。 */
export function stopSpeaking(): void {
  if (!isSupported()) return;

  const release = activeRelease;
  activeUtterance = null;
  activeRelease = null;
  window.speechSynthesis.cancel();

  // cancel しても onend が来ない環境があるため、待っている側はここで解放する。
  // 解放し損ねると、読み上げ中に中断した瞬間にクイズが進まなくなる。
  release?.();
}
