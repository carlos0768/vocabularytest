import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';
import type { ParserResultPayload } from '@/lib/ai/correction-parser';

type Params = { params: Promise<{ id: string }> };

const requestSchema = z.object({
  candidateIds: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  projectId: z.string().uuid().optional(),
}).strict();

async function resolveProjectId(supabase: SupabaseClient, userId: string, projectId?: string) {
  if (projectId) {
    const { data, error } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();
    if (error || !data) throw new Error('PROJECT_NOT_FOUND');
    return projectId;
  }

  const title = `構文解析保存 ${new Date().toLocaleDateString('ja-JP')}`;
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, title, source_labels: ['parser'] })
    .select('id')
    .single();
  if (error || !data) throw new Error('PROJECT_CREATE_FAILED');
  return data.id as string;
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const auth = await requireProUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '保存する単語候補を選択してください',
    });
    if (!parsed.ok) return parsed.response;

    const { id } = await context.params;
    const { data: row, error: resultError } = await auth.supabase
      .from('parser_results')
      .select('id, result, saved_words_count')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .single();

    if (resultError || !row) {
      return NextResponse.json({ success: false, error: '解析結果が見つかりません' }, { status: 404 });
    }

    const result = row.result as ParserResultPayload;
    const selected = result.wordCandidates.filter((candidate) => parsed.data.candidateIds.includes(candidate.id));
    if (selected.length === 0) {
      return NextResponse.json({ success: false, error: '保存できる単語候補がありません' }, { status: 400 });
    }

    let projectId: string;
    try {
      projectId = await resolveProjectId(auth.supabase, auth.user.id, parsed.data.projectId);
    } catch (error) {
      const message = error instanceof Error && error.message === 'PROJECT_NOT_FOUND'
        ? '指定した単語帳にアクセスできません'
        : '単語帳の作成に失敗しました';
      return NextResponse.json({ success: false, error: message }, { status: error instanceof Error && error.message === 'PROJECT_NOT_FOUND' ? 403 : 500 });
    }

    const defaults = getDefaultSpacedRepetitionFields();
    const rows = selected.map((candidate) => ({
      project_id: projectId,
      english: candidate.english,
      japanese: candidate.japanese,
      distractors: [],
      example_sentence: candidate.exampleSentence ?? null,
      example_sentence_ja: null,
      pronunciation: null,
      part_of_speech_tags: null,
      status: 'new',
      created_at: new Date().toISOString(),
      ease_factor: defaults.easeFactor,
      interval_days: defaults.intervalDays,
      repetition: defaults.repetition,
      is_favorite: false,
    }));

    const { data: words, error: insertError } = await auth.supabase
      .from('words')
      .insert(rows)
      .select('id, english, japanese');

    if (insertError) {
      return NextResponse.json({ success: false, error: '単語の保存に失敗しました' }, { status: 500 });
    }

    const savedWordsCount = (row.saved_words_count || 0) + selected.length;
    await auth.supabase
      .from('parser_results')
      .update({ saved_words_count: savedWordsCount })
      .eq('id', id)
      .eq('user_id', auth.user.id);

    return NextResponse.json({ success: true, projectId, savedWordsCount, words: words ?? [] });
  } catch (error) {
    console.error('[parser/save-words] failed:', error);
    return NextResponse.json({ success: false, error: '単語の保存に失敗しました' }, { status: 500 });
  }
}
