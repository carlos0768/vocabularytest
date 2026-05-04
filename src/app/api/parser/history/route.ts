import { NextRequest, NextResponse } from 'next/server';
import { requireProUser } from '@/lib/api/pro-auth';
import { previewText } from '@/lib/ai/correction-parser';

type ParserRow = {
  id: string;
  input_text: string;
  depth: 'simple' | 'clause' | 'tree';
  result: { title?: string; summary?: string } | null;
  word_count: number;
  clause_count: number;
  saved_words_count: number;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireProUser(request);
    if (!auth.ok) return auth.response;

    const { data, error } = await auth.supabase
      .from('parser_results')
      .select('id, input_text, depth, result, word_count, clause_count, saved_words_count, created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ success: false, error: '履歴の取得に失敗しました' }, { status: 500 });
    }

    const items = ((data ?? []) as ParserRow[]).map((row) => ({
      id: row.id,
      title: row.result?.title || row.result?.summary || '英文の構造解析',
      depth: row.depth,
      preview: previewText(row.input_text, 140),
      wordCount: row.word_count,
      clauseCount: row.clause_count,
      savedWordsCount: row.saved_words_count,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error('[parser/history] failed:', error);
    return NextResponse.json({ success: false, error: '履歴の取得に失敗しました' }, { status: 500 });
  }
}
