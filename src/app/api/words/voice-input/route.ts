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
import { resolveSpokenEntry } from '@/lib/speech/dictated-words';

/**
 * 音声で単語を追加する (1回の録音 → 見出し語1つ)。
 *
 * 録音は音読チャレンジと同じく MediaRecorder で取り、GCP Cloud Speech-to-Text で
 * 書き起こす。ブラウザの SpeechRecognition は iOS のPWAで動かないため。
 * ここでは見出し語を返すだけで保存はしない —— 一覧で直してから、
 * 手入力と同じ経路 (enrich-manual → createWords) で追加する。
 *
 * 日本人の発音の英語は en-US だけだと別の語に化けやすいので、ja-JP でも
 * 同時に認識する (カタカナで拾える)。両方の候補から1語に決めるのは
 * `resolveSpokenEntry`。
 */

export const maxDuration = 30;

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
 * 1語ぶんの録音 (最長10秒) を想定した上限。生PCM (16kHz) の10秒が
 * base64 で約43万文字。opus ならずっと小さい。
 */
const MAX_AUDIO_BASE64_LENGTH = 1_000_000;

/** 候補数。日本語なまりで化けたときに、正しい語が下位に残っていることがある。 */
const RECOGNIZE_MAX_ALTERNATIVES = 5;

/**
 * 無料プランの1日あたりの回数。1回の録音で1語なので、音読チャレンジ
 * (1回答 = 1回) と同じ数にそろえる。
 */
const VOICE_INPUT_FREE_DAILY_LIMIT = 30;

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
  resolveEntry?: typeof resolveSpokenEntry;
}

export async function handleWordVoiceInputPost(request: NextRequest, deps?: VoiceInputDeps) {
  try {
    const createClient = deps?.createClient ?? createRouteHandlerClient;
    const recognize = deps?.recognize ?? recognizeSpeech;
    const resolveEntry = deps?.resolveEntry ?? resolveSpokenEntry;

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

    const audio = {
      audioBase64: parsed.data.audioBase64,
      encoding: parsed.data.encoding,
      sampleRateHertz: parsed.data.sampleRateHertz,
      maxAlternatives: RECOGNIZE_MAX_ALTERNATIVES,
    };
    // 英語と日本語の認識は互いに待たないので並べて投げる (待ち時間は長いほう1回ぶん)。
    const [englishResult, japaneseResult] = await Promise.all([
      recognize({ ...audio, languageCode: 'en-US' }),
      recognize({ ...audio, languageCode: 'ja-JP' }),
    ]);

    // 日本語側は補助。英語側が通っていれば、日本語側の失敗は無視して続ける。
    // 両方落ちたときだけ失敗を返す (英語側の理由を優先)。
    if (!englishResult.success && !japaneseResult.success) {
      console.error(
        `Word voice input recognize failed (${englishResult.reason}, encoding=${parsed.data.encoding}, bytes=${parsed.data.audioBase64.length}): ${englishResult.error}`,
      );
      return NextResponse.json(
        { success: false, error: RECOGNIZE_FAILURE_MESSAGE[englishResult.reason] },
        { status: RECOGNIZE_FAILURE_STATUS[englishResult.reason] },
      );
    }

    // 最有力は alternatives の先頭にも入っているので、重ねないようにまとめる。
    const english = englishResult.success
      ? [...new Set([englishResult.transcript, ...englishResult.alternatives].filter(Boolean))]
      : [];
    const japanese = japaneseResult.success
      ? [...new Set([japaneseResult.transcript, ...japaneseResult.alternatives].filter(Boolean))]
      : [];

    const word = english.length > 0 || japanese.length > 0
      ? await resolveEntry({
        english,
        englishConfidence: englishResult.success ? englishResult.confidence : 0,
        japanese,
      })
      : null;

    return NextResponse.json({
      success: true,
      word,
      transcript: englishResult.success ? englishResult.transcript : '',
    });
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
