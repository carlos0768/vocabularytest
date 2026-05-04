import { NextRequest, NextResponse } from 'next/server';
import { requireProUser } from '@/lib/api/pro-auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params) {
  try {
    const auth = await requireProUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const { data, error } = await auth.supabase
      .from('parser_results')
      .select('id, input_text, depth, result, word_count, clause_count, saved_words_count, created_at')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '解析結果が見つかりません' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      result: {
        id: data.id,
        inputText: data.input_text,
        depth: data.depth,
        wordCount: data.word_count,
        clauseCount: data.clause_count,
        savedWordsCount: data.saved_words_count,
        createdAt: data.created_at,
        ...(data.result as Record<string, unknown>),
      },
    });
  } catch (error) {
    console.error('[parser/detail] failed:', error);
    return NextResponse.json({ success: false, error: '解析結果の取得に失敗しました' }, { status: 500 });
  }
}
