/**
 * Google Cloud Speech-to-Text integration for the voice quiz feature.
 *
 * ブラウザ内蔵の Web Speech API (SpeechRecognition) は精度がブラウザ・端末依存で
 * バラつく上、iOS Safari の standalone PWA では機能しない。GCP の
 * Cloud Speech-to-Text API (speech.googleapis.com) を使うことで、
 * 録音した音声をサーバー側で一貫した精度で認識できるようにする。
 *
 * 認証は GOOGLE_CLOUD_SPEECH_API_KEY (GCPプロジェクトで発行し、
 * Speech-to-Text API に制限したAPIキー) を使う REST 呼び出し。
 * サービスアカウント/ADCは使わず、既存の Gemini/Cloud Run 連携と同様に
 * シンプルなAPIキー方式に揃えている。
 */

const SPEECH_API_URL = 'https://speech.googleapis.com/v1/speech:recognize';

export type SpeechAudioEncoding = 'WEBM_OPUS' | 'OGG_OPUS' | 'LINEAR16';

export interface RecognizeSpeechInput {
  /** Base64-encoded audio content (no data: URL prefix). */
  audioBase64: string;
  encoding: SpeechAudioEncoding;
  languageCode?: string;
  /** Required for LINEAR16; omitted for WEBM_OPUS/OGG_OPUS so GCP reads it from the container header. */
  sampleRateHertz?: number;
  /**
   * 認識のヒントに使う語 (speechContexts)。
   * 日本語は同音異義語が多く、正しく発音していても別の漢字に変換されて
   * 不正解になることがある。期待する表記を渡しておくと、音が同じ候補の中から
   * その表記が選ばれやすくなる。音が違えば選ばれないので、答えの押し付けにはならない。
   */
  phraseHints?: string[];
  /**
   * 受け取る候補数。1にすると最有力の変換だけになり、同音異義語を取りこぼす。
   */
  maxAlternatives?: number;
}

export interface RecognizeSpeechResult {
  success: true;
  transcript: string;
  confidence: number;
  /** 認識できた候補すべて (先頭が最有力)。同音異義語の判定に使う。 */
  alternatives: string[];
}

/**
 * 失敗の種別。呼び出し側がHTTPステータスを選び分けるために使う。
 * - `not_configured`: APIキー未設定。サーバー側の設定ミスなので上流障害(502)ではない。
 * - `invalid_audio`: 送られてきた音声が不正。
 * - `upstream`: Cloud Speech-to-Text が実際にエラーを返した/到達できなかった。
 */
export type RecognizeSpeechFailureReason = 'not_configured' | 'invalid_audio' | 'upstream';

export interface RecognizeSpeechFailure {
  success: false;
  reason: RecognizeSpeechFailureReason;
  error: string;
}

interface CloudSpeechApiAlternative {
  transcript?: string;
  confidence?: number;
}

interface CloudSpeechApiResult {
  alternatives?: CloudSpeechApiAlternative[];
}

interface CloudSpeechApiResponse {
  results?: CloudSpeechApiResult[];
  error?: { message?: string };
}

function pickBestAlternative(response: CloudSpeechApiResponse): CloudSpeechApiAlternative | null {
  for (const result of response.results ?? []) {
    const alternative = result.alternatives?.[0];
    if (alternative?.transcript) return alternative;
  }
  return null;
}

/** 全結果の候補を重複なく平坦化する。同音異義語の別変換がここに並ぶ。 */
function collectAlternatives(response: CloudSpeechApiResponse): string[] {
  const transcripts = new Set<string>();
  for (const result of response.results ?? []) {
    for (const alternative of result.alternatives ?? []) {
      const transcript = alternative.transcript?.trim();
      if (transcript) transcripts.add(transcript);
    }
  }
  return [...transcripts];
}

/** GCPが受け付ける上限。 */
const MAX_SPEECH_ALTERNATIVES = 30;

export interface RecognizeSpeechDeps {
  fetchImpl?: typeof fetch;
  apiKey?: string;
}

export async function recognizeSpeech(
  input: RecognizeSpeechInput,
  deps?: RecognizeSpeechDeps,
): Promise<RecognizeSpeechResult | RecognizeSpeechFailure> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  // ダッシュボードから貼り付けたキーは前後に空白や改行が混ざりやすく、そのまま
  // クエリに載せると認証が通らないので、ここで落としておく。
  const apiKey = (deps?.apiKey ?? process.env.GOOGLE_CLOUD_SPEECH_API_KEY)?.trim();

  if (!apiKey) {
    return {
      success: false,
      reason: 'not_configured',
      error: 'GOOGLE_CLOUD_SPEECH_API_KEY が設定されていません',
    };
  }
  if (!input.audioBase64) {
    return { success: false, reason: 'invalid_audio', error: '音声データがありません' };
  }

  const config: Record<string, unknown> = {
    encoding: input.encoding,
    languageCode: input.languageCode ?? 'en-US',
    maxAlternatives: Math.min(
      Math.max(input.maxAlternatives ?? 1, 1),
      MAX_SPEECH_ALTERNATIVES,
    ),
    // 単語1語の短い発話が対象のため、通話・動画向けenhancedモデルは不要。
    model: 'default',
  };
  if (input.encoding === 'LINEAR16' && input.sampleRateHertz) {
    config.sampleRateHertz = input.sampleRateHertz;
  }

  // 期待する表記をヒントとして渡し、同音異義語の変換先を寄せる。
  const phrases = (input.phraseHints ?? [])
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);
  if (phrases.length > 0) {
    config.speechContexts = [{ phrases }];
  }

  try {
    const response = await fetchImpl(`${SPEECH_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config,
        audio: { content: input.audioBase64 },
      }),
    });

    const data = await response.json().catch(() => null) as CloudSpeechApiResponse | null;

    if (!response.ok) {
      return {
        success: false,
        reason: 'upstream',
        error: data?.error?.message || `Cloud Speech-to-Text HTTP ${response.status}`,
      };
    }

    const best = data ? pickBestAlternative(data) : null;
    return {
      success: true,
      transcript: best?.transcript?.trim() ?? '',
      confidence: typeof best?.confidence === 'number' ? best.confidence : 0,
      alternatives: data ? collectAlternatives(data) : [],
    };
  } catch (error) {
    return {
      success: false,
      reason: 'upstream',
      error: error instanceof Error ? error.message : 'Cloud Speech-to-Text への接続に失敗しました',
    };
  }
}
