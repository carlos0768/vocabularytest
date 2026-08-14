import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
} from '@/lib/ai/feature-usage';
import {
  synthesizeSpeech,
  validateTtsText,
  type SynthesizeSpeechFailureReason,
  type TtsLang,
} from '@/lib/speech/cloud-text-to-speech';

/**
 * 単語の読み上げ音声 (mp3) を返す。
 *
 * iOS は画面ロック中に SpeechSynthesis が発話しないため、フラッシュカードの
 * 自動再生を「画面を消しても鳴り続ける」ようにするには、読み上げを普通の
 * オーディオ再生に置き換える必要がある。その音源をここで返す。
 *
 * GET にしているのは、同じ単語の音声をブラウザのHTTPキャッシュにそのまま
 * 載せられるようにするため。`<audio src>` に直接URLを渡せるので、Blob の
 * 寿命管理も要らず、iOS のメディア再生に素直に乗る。
 */

// 単語・訳・例文を想定した1日あたりの上限。キャッシュが効くので、
// 同じ単語を何度再生してもサーバーには一度しか来ない。
const TTS_FREE_DAILY_LIMIT = 400;

// Proは上限なし (0 = limit NULL 扱い)。記録は続くのでコストは追える。
const TTS_PRO_DAILY_UNLIMITED = 0;

const SUPPORTED_LANGS: readonly TtsLang[] = ['en', 'ja'];

// 設定ミスを502で返すと上流障害と見分けがつかないので種別ごとに分ける。
const FAILURE_STATUS: Record<SynthesizeSpeechFailureReason, number> = {
  not_configured: 500,
  invalid_text: 400,
  upstream: 502,
};

const FAILURE_MESSAGE: Record<SynthesizeSpeechFailureReason, string> = {
  not_configured: '音声の読み上げが利用できません。',
  invalid_text: '読み上げるテキストが不正です。',
  upstream: '音声の生成に失敗しました。',
};

interface TtsDeps {
  createClient?: typeof createRouteHandlerClient;
  synthesize?: typeof synthesizeSpeech;
}

function parseLang(value: string | null): TtsLang | null {
  return SUPPORTED_LANGS.find((lang) => lang === value) ?? null;
}

export async function handleTtsGet(request: NextRequest, deps?: TtsDeps) {
  const createClient = deps?.createClient ?? createRouteHandlerClient;
  const synthesize = deps?.synthesize ?? synthesizeSpeech;

  try {
    const url = new URL(request.url);
    const text = validateTtsText(url.searchParams.get('text'));
    const lang = parseLang(url.searchParams.get('lang'));

    if (!text || !lang) {
      return NextResponse.json(
        { success: false, error: FAILURE_MESSAGE.invalid_text },
        { status: 400 },
      );
    }

    const supabase = await createClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    if (isAiUsageLimitsEnabled()) {
      const usage = await checkAndIncrementFeatureUsage({
        supabase,
        featureKey: 'word_tts',
        requirePro: false,
        freeDailyLimit: TTS_FREE_DAILY_LIMIT,
        proDailyLimit: TTS_PRO_DAILY_UNLIMITED,
      });
      if (!usage.allowed) {
        return NextResponse.json(
          { success: false, error: '本日の読み上げ回数の上限に達しました。' },
          { status: 429 },
        );
      }
    }

    const result = await synthesize({ text, lang });
    if (!result.success) {
      // GCP の生のメッセージやAPIキー名はクライアントに出さない。
      console.error('[tts] synthesize failed:', result.reason, result.error);
      return NextResponse.json(
        { success: false, error: FAILURE_MESSAGE[result.reason] },
        { status: FAILURE_STATUS[result.reason] },
      );
    }

    const audio = Buffer.from(result.audioBase64, 'base64');
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.byteLength),
        // URLがテキストそのもので決まるので、内容が変わることはない。
        // 個人のリクエストなので private (共有キャッシュには載せない)。
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[tts] unexpected error:', error);
    return NextResponse.json(
      { success: false, error: FAILURE_MESSAGE.upstream },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleTtsGet(request);
}
