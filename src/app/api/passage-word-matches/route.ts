import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { parseJsonWithSchema } from '@/lib/api/validation';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import {
  MAX_CANDIDATES_PER_CALL,
  MAX_TEXT_LENGTH,
} from '@/lib/ai/match-passage-words';
import { matchPassageWords } from '@/lib/ai/match-passage-words.server';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readBooleanEnv,
  readNumberEnv,
} from '@/lib/ai/feature-usage';

// POST /api/passage-word-matches
//
// Given a passage and a vocabulary list, ask an LLM to locate each target
// word/idiom/phrase in the passage (handling inflections and templatic
// expressions). Returns a list of `{ id, matchedText }` tuples that the
// client overlays on top of the existing exact-match highlights.
//
// Issue #91: the client-only word-boundary regex cannot cope with
// inflected verbs or templated idioms like "any other ~ than A".

const candidateSchema = z.object({
  id: z.string().min(1).max(64),
  english: z.string().trim().min(1).max(200),
  partOfSpeechTags: z.array(z.string().max(64)).max(10).optional(),
});

const requestSchema = z
  .object({
    text: z.string().min(1).max(MAX_TEXT_LENGTH),
    candidates: z.array(candidateSchema).max(MAX_CANDIDATES_PER_CALL * 2),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const requireAuth = readBooleanEnv(
      'REQUIRE_AUTH_PASSAGE_MATCH',
      true,
    );
    const enableUsageLimits = isAiUsageLimitsEnabled();
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (requireAuth && (authError || !user)) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    if (enableUsageLimits) {
      if (!user) {
        return NextResponse.json(
          { success: false, error: '認証が必要です。ログインしてください。' },
          { status: 401 },
        );
      }
      const usage = await checkAndIncrementFeatureUsage({
        supabase,
        featureKey: 'passage_match',
        freeDailyLimit: readNumberEnv(
          'AI_LIMIT_PASSAGE_MATCH_FREE_DAILY',
          200,
        ),
        proDailyLimit: readNumberEnv(
          'AI_LIMIT_PASSAGE_MATCH_PRO_DAILY',
          2000,
        ),
      });
      if (!usage.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `本日の利用上限（${usage.limit ?? '∞'}回）に達しました。`,
            limitReached: true,
          },
          { status: 429 },
        );
      }
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'リクエスト形式が不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = await matchPassageWords({
      text: parsed.data.text,
      candidates: parsed.data.candidates,
    });

    return NextResponse.json({ success: true, matches: result.matches });
  } catch (error) {
    console.error('passage-word-matches error:', error);
    return NextResponse.json(
      { success: false, error: '本文解析中にエラーが発生しました' },
      { status: 500 },
    );
  }
}
