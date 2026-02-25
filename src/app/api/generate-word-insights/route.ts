import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { isActiveProSubscription } from '@/lib/subscription/status';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readNumberEnv,
} from '@/lib/ai/feature-usage';
import {
  generateWordInsightsForWords,
  type WordInsightWordInput,
} from '@/lib/ai/generate-word-insights';

const requestSchema = z.object({
  words: z.array(
    z.object({
      id: z.string().trim().uuid(),
      english: z.string().trim().min(1).max(200),
      japanese: z.string().trim().min(1).max(300),
    }).strict(),
  ).min(1).max(50),
  force: z.boolean().optional().default(false),
}).strict();

type OwnedWordRow = {
  id: string;
  english: string;
  japanese: string;
  project_id: string;
  insights_generated_at: string | null;
  insights_version: number | null;
};

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効なリクエスト形式です',
    });
    if (!parsed.ok) return parsed.response;

    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end')
      .eq('user_id', user.id)
      .single();

    const isPro = isActiveProSubscription({
      status: subscription?.status,
      plan: subscription?.plan,
      proSource: subscription?.pro_source,
      testProExpiresAt: subscription?.test_pro_expires_at,
      currentPeriodEnd: subscription?.current_period_end,
    });

    if (!isPro) {
      return NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 });
    }

    if (isAiUsageLimitsEnabled()) {
      const usage = await checkAndIncrementFeatureUsage({
        supabase,
        featureKey: 'generate_word_insights',
        requirePro: true,
        freeDailyLimit: readNumberEnv('AI_LIMIT_WORD_INSIGHTS_FREE_DAILY', 0),
        proDailyLimit: readNumberEnv('AI_LIMIT_WORD_INSIGHTS_PRO_DAILY', 120),
      });

      if (!usage.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `本日の語法/関連語生成上限（${usage.limit ?? '∞'}回）に達しました。`,
            limitReached: true,
            usage: {
              currentCount: usage.current_count,
              limit: usage.limit,
              isPro: usage.is_pro,
              requiresPro: usage.requires_pro,
            },
          },
          { status: 429 },
        );
      }
    }

    const inputIds = Array.from(new Set(parsed.data.words.map((word) => word.id)));

    const { data: wordRows, error: wordsError } = await supabase
      .from('words')
      .select('id, english, japanese, project_id, insights_generated_at, insights_version')
      .in('id', inputIds);

    if (wordsError) {
      return NextResponse.json({ success: false, error: '単語データの取得に失敗しました。' }, { status: 500 });
    }

    const ownedRows = (wordRows ?? []) as OwnedWordRow[];
    if (ownedRows.length !== inputIds.length) {
      return NextResponse.json({ success: false, error: 'この単語にアクセスできません。' }, { status: 403 });
    }

    const projectIds = Array.from(new Set(ownedRows.map((row) => row.project_id)));
    const { data: ownedProjects, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .in('id', projectIds)
      .eq('user_id', user.id);

    if (projectError) {
      return NextResponse.json({ success: false, error: '所有権チェックに失敗しました。' }, { status: 500 });
    }

    if ((ownedProjects ?? []).length !== projectIds.length) {
      return NextResponse.json({ success: false, error: 'この単語にアクセスできません。' }, { status: 403 });
    }

    const force = parsed.data.force ?? false;
    const skipped = force
      ? []
      : ownedRows
        .filter((row) => row.insights_generated_at && (row.insights_version ?? 0) > 0)
        .map((row) => ({ wordId: row.id, reason: 'already_generated' }));

    const targets: WordInsightWordInput[] = ownedRows
      .filter((row) => force || !row.insights_generated_at || (row.insights_version ?? 0) <= 0)
      .map((row) => ({
        id: row.id,
        english: row.english,
        japanese: row.japanese,
      }));

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        skipped,
        failed: [],
      });
    }

    const generated = await generateWordInsightsForWords(targets);

    if (generated.successes.length > 0) {
      await Promise.all(generated.successes.map(async (item) => {
        const { error: updateError } = await supabase
          .from('words')
          .update({
            part_of_speech_tags: item.insight.partOfSpeechTags,
            related_words: item.insight.relatedWords,
            usage_patterns: item.insight.usagePatterns,
            insights_generated_at: item.insight.insightsGeneratedAt,
            insights_version: item.insight.insightsVersion,
          })
          .eq('id', item.wordId);

        if (updateError) {
          throw new Error(`Failed to persist insights for ${item.wordId}: ${updateError.message}`);
        }
      }));
    }

    return NextResponse.json({
      success: true,
      results: generated.successes.map((item) => ({
        wordId: item.wordId,
        ...item.insight,
      })),
      skipped: [...skipped, ...generated.skipped],
      failed: generated.failed,
    });
  } catch (error) {
    console.error('Generate word insights error:', error);
    return NextResponse.json({ success: false, error: '語法/関連語の生成に失敗しました。' }, { status: 500 });
  }
}
