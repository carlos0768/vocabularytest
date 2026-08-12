import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readBooleanEnv,
  readNumberEnv,
} from '@/lib/ai/feature-usage';
import { recognizeSpeech } from '@/lib/speech/cloud-speech-to-text';

// 数秒のopus音声を想定。base64換算で余裕を持たせつつ濫用を防ぐ上限。
const MAX_AUDIO_BASE64_LENGTH = 2_000_000;

const requestSchema = z.object({
  audioBase64: z.string().trim().min(1).max(MAX_AUDIO_BASE64_LENGTH),
  encoding: z.enum(['WEBM_OPUS', 'OGG_OPUS']),
}).strict();

interface RecognizeVoiceQuizDeps {
  createClient?: typeof createRouteHandlerClient;
  recognize?: typeof recognizeSpeech;
}

function getDeps(deps?: RecognizeVoiceQuizDeps) {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    recognize: deps?.recognize ?? recognizeSpeech,
  };
}

export async function handleVoiceQuizRecognizePost(
  request: NextRequest,
  deps?: RecognizeVoiceQuizDeps,
) {
  try {
    const { createClient, recognize } = getDeps(deps);
    const requireAuth = readBooleanEnv('REQUIRE_AUTH_VOICE_QUIZ_RECOGNIZE', true);
    const enableUsageLimits = isAiUsageLimitsEnabled();

    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (requireAuth && (authError || !user)) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    if (enableUsageLimits && user) {
      const usage = await checkAndIncrementFeatureUsage({
        supabase,
        featureKey: 'voice_quiz_recognize',
        freeDailyLimit: readNumberEnv('AI_LIMIT_VOICE_QUIZ_FREE_DAILY', 30),
        proDailyLimit: readNumberEnv('AI_LIMIT_VOICE_QUIZ_PRO_DAILY', 300),
      });

      if (!usage.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `本日の音読チャレンジ利用上限（${usage.limit ?? '∞'}回）に達しました。`,
            limitReached: true,
          },
          { status: 429 },
        );
      }
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '音声データの形式が不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = await recognize({
      audioBase64: parsed.data.audioBase64,
      encoding: parsed.data.encoding,
      languageCode: 'en-US',
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      confidence: result.confidence,
    });
  } catch (error) {
    console.error('Voice quiz recognize error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleVoiceQuizRecognizePost(request);
}
