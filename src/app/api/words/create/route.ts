import { after, NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { resolveWordsWithLexicon } from '@/lib/lexicon/resolver';
import {
  enqueueLexiconEnrichmentJob,
  triggerLexiconEnrichmentProcessing,
} from '@/lib/lexicon/enrichment-jobs';
import { RESOLVED_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';
import { mapWordFromRow, type WordRow } from '../../../../../shared/db';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';
import { z } from 'zod';

const relatedWordSchema = z.object({
  term: z.string().trim().min(1).max(80),
  relation: z.string().trim().min(1).max(40),
  noteJa: z.string().trim().max(200).optional(),
}).strict();

const usagePatternSchema = z.object({
  pattern: z.string().trim().min(1).max(120),
  meaningJa: z.string().trim().min(1).max(200),
  example: z.string().trim().max(240).optional(),
  exampleJa: z.string().trim().max(240).optional(),
  register: z.string().trim().max(40).optional(),
}).strict();

const wordInputSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().max(300).default(''),
  lexiconEntryId: z.string().uuid().optional(),
  distractors: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  exampleSentence: z.string().trim().max(500).optional(),
  exampleSentenceJa: z.string().trim().max(500).optional(),
  pronunciation: z.string().trim().max(120).optional(),
  partOfSpeechTags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  relatedWords: z.array(relatedWordSchema).max(10).optional(),
  usagePatterns: z.array(usagePatternSchema).max(8).optional(),
  insightsGeneratedAt: z.string().datetime().optional(),
  insightsVersion: z.number().int().min(1).max(100).optional(),
  status: z.enum(['new', 'review', 'mastered']).optional(),
  createdAt: z.string().datetime().optional(),
  lastReviewedAt: z.string().datetime().optional(),
  nextReviewAt: z.string().datetime().optional(),
  easeFactor: z.number().min(1).max(10).optional(),
  intervalDays: z.number().int().min(0).max(10000).optional(),
  repetition: z.number().int().min(0).max(10000).optional(),
  isFavorite: z.boolean().optional(),
}).strict();

const requestSchema = z.object({
  words: z.array(wordInputSchema).min(1).max(200),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効な単語データです',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { words } = parsed.data;
    const projectIds = Array.from(new Set(words.map((word) => word.projectId)));
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .in('id', projectIds)
      .eq('user_id', user.id);

    if (projectError) {
      return NextResponse.json({ success: false, error: '単語帳の確認に失敗しました' }, { status: 500 });
    }

    const ownedProjectIds = new Set((projects ?? []).map((project) => project.id as string));
    if (projectIds.some((projectId) => !ownedProjectIds.has(projectId))) {
      return NextResponse.json({ success: false, error: '指定した単語帳にアクセスできません' }, { status: 403 });
    }

    const unresolvedWords = words.filter((word) => !word.lexiconEntryId);
    const resolvedLexicon = unresolvedWords.length > 0
      ? await resolveWordsWithLexicon(unresolvedWords)
      : {
          words: [],
          lexiconEntries: [],
          pendingEnrichmentCandidates: [],
          metrics: {
            syncTranslationCount: 0,
            queuedHintValidationCount: 0,
            resolverElapsedMs: 0,
          },
        };
    console.log('[words/create] Lexicon resolution metrics', {
      wordCount: unresolvedWords.length,
      ...resolvedLexicon.metrics,
    });
    const resolvedByInput = new Map<typeof unresolvedWords[number], typeof resolvedLexicon.words[number]>();
    unresolvedWords.forEach((word, index) => {
      const resolved = resolvedLexicon.words[index];
      if (resolved) {
        resolvedByInput.set(word, resolved);
      }
    });

    const defaultSR = getDefaultSpacedRepetitionFields();
    const rows = words.map((word) => {
      const resolved = word.lexiconEntryId ? null : resolvedByInput.get(word);

      const row = {
        project_id: word.projectId,
        english: resolved?.english ?? word.english,
        japanese: resolved?.japanese ?? word.japanese,
        lexicon_entry_id: word.lexiconEntryId ?? resolved?.lexiconEntryId ?? null,
        distractors: word.distractors,
        example_sentence: word.exampleSentence ?? null,
        example_sentence_ja: word.exampleSentenceJa ?? null,
        pronunciation: word.pronunciation ?? null,
        part_of_speech_tags: word.partOfSpeechTags ?? null,
        related_words: word.relatedWords ?? null,
        usage_patterns: word.usagePatterns ?? null,
        insights_generated_at: word.insightsGeneratedAt ?? null,
        insights_version: word.insightsVersion ?? null,
        status: word.status ?? 'new',
        created_at: word.createdAt ?? new Date().toISOString(),
        last_reviewed_at: word.lastReviewedAt ?? null,
        next_review_at: word.nextReviewAt ?? null,
        ease_factor: word.easeFactor ?? defaultSR.easeFactor,
        interval_days: word.intervalDays ?? defaultSR.intervalDays,
        repetition: word.repetition ?? defaultSR.repetition,
        is_favorite: word.isFavorite ?? false,
      } as Record<string, unknown>;

      if (word.id) {
        row.id = word.id;
      }

      return row;
    });

    const needsUpsert = rows.some((row) => typeof row.id === 'string');
    const query = needsUpsert
      ? supabase.from('words').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      : supabase.from('words').insert(rows);

    const { data, error } = await query.select(RESOLVED_WORD_SELECT_COLUMNS);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    after(async () => {
      if (resolvedLexicon.pendingEnrichmentCandidates.length === 0) {
        return;
      }

      try {
        const enrichmentJobId = await enqueueLexiconEnrichmentJob(
          'manual',
          resolvedLexicon.pendingEnrichmentCandidates,
        );
        if (enrichmentJobId) {
          await triggerLexiconEnrichmentProcessing(request.url, enrichmentJobId);
        }
      } catch (enqueueError) {
        console.error('[words/create] Failed to enqueue lexicon enrichment', enqueueError);
      }
    });

    return NextResponse.json({
      success: true,
      words: ((data ?? []) as WordRow[]).map(mapWordFromRow),
      lexiconEntries: resolvedLexicon.lexiconEntries,
    });
  } catch (error) {
    console.error('Word create route error:', error);
    return NextResponse.json({ success: false, error: '単語の作成に失敗しました' }, { status: 500 });
  }
}
