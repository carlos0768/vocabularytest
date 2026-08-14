/**
 * Google Cloud Text-to-Speech 連携（サーバー側）。
 *
 * ブラウザ内蔵の SpeechSynthesis は iOS では画面ロック中に発話しない。
 * フラッシュカードの自動再生を「画面を消しても鳴り続ける」状態にするには、
 * 読み上げを合成音声ファイル(mp3)にして通常のオーディオ再生に乗せる必要がある。
 * ここはそのファイルを作る側。
 *
 * 音読チャレンジの固定文言は scripts/generate-voice-quiz-audio.mjs で
 * 事前生成しているが、単語はユーザーごとに違うため事前生成できない。
 * そのためこちらは実行時に合成する。声の選定は事前生成スクリプトと揃えてある。
 *
 * 認証は GOOGLE_CLOUD_TTS_API_KEY (Cloud Text-to-Speech API に制限した
 * APIキー) を使う REST 呼び出し。Speech-to-Text 側と同じ方式。
 */

const TTS_API_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

export type TtsLang = 'en' | 'ja';

/** 事前生成スクリプト (generate-voice-quiz-audio.mjs) と同じ声を使う。 */
const VOICE_BY_LANG: Record<TtsLang, { languageCode: string; name: string }> = {
  ja: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B' },
  en: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
};

/**
 * 1リクエストで読み上げる文字数の上限。
 * 単語と訳、例文でも十分に収まる長さ。長文の読み上げ代行に使われないよう絞る。
 */
export const MAX_TTS_TEXT_LENGTH = 200;

export interface SynthesizeSpeechInput {
  text: string;
  lang: TtsLang;
  /** 少しゆっくりめが既定。事前生成の固定文言と揃えている。 */
  speakingRate?: number;
}

export interface SynthesizeSpeechSuccess {
  success: true;
  /** base64 の mp3 (data: プレフィックスなし)。 */
  audioBase64: string;
}

/**
 * 失敗の種別。呼び出し側がHTTPステータスを選び分けるために使う。
 * - `not_configured`: APIキー未設定。サーバー側の設定ミスで上流障害ではない。
 * - `invalid_text`: 空文字や長すぎるテキスト。
 * - `upstream`: GCP が実際にエラーを返した/到達できなかった。
 */
export type SynthesizeSpeechFailureReason = 'not_configured' | 'invalid_text' | 'upstream';

export interface SynthesizeSpeechFailure {
  success: false;
  reason: SynthesizeSpeechFailureReason;
  error: string;
}

export type SynthesizeSpeechResponse = SynthesizeSpeechSuccess | SynthesizeSpeechFailure;

export interface SynthesizeSpeechDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

/** GCP へ送るリクエストボディ。テストから中身を確かめられるよう切り出す。 */
export function buildSynthesizeRequestBody(input: SynthesizeSpeechInput) {
  return {
    input: { text: input.text },
    voice: VOICE_BY_LANG[input.lang],
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: input.speakingRate ?? 0.98,
    },
  };
}

/** 空・長すぎるテキストはGCPに投げる前に弾く。 */
export function validateTtsText(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_TTS_TEXT_LENGTH) return null;
  return trimmed;
}

export async function synthesizeSpeech(
  input: SynthesizeSpeechInput,
  deps?: SynthesizeSpeechDeps,
): Promise<SynthesizeSpeechResponse> {
  const apiKey = (deps?.apiKey ?? process.env.GOOGLE_CLOUD_TTS_API_KEY)?.trim();
  if (!apiKey) {
    return {
      success: false,
      reason: 'not_configured',
      error: 'GOOGLE_CLOUD_TTS_API_KEY が設定されていません',
    };
  }

  const text = validateTtsText(input.text);
  if (!text) {
    return { success: false, reason: 'invalid_text', error: '読み上げるテキストが不正です' };
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(`${TTS_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSynthesizeRequestBody({ ...input, text })),
    });

    const data = (await response.json().catch(() => null)) as {
      audioContent?: string;
      error?: { message?: string };
    } | null;

    if (!response.ok || !data?.audioContent) {
      const message = data?.error?.message || `HTTP ${response.status}`;
      return { success: false, reason: 'upstream', error: message };
    }

    return { success: true, audioBase64: data.audioContent };
  } catch (error) {
    return {
      success: false,
      reason: 'upstream',
      error: error instanceof Error ? error.message : 'text-to-speech request failed',
    };
  }
}
