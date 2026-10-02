import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readNumberEnv,
} from '@/lib/ai/feature-usage';
import { recognizeSpeech, type RecognizeSpeechFailureReason } from '@/lib/speech/cloud-speech-to-text';
import { splitDictatedTranscript } from '@/lib/speech/dictated-words';

/**
 * 音声で単語を追加する (読み上げた英単語の並び → 見出し語の一覧)。
 *
 * 録音は音読チャレンジと同じく MediaRecorder で取り、GCP Cloud Speech-to-Text で
 * 書き起こす。ブラウザの SpeechRecognition は iOS のPWAで動かないため。
 * ここでは一覧を返すだけで保存はしない —— 認識違いを直してから、
 * 手入力と同じ経路 (enrich-manual → createWords) で追加する。
 */

// 1回の録音で約1分。認識とAIの区切りを合わせても既定の上限で収まるが、余裕を持たせる。
export const maxDuration = 60;

const RECOGNIZE_FAILURE_STATUS: Record<RecognizeSpeechFailureReason, number> = {
  not_configured: 500,
  invalid_audio: 400,
  upstream: 502,
};

const RECOGNIZE_FAILURE_MESSAGE: Record<RecognizeSpeechFailureReason, string> = {
  not_configured: '音声認識が利用できません。時間をおいてお試しください。',
  invalid_audio: '音声を認識できませんでした。もう一度お試しください。',
  upstream: '音声認識に失敗しました。もう一度お試しください。',
};

/**
 * 同期認識 (speech:recognize) は1分までの音声しか受け付けない。
 * 生PCM (16kHz) で約45秒ぶんが base64 で240万文字ほど。opus ならずっと小さい。
 */
const MAX_AUDIO_BASE64_LENGTH = 3_000_000;

/** 無料プランの1日あたりの回数。1回で何十語も入るので、手入力より絞っても困らない。 */
const VOICE_INPUT_FREE_DAILY_LIMIT = 10;

/** Proは無制限。0以下は `check_and_increment_feature_usage` が「上限なし」と扱う。 */
const VOICE_INPUT_PRO_DAILY_UNLIMITED = 0;

const requestSchema = z.object({
  audioBase64: z.string().trim().min(1).max(MAX_AUDIO_BASE64_LENGTH),
  /** LINEAR16 は iOS Safari 用 (mp4/AAC はGCPが受け取れないので生PCMに直して送る)。 */
  encoding: z.enum(['WEBM_OPUS', 'OGG_OPUS', 'LINEAR16']),
  sampleRateHertz: z.number().int().min(8000).max(48000).optional(),
}).strict();

interface VoiceInputDeps {
  createClient?: typeof createRouteHandlerClient;
  recognize?: typeof recognizeSpeech;
  splitTranscript?: typeof splitDictatedTranscript;
}

export async function handleWordVoiceInputPost(request: NextRequest, deps?: VoiceInputDeps) {
  try {
    const createClient = deps?.createClient ?? createRouteHandlerClient;
    const recognize = deps?.recognize ?? recognizeSpeech;
    const splitTranscript = deps?.splitTranscript ?? splitDictatedTranscript;

    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    // 音声認識は従量課金なので、ログインなしでは通さない。
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '音声データの形式が不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    // 生PCMをレート無しで受けると、GCPが読み違えて必ず認識できない。
    if (parsed.data.encoding === 'LINEAR16' && !parsed.data.sampleRateHertz) {
      return NextResponse.json(
        { success: false, error: '音声データの形式が不正です' },
        { status: 400 },
      );
    }

    // 形式の不正で回数を減らさないよう、検証のあとで数える。
    if (isAiUsageLimitsEnabled()) {
      const usage = await checkAndIncrementFeatureUsage({
        supabase,
        featureKey: 'word_voice_input',
        freeDailyLimit: readNumberEnv('AI_LIMIT_WORD_VOICE_INPUT_FREE_DAILY', VOICE_INPUT_FREE_DAILY_LIMIT),
        proDailyLimit: readNumberEnv('AI_LIMIT_WORD_VOICE_INPUT_PRO_DAILY', VOICE_INPUT_PRO_DAILY_UNLIMITED),
      });

      if (!usage.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `本日の音声追加の利用上限（${usage.limit ?? '∞'}回）に達しました。`,
            limitReached: true,
          },
          { status: 429 },
        );
      }
    }

    const result = await recognize({
      audioBase64: parsed.data.audioBase64,
      encoding: parsed.data.encoding,
      sampleRateHertz: parsed.data.sampleRateHertz,
      languageCode: 'en-US',
    });

    if (!result.success) {
      console.error(
        `Word voice input recognize failed (${result.reason}, encoding=${parsed.data.encoding}, bytes=${parsed.data.audioBase64.length}): ${result.error}`,
      );
      return NextResponse.json(
        { success: false, error: RECOGNIZE_FAILURE_MESSAGE[result.reason] },
        { status: RECOGNIZE_FAILURE_STATUS[result.reason] },
      );
    }

    // 長い発話は複数の結果に分かれて返る。最初の1件だけだと後半の語を落とす。
    const transcript = (result.segments && result.segments.length > 0
      ? result.segments.join(' ')
      : result.transcript
    ).trim();
    const words = transcript ? await splitTranscript(transcript) : [];

    return NextResponse.json({ success: true, transcript, words });
  } catch (error) {
    console.error('Word voice input error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleWordVoiceInputPost(request);
}
