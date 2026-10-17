import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { buildClozeQuestionsForWords, createSupabaseClozeDataSource } from '@/lib/cloze/server';

/**
 * 空所補充クイズの出題を組み立てる。
 * 出題文は Tatoeba 由来の cloze_sentences、誤答は lexicon_entries から取り、AI は呼ばない
 * のでコインも消費しない。読むのはどちらも全ユーザー共通のマスターだけ。
 */

const requestSchema = z.object({
  words: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      english: z.string().trim().min(1).max(200),
      japanese: z.string().trim().min(1).max(300),
      translations: z.array(z.string().trim().max(300)).max(20).optional(),
      lexiconEntryId: z.string().uuid().nullish(),
      partOfSpeechTags: z.array(z.string().trim().max(40)).max(10).nullish(),
      cefrLevel: z.string().trim().max(4).nullish(),
    }).strict(),
  ).min(1).max(40),
  limit: z.number().int().min(1).max(30).optional(),
}).strict();

interface ClozeQuestionsDeps {
  createClient?: typeof createRouteHandlerClient;
}

export async function handleClozeQuestionsPost(request: NextRequest, deps?: ClozeQuestionsDeps) {
  try {
    const createClient = deps?.createClient ?? createRouteHandlerClient;
    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const bodyResult = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語リストが必要です',
    });
    if (!bodyResult.ok) return bodyResult.response;

    const { words, limit } = bodyResult.data;
    const result = await buildClozeQuestionsForWords(words, createSupabaseClozeDataSource(supabase), { limit });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('cloze questions error:', error);
    return NextResponse.json(
      { success: false, error: '問題の作成に失敗しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleClozeQuestionsPost(request);
}
