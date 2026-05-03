import { NextRequest, NextResponse } from 'next/server';
import { requireProUser } from '@/lib/api/pro-auth';

type StatRow = {
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
      .select('clause_count, saved_words_count, created_at')
      .eq('user_id', auth.user.id);

    if (error) {
      return NextResponse.json({ success: false, error: '統計の取得に失敗しました' }, { status: 500 });
    }

    const rows = (data ?? []) as StatRow[];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const totalAnalyses = rows.length;
    const avgClauseCount = totalAnalyses
      ? Math.round((rows.reduce((sum, row) => sum + row.clause_count, 0) / totalAnalyses) * 10) / 10
      : 0;
    const monthDelta = rows.filter((row) => Date.parse(row.created_at) >= monthStart).length;
    const savedWordsTotal = rows.reduce((sum, row) => sum + (row.saved_words_count || 0), 0);

    return NextResponse.json({ success: true, stats: { totalAnalyses, monthDelta, avgClauseCount, savedWordsTotal } });
  } catch (error) {
    console.error('[parser/stats] failed:', error);
    return NextResponse.json({ success: false, error: '統計の取得に失敗しました' }, { status: 500 });
  }
}
