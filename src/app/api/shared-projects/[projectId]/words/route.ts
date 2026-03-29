import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveOrCreateLexiconEntry } from '@/lib/lexicon/resolver';
import { RESOLVED_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';
import { mapWordFromRow, type WordRow } from '../../../../../../shared/db';
import { requireSharedProjectAccess } from '../../shared';

const requestSchema = z.object({
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().min(1).max(300),
}).strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await requireSharedProjectAccess(request, projectId);
    if (!access.ok) {
      return access.response;
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語データが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const lexiconEntry = await resolveOrCreateLexiconEntry({
      english: parsed.data.english,
      japaneseHint: parsed.data.japanese,
      partOfSpeechTags: ['other'],
    });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('words')
      .insert({
        project_id: projectId,
        english: parsed.data.english,
        japanese: parsed.data.japanese,
        lexicon_entry_id: lexiconEntry?.id ?? null,
        distractors: [],
        status: 'new',
        is_favorite: false,
      })
      .select(RESOLVED_WORD_SELECT_COLUMNS)
      .single<WordRow>();

    if (error || !data) {
      throw new Error(error?.message || 'shared_word_create_failed');
    }

    return NextResponse.json({
      success: true,
      word: mapWordFromRow(data),
    });
  } catch (error) {
    console.error('shared-project word create error:', error);
    return NextResponse.json({ success: false, error: '単語の追加に失敗しました。' }, { status: 500 });
  }
}
