import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { RESOLVED_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';
import { mapWordFromRow, type WordRow } from '../../../../../shared/db';
import { requireSharedProjectAccess } from '../shared';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await requireSharedProjectAccess(request, projectId);
    if (!access.ok) {
      return access.response;
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('words')
      .select(RESOLVED_WORD_SELECT_COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message || 'shared_project_words_lookup_failed');
    }

    return NextResponse.json({
      success: true,
      project: access.access.project,
      accessRole: access.access.accessRole,
      collaboratorCount: access.access.collaboratorCount,
      words: ((data ?? []) as WordRow[]).map(mapWordFromRow),
    });
  } catch (error) {
    console.error('shared-project detail error:', error);
    return NextResponse.json({ success: false, error: '共有単語帳の読み込みに失敗しました。' }, { status: 500 });
  }
}
