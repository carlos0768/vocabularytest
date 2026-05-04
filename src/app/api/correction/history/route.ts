import { NextRequest, NextResponse } from 'next/server';
import { requireProUser } from '@/lib/api/pro-auth';
import { previewText } from '@/lib/ai/correction-parser';

type CorrectionRow = {
  id: string;
  input_text: string;
  purpose: string;
  result: {
    title?: string;
    summary?: string;
    issueCounts?: { grammar?: number; usage?: number; naturalness?: number };
  } | null;
  score: number;
  word_count: number;
  issue_count: number;
  saved_words_count: number;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireProUser(request);
    if (!auth.ok) return auth.response;

    const { data, error } = await auth.supabase
      .from('correction_results')
      .select('id, input_text, purpose, result, score, word_count, issue_count, saved_words_count, created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ success: false, error: '履歴の取得に失敗しました' }, { status: 500 });
    }

    const items = ((data ?? []) as CorrectionRow[]).map((row) => ({
      id: row.id,
      title: row.result?.title || row.result?.summary || '英作文の添削',
      purpose: row.purpose,
      preview: previewText(row.input_text),
      score: row.score,
      wordCount: row.word_count,
      issueCount: row.issue_count,
      savedWordsCount: row.saved_words_count,
      issueCounts: row.result?.issueCounts ?? { grammar: 0, usage: 0, naturalness: 0 },
      createdAt: row.created_at,
    }));

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error('[correction/history] failed:', error);
    return NextResponse.json({ success: false, error: '履歴の取得に失敗しました' }, { status: 500 });
  }
}
