import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  buildPolysemyTranslationRows,
  type PolysemySenseInput,
  type PolysemyWordInput,
} from '@/lib/quiz/polysemy-senses';
import { RESOLVED_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';
import { mapWordFromRow, type WordRow } from '../../../../../shared/db';
import type { WordTranslation } from '@/types';

/**
 * POST /api/words/senses
 *
 * 多義語クイズ用の語義展開。
 * 渡された単語について、lexicon_senses にある「まだその単語に紐づいていない
 * 語義」を word_translations 行として実体化し、更新後の訳一覧を返す。
 * 語義ごとの出題（`expandWordForQuizTargets`）と語義ごとの進捗記録は
 * word_translations 行が前提なので、クイズ開始時にこの経路を通す。
 *
 * - 英検レベルによる絞り込みはここでは行わない（出題時にクライアント側で行う）
 * - lexicon の読み取りは公開RLS、単語行の読み書きはユーザーのRLS経由
 * - 何も追加できない単語は results に含めない
 */

const requestSchema = z.object({
  wordIds: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
}).strict();

type WordRowLite = {
  id: string;
  japanese: string;
  lexicon_entry_id: string | null;
  lexicon_sense_id: string | null;
};

type SenseRow = {
  id: string;
  lexicon_entry_id: string;
  translation_ja: string;
  normalized_translation_ja: string;
  distinct_key: string | null;
  is_primary: boolean | null;
  created_at: string | null;
};

type ExistingTranslationRow = {
  word_id: string;
  translation_ja: string | null;
  normalized_translation_ja: string | null;
  position: number | null;
  meaning_rank: number | null;
  is_primary: boolean | null;
};

export interface WordSensesRouteDeps {
  createClient?: typeof createRouteHandlerClient;
  getAdmin?: typeof getSupabaseAdmin;
}

export interface WordSensesResult {
  wordId: string;
  translations: WordTranslation[];
}

export async function handleWordSensesPost(
  request: NextRequest,
  deps: WordSensesRouteDeps = {},
) {
  try {
    const createClient = deps.createClient ?? createRouteHandlerClient;
    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 },
      );
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語IDリストが必要です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { wordIds } = parsed.data;

    // RLS により、他人の単語はそもそも取得できない。
    const wordsResult = await supabase
      .from('words')
      .select('id, japanese, lexicon_entry_id, lexicon_sense_id')
      .in('id', wordIds);

    if (wordsResult.error) {
      // lexicon 列が無い互換環境では語義展開自体が成立しないので何もしない。
      return NextResponse.json({ success: true, results: [] });
    }

    const wordRows = (wordsResult.data ?? []) as WordRowLite[];
    const words: PolysemyWordInput[] = wordRows
      .filter((row) => Boolean(row.lexicon_entry_id))
      .map((row) => ({
        id: row.id,
        japanese: row.japanese ?? '',
        lexiconEntryId: row.lexicon_entry_id,
        lexiconSenseId: row.lexicon_sense_id,
      }));

    if (words.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    const entryIds = Array.from(new Set(words.map((word) => word.lexiconEntryId as string)));
    const admin = (deps.getAdmin ?? getSupabaseAdmin)();

    const [sensesResult, existingResult] = await Promise.all([
      admin
        .from('lexicon_senses')
        .select('id, lexicon_entry_id, translation_ja, normalized_translation_ja, distinct_key, is_primary, created_at')
        .in('lexicon_entry_id', entryIds),
      supabase
        .from('word_translations')
        .select('word_id, translation_ja, normalized_translation_ja, position, meaning_rank, is_primary')
        .in('word_id', words.map((word) => word.id)),
    ]);

    if (sensesResult.error || existingResult.error) {
      console.warn(
        '[words/senses] Lookup failed:',
        sensesResult.error?.message ?? existingResult.error?.message,
      );
      return NextResponse.json({ success: true, results: [] });
    }

    const sensesByEntryId = new Map<string, PolysemySenseInput[]>();
    for (const row of (sensesResult.data ?? []) as SenseRow[]) {
      const sense: PolysemySenseInput = {
        id: row.id,
        lexiconEntryId: row.lexicon_entry_id,
        translationJa: row.translation_ja,
        normalizedTranslationJa: row.normalized_translation_ja,
        distinctKey: row.distinct_key,
        isPrimary: row.is_primary,
        createdAt: row.created_at,
      };
      const bucket = sensesByEntryId.get(row.lexicon_entry_id);
      if (bucket) bucket.push(sense);
      else sensesByEntryId.set(row.lexicon_entry_id, [sense]);
    }
    for (const bucket of sensesByEntryId.values()) {
      bucket.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    }

    const rows = buildPolysemyTranslationRows({
      words,
      sensesByEntryId,
      existingTranslations: ((existingResult.data ?? []) as ExistingTranslationRow[]).map((row) => ({
        wordId: row.word_id,
        translationJa: row.translation_ja,
        normalizedTranslationJa: row.normalized_translation_ja,
        position: row.position,
        meaningRank: row.meaning_rank,
        isPrimary: row.is_primary,
      })),
    });

    if (rows.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    const { error: insertError } = await supabase
      .from('word_translations')
      .upsert(rows, {
        onConflict: 'word_id,normalized_translation_ja',
        ignoreDuplicates: true,
      });

    if (insertError) {
      console.warn('[words/senses] Translation insert failed:', insertError.message);
      return NextResponse.json({ success: true, results: [] });
    }

    const affectedWordIds = Array.from(new Set(rows.map((row) => row.word_id)));
    const refreshed = await supabase
      .from('words')
      .select(RESOLVED_WORD_SELECT_COLUMNS)
      .in('id', affectedWordIds);

    if (refreshed.error) {
      return NextResponse.json({ success: true, results: [] });
    }

    const results: WordSensesResult[] = ((refreshed.data ?? []) as unknown as WordRow[])
      .map((row) => mapWordFromRow(row))
      .map((word) => ({ wordId: word.id, translations: word.translations ?? [] }))
      .filter((result) => result.translations.length > 1);

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('[words/senses] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleWordSensesPost(request);
}
