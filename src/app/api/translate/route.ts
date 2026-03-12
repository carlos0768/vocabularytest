import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { resolveOrCreateLexiconEntry } from '@/lib/lexicon/resolver';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readBooleanEnv,
  readNumberEnv,
} from '@/lib/ai/feature-usage';

// API Route: POST /api/translate
// Translates an English word/phrase to Japanese using AI

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

    const entry = await resolveOrCreateLexiconEntry({
      english: text,
      partOfSpeechTags: ['other'],
    });
    const japanese = entry?.translationJa?.trim();

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
