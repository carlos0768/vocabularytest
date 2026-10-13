import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  generateWordOrderQuizForWords,
  type WordOrderQuizWordInput,
} from '@/lib/ai/generate-word-order-quiz';
import { getBearerToken } from '@/lib/api/bearer-token';

const requestSchema = z.object({
  words: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    english: z.string().trim().min(1).max(200),
    japanese: z.string().trim().min(1).max(300),
  }).strict()).min(1).max(30),
}).strict();

interface GenerateWordOrderQuizDeps {
  createClient?: typeof createRouteHandlerClient;
  generate?: typeof generateWordOrderQuizForWords;
}

function getDeps(deps?: GenerateWordOrderQuizDeps) {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    generate: deps?.generate ?? generateWordOrderQuizForWords,
  };
}

export async function handleGenerateWordOrderQuizPost(
  request: NextRequest,
  deps?: GenerateWordOrderQuizDeps,
) {
  try {
    const { createClient, generate } = getDeps(deps);
    const supabase = await createClient(request);
    const bearerToken = getBearerToken(request);
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 },
      );
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語リストが必要です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { words } = parsed.data as { words: WordOrderQuizWordInput[] };
    const results = await generate(words);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Generate word-order quiz error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleGenerateWordOrderQuizPost(request);
}
