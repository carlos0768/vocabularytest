import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readNumberEnv,
} from '@/lib/ai/feature-usage';
import { extractRepresentativeEnglish, resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const requestSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  sourceApp: z.string().trim().max(120).optional(),
  locale: z.string().trim().max(32).optional(),
}).strict();

const TRANSLATE_PROMPT = `あなたは英和辞典です。与えられた英単語・フレーズの日本語訳を返してください。

ルール:
- 日本語訳のみを返してください（説明不要）
- 複数の意味がある場合は最も一般的な訳を1つだけ返す
- 動詞の場合は「〜する」の形で返す
- 名詞・形容詞はそのまま返す
- フレーズの場合は自然な日本語訳を返す`;

type UsageResult = {
  allowed: boolean;
  requires_pro: boolean;
  current_count: number;
  limit: number | null;
  is_pro: boolean;
};

type PreviewDeps = {
  resolveUser: (request: NextRequest) => Promise<{ id: string } | null>;
  checkUsage: (request: NextRequest) => Promise<UsageResult>;
  translateToJapanese: (english: string) => Promise<string>;
};

const defaultDeps: PreviewDeps = {
  resolveUser: resolveAuthenticatedUser,
  async checkUsage(request: NextRequest) {
    const supabase = await createRouteHandlerClient(request);
    return checkAndIncrementFeatureUsage({
      supabase,
      featureKey: 'translate',
      freeDailyLimit: readNumberEnv('AI_LIMIT_TRANSLATE_FREE_DAILY', 100),
      proDailyLimit: readNumberEnv('AI_LIMIT_TRANSLATE_PRO_DAILY', 500),
    });
  },
  async translateToJapanese(english: string) {
    const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || '';
    const config = {
      ...AI_CONFIG.defaults.openai,
      maxOutputTokens: 256,
    };
    const provider = getProviderFromConfig(config, { openai: openaiApiKey });
    const result = await provider.generateText(`${TRANSLATE_PROMPT}\n\n英語: ${english}`, config);
    if (!result.success || !result.content?.trim()) {
      throw new Error('translation_failed');
    }
    return result.content.trim();
  },
};

export async function handleShareImportPreviewPost(
  request: NextRequest,
  deps: PreviewDeps = defaultDeps,
) {
  try {
    const user = await deps.resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'テキストが必要です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    if (isAiUsageLimitsEnabled()) {
      const usage = await deps.checkUsage(request);
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

    const candidate = extractRepresentativeEnglish(parsed.data.text);
    if (!candidate) {
      return NextResponse.json(
        { success: false, error: '英単語を判定できませんでした。' },
        { status: 422 }
      );
    }

    const japanese = await deps.translateToJapanese(candidate.english);
    const warnings = candidate.wasSentence
      ? ['文入力のため代表1語に絞りました']
      : [];

    return NextResponse.json({
      success: true,
      candidate: {
        english: candidate.english,
        japanese,
        wasSentence: candidate.wasSentence,
        warnings,
      },
    });
  } catch (error) {
    console.error('share-import preview error:', error);
    return NextResponse.json(
      { success: false, error: 'プレビュー生成に失敗しました。' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleShareImportPreviewPost(request);
}
