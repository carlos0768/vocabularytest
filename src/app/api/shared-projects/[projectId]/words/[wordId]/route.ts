import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { RESOLVED_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';
import { mapWordFromRow, type WordRow } from '../../../../../../../shared/db';
import { requireSharedProjectAccess } from '../../../shared';

const updateSchema = z.object({
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().min(1).max(300),
}).strict();

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; wordId: string }> },
) {
  try {
    const { projectId, wordId } = await context.params;
    const access = await requireSharedProjectAccess(request, projectId);
    if (!access.ok) {
      return access.response;
    }

    const parsed = await parseJsonWithSchema(request, updateSchema, {
      invalidMessage: '更新データが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const admin = getSupabaseAdmin();
    const { data: existingWord, error: existingError } = await admin
      .from('words')
      .select('id, english')
      .eq('id', wordId)
      .eq('project_id', projectId)
      .maybeSingle<{ id: string; english: string }>();

    if (existingError) {
      throw new Error(existingError.message || 'shared_word_lookup_failed');
    }
    if (!existingWord) {
      return NextResponse.json({ success: false, error: '単語が見つかりません。' }, { status: 404 });
    }

    const englishChanged = existingWord.english !== parsed.data.english;
    const updateRow: Record<string, unknown> = {
      english: parsed.data.english,
      japanese: parsed.data.japanese,
    };

    if (englishChanged) {
      updateRow.part_of_speech_tags = null;
      updateRow.related_words = null;
      updateRow.usage_patterns = null;
      updateRow.insights_generated_at = null;
      updateRow.insights_version = null;
    }

    const { data, error } = await admin
      .from('words')
      .update(updateRow)
      .eq('id', wordId)
      .eq('project_id', projectId)
      .select(RESOLVED_WORD_SELECT_COLUMNS)
      .single<WordRow>();

    if (error || !data) {
      throw new Error(error?.message || 'shared_word_update_failed');
    }

    return NextResponse.json({
      success: true,
      word: mapWordFromRow(data),
    });
  } catch (error) {
    console.error('shared-project word update error:', error);
    return NextResponse.json({ success: false, error: '単語の更新に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; wordId: string }> },
) {
  try {
    const { projectId, wordId } = await context.params;
    const access = await requireSharedProjectAccess(request, projectId);
    if (!access.ok) {
      return access.response;
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('words')
      .delete()
      .eq('id', wordId)
      .eq('project_id', projectId);

    if (error) {
      throw new Error(error.message || 'shared_word_delete_failed');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('shared-project word delete error:', error);
    return NextResponse.json({ success: false, error: '単語の削除に失敗しました。' }, { status: 500 });
  }
}
