import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';

/**
 * POST /api/chatgpt/words
 *
 * ChatGPT Custom GPT (GPT Actions) からの単語追加専用ルート (Pro限定)。
 *
 * words/create と異なり、サーバー側の AI・lexicon パイプラインを一切通さない:
 * - 日本語訳の AI バックフィルなし (japanese は必須入力)
 * - lexicon 解決 (master-first / 解決ジョブ enqueue) なし
 * - 語順クイズ prefill なし
 * 訳・例文・クイズ誤答選択肢はすべてユーザーの ChatGPT 側で生成して送らせる
 * 前提のため、このルートは検証と RLS スコープの insert のみを行う。
 */

const wordInputSchema = z.object({
  projectId: z.string().uuid(),
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().min(1).max(300),
  exampleSentence: z.string().trim().max(500).optional(),
  exampleSentenceJa: z.string().trim().max(500).optional(),
  pronunciation: z.string().trim().max(120).optional(),
  partOfSpeechTags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  distractors: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
}).strict();

const requestSchema = z.object({
  words: z.array(wordInputSchema).min(1).max(100),
}).strict();

type InsertedWordRow = {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
};

type ChatGptWordsDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: ChatGptWordsDeps = {
  requirePro: requireProUser,
};

export async function handleChatGptWordsPost(
  request: NextRequest,
  deps: ChatGptWordsDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効な単語データです',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const supabase: SupabaseClient = auth.supabase;
    const { words } = parsed.data;

    const projectIds = Array.from(new Set(words.map((word) => word.projectId)));
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .in('id', projectIds)
      .eq('user_id', auth.user.id);

    if (projectError) {
      return NextResponse.json({ success: false, error: '単語帳の確認に失敗しました' }, { status: 500 });
    }

    const ownedProjectIds = new Set((projects ?? []).map((project) => project.id as string));
    if (projectIds.some((projectId) => !ownedProjectIds.has(projectId))) {
      return NextResponse.json({ success: false, error: '指定した単語帳にアクセスできません' }, { status: 403 });
    }

    const defaultSR = getDefaultSpacedRepetitionFields();
    const rows = words.map((word) => ({
      project_id: word.projectId,
      english: word.english,
      japanese: word.japanese,
      vocabulary_type: 'passive',
      distractors: word.distractors,
      example_sentence: word.exampleSentence ?? null,
      example_sentence_ja: word.exampleSentenceJa ?? null,
      pronunciation: word.pronunciation ?? null,
      part_of_speech_tags: word.partOfSpeechTags ?? null,
      status: 'new',
      ease_factor: defaultSR.easeFactor,
      interval_days: defaultSR.intervalDays,
      repetition: defaultSR.repetition,
      is_favorite: false,
      custom_sections: [],
    }));

    const { data, error } = await supabase
      .from('words')
      .insert(rows)
      .select('id, project_id, english, japanese');

    if (error) {
      console.error('[chatgpt/words] insert failed:', error.message);
      return NextResponse.json({ success: false, error: '単語の追加に失敗しました' }, { status: 500 });
    }

    const inserted = (data ?? []) as InsertedWordRow[];
    return NextResponse.json({
      success: true,
      addedCount: inserted.length,
      words: inserted.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        english: row.english,
        japanese: row.japanese,
      })),
    });
  } catch (error) {
    console.error('[chatgpt/words] error:', error);
    return NextResponse.json({ success: false, error: '単語の追加に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleChatGptWordsPost(request);
}
