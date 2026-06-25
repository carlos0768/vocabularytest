import { after, NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  enqueueWordLexiconResolutionJobs,
  needsWordLexiconResolution,
  triggerWordLexiconResolutionProcessing,
} from '@/lib/lexicon/word-resolution-jobs';
import { RESOLVED_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';
import { backfillMissingJapaneseTranslationsWithMetadata } from '@/lib/words/backfill-japanese';
import { resolveImmediateWordsWithMasterFirst } from '@/lib/lexicon/master-first-scan';
import { mapWordFromRow, type WordRow } from '../../../../../shared/db';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { prefillWordOrderQuizzesForWords } from '@/lib/scan/word-order-prefill';
import {
  buildWordTranslationInsertRows,
  normalizeWordForTranslationPersistence,
} from '@/lib/words/translation-persistence';
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

const wordOrderQuizSchema = z.object({
  version: z.literal(1),
  sourceEnglish: z.string().trim().min(1).max(200),
  sourceJapanese: z.string().trim().min(1).max(300),
  sentenceTokens: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  answerTokens: z.array(z.string().trim().min(1).max(80)).min(1).max(3),
  decoyTokens: z.array(z.string().trim().min(1).max(80)).length(3),
  generatedAt: z.string().datetime(),
}).strict();

const customSectionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120),
  content: z.string().trim().max(2000),
}).strict();

const translationSchema = z.object({
  japanese: z.string().trim().min(1).max(300).optional(),
  translationJa: z.string().trim().min(1).max(300).optional(),
  translation_ja: z.string().trim().min(1).max(300).optional(),
  source: z.enum(['scan', 'ai', 'user']).optional(),
  meaningRank: z.number().int().min(1).max(20).optional(),
  meaning_rank: z.number().int().min(1).max(20).optional(),
  annotationRanges: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  annotation_ranges: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  lexiconSenseId: z.string().uuid().optional(),
  lexicon_sense_id: z.string().uuid().optional(),
}).strict().refine(
  (translation) => Boolean(translation.japanese || translation.translationJa || translation.translation_ja),
  { message: 'translation must include japanese, translationJa, or translation_ja' },
);

const wordInputSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().max(300).default(''),
  rawJapanese: z.string().trim().max(500).optional(),
  translations: z.array(translationSchema).max(20).optional(),
  vocabularyType: z.enum(['active', 'passive']).nullable().optional(),
  japaneseSource: z.enum(['scan', 'ai']).optional(),
  lexiconEntryId: z.string().uuid().optional(),
  lexiconSenseId: z.string().uuid().optional(),
  distractors: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  exampleSentence: z.string().trim().max(500).optional(),
  exampleSentenceJa: z.string().trim().max(500).optional(),
  pronunciation: z.string().trim().max(120).optional(),
  partOfSpeechTags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  relatedWords: z.array(relatedWordSchema).max(10).optional(),
  usagePatterns: z.array(usagePatternSchema).max(8).optional(),
  insightsGeneratedAt: z.string().datetime().optional(),
  insightsVersion: z.number().int().min(1).max(100).optional(),
  wordOrderQuiz: wordOrderQuizSchema.optional(),
  customSections: z.array(customSectionSchema).max(20).optional(),
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

const ENABLE_IMMEDIATE_WORD_LEXICON_PROCESSING = false;

interface WordsCreateDeps {
  createClient?: typeof createRouteHandlerClient;
  runAfter?: typeof after;
  enqueueJobs?: typeof enqueueWordLexiconResolutionJobs;
  triggerJobProcessing?: typeof triggerWordLexiconResolutionProcessing;
  resolveImmediateWords?: typeof resolveImmediateWordsWithMasterFirst;
  backfillWords?: typeof backfillMissingJapaneseTranslationsWithMetadata;
}

function getDeps(deps?: WordsCreateDeps) {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    runAfter: deps?.runAfter ?? after,
    enqueueJobs: deps?.enqueueJobs ?? enqueueWordLexiconResolutionJobs,
    triggerJobProcessing: deps?.triggerJobProcessing ?? triggerWordLexiconResolutionProcessing,
    resolveImmediateWords: deps?.resolveImmediateWords ?? resolveImmediateWordsWithMasterFirst,
    backfillWords: deps?.backfillWords ?? backfillMissingJapaneseTranslationsWithMetadata,
  };
}

export async function handleWordsCreatePost(request: NextRequest, deps?: WordsCreateDeps) {
  try {
    const {
      createClient,
      runAfter,
      enqueueJobs,
      triggerJobProcessing,
      resolveImmediateWords,
      backfillWords,
    } = getDeps(deps);
    const supabase = await createClient(request);
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

    const normalizedRequestWords = words.map((word) => normalizeWordForTranslationPersistence(word));
    const immediateResolution = await resolveImmediateWords(normalizedRequestWords);
    const wordsNeedingBackfill = immediateResolution.words.filter((word) => word.japanese.trim().length === 0);
    const { words: translatedWordsRaw, aiBackfilledIndexes } = wordsNeedingBackfill.length > 0
      ? await backfillWords(immediateResolution.words)
      : { words: immediateResolution.words, aiBackfilledIndexes: [] };
    const aiBackfilledIndexSet = new Set(aiBackfilledIndexes);
    const translatedWords = translatedWordsRaw.map((word, index) => normalizeWordForTranslationPersistence({
      ...word,
      ...(aiBackfilledIndexSet.has(index) ? { japaneseSource: 'ai' as const } : {}),
    }));

    console.log('[words/create] Immediate resolution finished', {
      requestedWordCount: words.length,
      masterHitCount: immediateResolution.metrics.masterHitCount,
      masterTranslationHitCount: immediateResolution.metrics.masterTranslationHitCount,
      aiMissCount: immediateResolution.metrics.aiMissCount,
      unresolvedAfterMasterFirst: wordsNeedingBackfill.length,
      masterLookupElapsedMs: immediateResolution.metrics.lookupElapsedMs,
      translationElapsedMs: immediateResolution.metrics.translationElapsedMs,
      totalElapsedMs: immediateResolution.metrics.totalElapsedMs,
    });

    const defaultSR = getDefaultSpacedRepetitionFields();
    const rows = translatedWords.map((word) => {
      const row = {
        project_id: word.projectId,
        english: word.english,
        japanese: word.japanese,
        japanese_source: word.japaneseSource ?? null,
        vocabulary_type: word.vocabularyType ?? null,
        lexicon_entry_id: word.lexiconEntryId ?? null,
        lexicon_sense_id: word.lexiconSenseId ?? null,
        distractors: word.distractors,
        example_sentence: word.exampleSentence ?? null,
        example_sentence_ja: word.exampleSentenceJa ?? null,
        pronunciation: word.pronunciation ?? null,
        part_of_speech_tags: word.partOfSpeechTags ?? null,
        related_words: word.relatedWords ?? null,
        usage_patterns: word.usagePatterns ?? null,
        insights_generated_at: word.insightsGeneratedAt ?? null,
        insights_version: word.insightsVersion ?? null,
        word_order_quiz: word.wordOrderQuiz ?? null,
        status: word.status ?? 'new',
        created_at: word.createdAt ?? new Date().toISOString(),
        last_reviewed_at: word.lastReviewedAt ?? null,
        next_review_at: word.nextReviewAt ?? null,
        ease_factor: word.easeFactor ?? defaultSR.easeFactor,
        interval_days: word.intervalDays ?? defaultSR.intervalDays,
        repetition: word.repetition ?? defaultSR.repetition,
        is_favorite: word.isFavorite ?? false,
        custom_sections: word.customSections ?? [],
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

    const createdWordRows = (data ?? []) as WordRow[];
    const translationRows = buildWordTranslationInsertRows(
      translatedWords,
      createdWordRows.map((row) => row.id),
    );
    if (translationRows.length > 0) {
      const { error: translationError } = await supabase
        .from('word_translations')
        .upsert(translationRows, { onConflict: 'word_id,normalized_translation_ja' });

      if (translationError) {
        return NextResponse.json({ success: false, error: translationError.message }, { status: 500 });
      }
    }

    const aiTranslatedWordIds = translatedWords
      .map((word, index) => (word.japaneseSource === 'ai' ? ((data ?? []) as WordRow[])[index]?.id : null))
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    const createdWordRowsWithTranslations = translationRows.length > 0
      ? await supabase
        .from('words')
        .select(RESOLVED_WORD_SELECT_COLUMNS)
        .in('id', createdWordRows.map((row) => row.id))
      : { data: createdWordRows, error: null };
    if (createdWordRowsWithTranslations.error) {
      return NextResponse.json({ success: false, error: createdWordRowsWithTranslations.error.message }, { status: 500 });
    }
    const createdRowsForResponse = (createdWordRowsWithTranslations.data ?? createdWordRows) as WordRow[];

    runAfter(async () => {
      const aiTranslatedWordIdSet = new Set(aiTranslatedWordIds);
      const pendingWordIds = createdRowsForResponse
        .filter((row) => needsWordLexiconResolution({
          lexiconEntryId: row.lexicon_entry_id ?? null,
          partOfSpeechTags: row.part_of_speech_tags,
        }) || aiTranslatedWordIdSet.has(row.id))
        .map((row) => row.id);

      if (pendingWordIds.length === 0) {
        return;
      }

      try {
        const jobIds = await enqueueJobs(
          'manual',
          pendingWordIds,
          {
            aiTranslatedWordIds,
          },
        );
        if (ENABLE_IMMEDIATE_WORD_LEXICON_PROCESSING && jobIds.length > 0) {
          await Promise.all(
            jobIds.map((jobId) => triggerJobProcessing(request.url, jobId)),
          );
        }
      } catch (jobError) {
        console.error('[words/create] Failed to enqueue word lexicon resolution', jobError);
      }

      try {
        const summary = await prefillWordOrderQuizzesForWords(createdRowsForResponse, {
          getUpdateClient: () => getSupabaseAdmin(),
        });
        if (summary.requested > 0) {
          console.log('[words/create] Word-order quiz prefill finished', summary);
        }
      } catch (wordOrderError) {
        console.error('[words/create] Word-order quiz prefill failed (non-critical)', wordOrderError);
      }
    });

    return NextResponse.json({
      success: true,
      words: createdRowsForResponse.map(mapWordFromRow),
      lexiconEntries: immediateResolution.lexiconEntries,
    });
  } catch (error) {
    console.error('Word create route error:', error);
    return NextResponse.json({ success: false, error: '単語の作成に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleWordsCreatePost(request);
}
