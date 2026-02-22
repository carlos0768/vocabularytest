import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readBooleanEnv,
  readNumberEnv,
} from '@/lib/ai/feature-usage';

// API Route: POST /api/translate
// Translates an English word/phrase to Japanese using AI

const TRANSLATE_PROMPT = `あなたは英和辞典です。与えられた英単語・フレーズの日本語訳を返してください。

ルール:
- 日本語訳のみを返してください（説明不要）
- 複数の意味がある場合は最も一般的な訳を1つだけ返す
- 動詞の場合は「〜する」の形で返す
- 名詞・形容詞はそのまま返す
- フレーズの場合は自然な日本語訳を返す`;

const requestSchema = z.object({
  text: z.string().trim().min(1).max(300),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const requireAuth = readBooleanEnv('REQUIRE_AUTH_TRANSLATE', true);
    const enableUsageLimits = isAiUsageLimitsEnabled();
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (requireAuth && (authError || !user)) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    if (enableUsageLimits) {
      if (!user) {
        return NextResponse.json(
          { success: false, error: '認証が必要です。ログインしてください。' },
          { status: 401 }
        );
      }

      const usage = await checkAndIncrementFeatureUsage({
        supabase,
        featureKey: 'translate',
        freeDailyLimit: readNumberEnv('AI_LIMIT_TRANSLATE_FREE_DAILY', 100),
        proDailyLimit: readNumberEnv('AI_LIMIT_TRANSLATE_PRO_DAILY', 500),
      });

      if (!usage.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `本日の翻訳利用上限（${usage.limit ?? '∞'}回）に達しました。`,
            limitReached: true,
            usage: {
              currentCount: usage.current_count,
              limit: usage.limit,
              isPro: usage.is_pro,
              requiresPro: usage.requires_pro,
            },
          },
          { status: 429 }
        );
      }
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'テキストが必要です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { text } = parsed.data;

    const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || '';

    const config = {
      ...AI_CONFIG.defaults.openai,
      maxOutputTokens: 256,
    };
    const provider = getProviderFromConfig(config, { openai: openaiApiKey });

    const result = await provider.generateText(
      `${TRANSLATE_PROMPT}\n\n英語: ${text}`,
      config
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 503 }
      );
    }

    const japanese = result.content?.trim();

    if (!japanese) {
      return NextResponse.json(
        { success: false, error: '翻訳に失敗しました' },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, japanese });
  } catch (error) {
    console.error('Translate error:', error);
    return NextResponse.json(
      { success: false, error: '翻訳中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
