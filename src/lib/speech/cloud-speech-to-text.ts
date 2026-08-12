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
}

export interface RecognizeSpeechResult {
  success: true;
  transcript: string;
  confidence: number;
}

export interface RecognizeSpeechFailure {
  success: false;
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

export interface RecognizeSpeechDeps {
  fetchImpl?: typeof fetch;
  apiKey?: string;
}

export async function recognizeSpeech(
  input: RecognizeSpeechInput,
  deps?: RecognizeSpeechDeps,
): Promise<RecognizeSpeechResult | RecognizeSpeechFailure> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const apiKey = deps?.apiKey ?? process.env.GOOGLE_CLOUD_SPEECH_API_KEY;

  if (!apiKey) {
    return { success: false, error: 'GOOGLE_CLOUD_SPEECH_API_KEY が設定されていません' };
  }
  if (!input.audioBase64) {
    return { success: false, error: '音声データがありません' };
  }

  const config: Record<string, unknown> = {
    encoding: input.encoding,
    languageCode: input.languageCode ?? 'en-US',
    maxAlternatives: 1,
    // 単語1語の短い発話が対象のため、通話・動画向けenhancedモデルは不要。
    model: 'default',
  };
  if (input.encoding === 'LINEAR16' && input.sampleRateHertz) {
    config.sampleRateHertz = input.sampleRateHertz;
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
        error: data?.error?.message || `Cloud Speech-to-Text HTTP ${response.status}`,
      };
    }

    const best = data ? pickBestAlternative(data) : null;
    return {
      success: true,
      transcript: best?.transcript?.trim() ?? '',
      confidence: typeof best?.confidence === 'number' ? best.confidence : 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cloud Speech-to-Text への接続に失敗しました',
    };
  }
}
