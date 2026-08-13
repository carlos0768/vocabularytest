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
import { recognizeSpeech, type RecognizeSpeechFailureReason } from '@/lib/speech/cloud-speech-to-text';

// 設定ミスを502で返すと上流障害と見分けがつかないので、種別ごとにステータスを分ける。
const RECOGNIZE_FAILURE_STATUS: Record<RecognizeSpeechFailureReason, number> = {
  not_configured: 500,
  invalid_audio: 400,
  upstream: 502,
};

// 内部のエラーメッセージ(APIキー名やGCPの生の文言)はクライアントに出さない。
const RECOGNIZE_FAILURE_MESSAGE: Record<RecognizeSpeechFailureReason, string> = {
  not_configured: '音声認識が利用できません。時間をおいてお試しください。',
  invalid_audio: '音声を認識できませんでした。もう一度お試しください。',
  upstream: '音声認識に失敗しました。もう一度お試しください。',
};

// 数秒のopus音声を想定。base64換算で余裕を持たせつつ濫用を防ぐ上限。
const MAX_AUDIO_BASE64_LENGTH = 2_000_000;

// 出題方向によって認識する言語が変わる。任意の値を通すとGCPへの素通しに
// なるので、こちらで扱う2言語だけに閉じる。
const SUPPORTED_LANGUAGE_CODES = ['en-US', 'ja-JP'] as const;
const DEFAULT_LANGUAGE_CODE = 'ja-JP';

// 同音異義語を拾うための候補数。多すぎても判定が緩くなるだけなので絞る。
const VOICE_QUIZ_MAX_ALTERNATIVES = 5;

// 無料プランの1日あたりの認識回数。ここは据え置き。
const VOICE_QUIZ_FREE_DAILY_LIMIT = 30;

/**
 * Proプランは音読チャレンジを無制限に解ける。
 *
 * `check_and_increment_feature_usage` は 0 以下の上限を「上限なし」(limit=NULL)
 * として扱う。回数の記録自体は続くので、コストの実績は今まで通り
 * `feature_usage_daily` から追える。
 */
const VOICE_QUIZ_PRO_DAILY_UNLIMITED = 0;

const requestSchema = z.object({
  audioBase64: z.string().trim().min(1).max(MAX_AUDIO_BASE64_LENGTH),
  /**
   * LINEAR16 は iOS Safari 用。あの端末は webm/ogg を要求しても mp4(AAC) で
   * 録音し、GCPはAACを受け取れないので、クライアントで生PCMに直して送る。
   */
  encoding: z.enum(['WEBM_OPUS', 'OGG_OPUS', 'LINEAR16']),
  /** LINEAR16 はコンテナが無いので、レートを添えないと解釈できない。 */
  sampleRateHertz: z.number().int().min(8000).max(48000).optional(),
  languageCode: z.enum(SUPPORTED_LANGUAGE_CODES).optional(),
  /**
   * 認識のヒント。日本語は同音異義語が別の漢字に変換されやすく、正しく答えても
   * 表記違いで不正解になる。期待する語を渡して変換先を寄せる。
   * 答えそのものなので、ログにも応答にも出さない。
   */
  phraseHints: z.array(z.string().trim().min(1).max(100)).max(8).optional(),
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
        freeDailyLimit: readNumberEnv(
          'AI_LIMIT_VOICE_QUIZ_FREE_DAILY',
          VOICE_QUIZ_FREE_DAILY_LIMIT,
        ),
        proDailyLimit: readNumberEnv(
          'AI_LIMIT_VOICE_QUIZ_PRO_DAILY',
          VOICE_QUIZ_PRO_DAILY_UNLIMITED,
        ),
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

    const languageCode = parsed.data.languageCode ?? DEFAULT_LANGUAGE_CODE;

    // 生PCMをレート無しで受けると、GCPが読み違えて必ず認識できない。
    if (parsed.data.encoding === 'LINEAR16' && !parsed.data.sampleRateHertz) {
      return NextResponse.json(
        { success: false, error: '音声データの形式が不正です' },
        { status: 400 },
      );
    }

    const result = await recognize({
      audioBase64: parsed.data.audioBase64,
      encoding: parsed.data.encoding,
      sampleRateHertz: parsed.data.sampleRateHertz,
      languageCode,
      phraseHints: parsed.data.phraseHints,
      maxAlternatives: VOICE_QUIZ_MAX_ALTERNATIVES,
    });

    if (!result.success) {
      // 失敗の詳細はサーバーログにだけ残す。ここを無言で502にしていたため、
      // 「APIキー未設定」も「上流エラー」も本番では区別がつかなかった。
      console.error(
        `Voice quiz recognize failed (${result.reason}, encoding=${parsed.data.encoding}, lang=${languageCode}, bytes=${parsed.data.audioBase64.length}): ${result.error}`,
      );

      return NextResponse.json(
        { success: false, error: RECOGNIZE_FAILURE_MESSAGE[result.reason] },
        { status: RECOGNIZE_FAILURE_STATUS[result.reason] },
      );
    }

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      confidence: result.confidence,
      // 同音異義語の別変換を判定側で拾えるように候補も返す。
      alternatives: result.alternatives,
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
