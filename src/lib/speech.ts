/**
 * Web Speech API での英語読み上げの共通ユーティリティ。
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

let activeUtterance: SpeechSynthesisUtterance | null = null;
let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceListenerAttached = false;

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

/** 利用可能なボイス一覧から英語読み上げに最適なボイスを選ぶ (テスト用に公開) */
export function pickEnglishVoice(
  voices: readonly Pick<SpeechSynthesisVoice, 'lang' | 'default' | 'localService'>[],
): number {
  let best = -1;
  let bestScore = -1;
  voices.forEach((voice, index) => {
    const lang = (voice.lang ?? '').toLowerCase().replace('_', '-');
    if (!lang.startsWith('en')) return;
    let score = 1;
    if (lang === 'en-us') score += 4;
    else if (lang === 'en-gb') score += 2;
    if (voice.localService) score += 2; // ローカルボイスはオフラインでも即時に鳴る
    if (voice.default) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

function getEnglishVoice(): SpeechSynthesisVoice | null {
  const synth = window.speechSynthesis;
  if (!voiceListenerAttached) {
    voiceListenerAttached = true;
    // Chrome はボイス一覧を非同期で読み込むため、更新されたら選び直す
    synth.addEventListener?.('voiceschanged', () => {
      cachedVoice = null;
    });
  }
  if (cachedVoice) return cachedVoice;
  const voices = synth.getVoices();
  const index = pickEnglishVoice(voices);
  cachedVoice = index >= 0 ? voices[index] : null;
  return cachedVoice;
}

export interface SpeakOptions {
  rate?: number;
}

/** 英語テキストを読み上げる。再生中の音声はキャンセルして置き換える。 */
export function speakEnglish(text: string | null | undefined, options: SpeakOptions = {}): void {
  if (!isSupported()) return;
  const trimmed = text?.trim();
  if (!trimmed) return;

  const synth = window.speechSynthesis;
  synth.cancel();
  synth.resume();

  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = 'en-US';
  utterance.rate = options.rate ?? 0.9;
  const voice = getEnglishVoice();
  if (voice) utterance.voice = voice;

  const release = () => {
    if (activeUtterance === utterance) activeUtterance = null;
  };
  utterance.onend = release;
  utterance.onerror = release;
  activeUtterance = utterance;

  window.setTimeout(() => {
    // 遅延中に新しい読み上げや stopSpeaking() があれば発話しない
    if (activeUtterance !== utterance) return;
    synth.resume();
    synth.speak(utterance);
  }, SPEAK_DELAY_MS);
}

/** 再生中・待機中の読み上げをすべて停止する。 */
export function stopSpeaking(): void {
  if (!isSupported()) return;
  activeUtterance = null;
  window.speechSynthesis.cancel();
}
