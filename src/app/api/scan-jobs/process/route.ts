import { after, NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extractWordsFromImage } from '@/lib/ai/extract-words';
import { extractCircledWordsFromImage } from '@/lib/ai/extract-circled-words';
import { extractHighlightedWordsFromImage } from '@/lib/ai/extract-highlighted-words';
import { extractEikenWordsFromImage } from '@/lib/ai/extract-eiken-words';
import { extractIdiomsFromImage } from '@/lib/ai/extract-idioms';
import { extractWrongAnswersFromImage } from '@/lib/ai/extract-wrong-answers';
import type { ExtractMode } from '@/app/api/extract/route';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { sendScanJobPushNotifications } from '@/lib/notifications/web-push';
import { sendScanJobApnsNotifications } from '@/lib/notifications/apns';
import { generateQuizContentForWords, type QuizContentResult } from '@/lib/ai/generate-quiz-content';
import { AI_CONFIG, getAPIKeys, type AIProvider } from '@/lib/ai/config';
import { isCloudRunConfigured } from '@/lib/ai/providers';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { generateExampleSentences } from '@/lib/ai/generate-example-sentences';
import {
  enqueueWordLexiconResolutionJobs,
  needsWordLexiconResolution,
  triggerWordLexiconResolutionProcessing,
} from '@/lib/lexicon/word-resolution-jobs';
import { resolveImmediateWordsWithMasterFirst } from '@/lib/lexicon/master-first-scan';
import { backfillMissingJapaneseTranslationsWithMetadata } from '@/lib/words/backfill-japanese';
import {
  insertProjectWithSourceLabelsCompat,
  selectProjectWithSourceLabelsCompat,
  updateProjectSourceLabelsCompat,
} from '@/lib/supabase/project-source-labels-compat';
import { ensureSourceLabels, mergeSourceLabels } from '../../../../../shared/source-labels';

// Lazy initialization to avoid build-time errors
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    supabaseAdmin = createClient(
      url.startsWith('http') ? url : `https://${url}`,
      key
    );
  }
  return supabaseAdmin;
}

// Vercel Hobby plan upper limit is 300 seconds.
export const maxDuration = 300;

const processSchema = z.object({
  jobId: z.string().uuid(),
}).strict();

type ExtractionWarningCode = 'grammar_not_found';
type ScanJobSaveMode = 'server_cloud' | 'client_local';

type ExtractionLikeResult =
  | { success: true; data: { words: unknown[]; sourceLabels?: unknown[] } }
  | { success: false; error: string; reason?: string };

interface ProcessedExtractedWord {
  english: string;
  japanese: string;
  japaneseSource?: 'scan' | 'ai';
  lexiconEntryId?: string;
  cefrLevel?: string;
  distractors: string[];
  partOfSpeechTags?: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
}

// Keep internal timeout below platform timeout to fail gracefully.
const EXTRACTION_TIMEOUT_MS = 4 * 60 * 1000 + 30 * 1000;
const EXTRACTION_TIMEOUT_MINUTES = Math.round(EXTRACTION_TIMEOUT_MS / 60_000);
const QUIZ_PREFILL_BATCH_SIZE = 30;
const QUIZ_PREFILL_MAX_ATTEMPTS = 3;
const ENABLE_IMMEDIATE_WORD_LEXICON_PROCESSING = false;
const ENABLE_POST_SCAN_QUIZ_PREFILL = false;
const EIKEN_LEVEL_ORDER = ['5', '4', '3', 'pre2', '2', 'pre1', '1'] as const;
type EikenLevel = (typeof EIKEN_LEVEL_ORDER)[number];
const EIKEN_LEVEL_SET = new Set<string>(EIKEN_LEVEL_ORDER);

function getProvidersForMode(mode: ExtractMode): AIProvider[] {
  switch (mode) {
    case 'circled':
      return [AI_CONFIG.extraction.circled.provider];
    case 'highlighted':
      return [AI_CONFIG.extraction.highlighted.provider];
    case 'eiken':
      return [AI_CONFIG.extraction.eiken.provider];
    case 'idiom':
      return [AI_CONFIG.extraction.idioms.provider];
    case 'wrong':
      return [AI_CONFIG.extraction.grammar.ocr.provider, AI_CONFIG.extraction.grammar.analysis.provider];
    case 'all':
    default:
      return [AI_CONFIG.extraction.words.provider];
  }
}

function getMissingProviderKey(mode: ExtractMode, apiKeys: { gemini?: string; openai?: string }): AIProvider | null {
  if (isCloudRunConfigured()) return null;

  const requiredProviders = new Set(getProvidersForMode(mode));
  for (const provider of requiredProviders) {
    if (!apiKeys[provider]) {
      return provider;
    }
  }

  return null;
}

export const __internal = {
  getProvidersForMode,
  getMissingProviderKey,
  extractFromImage,
  parseExtractedWords,
  dedupeExtractedWords,
};

function isMasterFirstResolutionEnabled(mode: ExtractMode): boolean {
  const disabledModes = (process.env.MASTER_FIRST_SCAN_DISABLED_MODES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return !disabledModes.includes(mode);
}

interface ExtractionHandlers {
  extractWordsFromImage: typeof extractWordsFromImage;
  extractCircledWordsFromImage: typeof extractCircledWordsFromImage;
  extractHighlightedWordsFromImage: typeof extractHighlightedWordsFromImage;
  extractEikenWordsFromImage: typeof extractEikenWordsFromImage;
  extractIdiomsFromImage: typeof extractIdiomsFromImage;
  extractWrongAnswersFromImage: typeof extractWrongAnswersFromImage;
}

const defaultExtractionHandlers: ExtractionHandlers = {
  extractWordsFromImage,
  extractCircledWordsFromImage,
  extractHighlightedWordsFromImage,
  extractEikenWordsFromImage,
  extractIdiomsFromImage,
  extractWrongAnswersFromImage,
};

function normalizeEikenLevel(rawLevel: string | null): EikenLevel {
  if (!rawLevel) {
    return '3';
  }

  const parsedLevels = rawLevel
    .split(',')
    .map(level => level.trim())
    .filter((level): level is EikenLevel => EIKEN_LEVEL_SET.has(level));

  if (parsedLevels.length === 0) {
    return '3';
  }

  let hardest = parsedLevels[0];
  for (const current of parsedLevels.slice(1)) {
    if (EIKEN_LEVEL_ORDER.indexOf(current) > EIKEN_LEVEL_ORDER.indexOf(hardest)) {
      hardest = current;
    }
  }

  return hardest;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SCAN_TIMING_SHEET_URL = process.env.SCAN_TIMING_SHEET_URL;

async function logTimingToSheet(
  timing: Record<string, unknown>,
  jobId: string,
  userId: string,
  status: string
): Promise<void> {
  if (!SCAN_TIMING_SHEET_URL) return;

  await fetch(SCAN_TIMING_SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      startedAt: new Date(Date.now() - (timing.totalMs as number || 0)).toISOString(),
      jobId,
      userId,
      scanMode: timing.scanMode ?? '',
      imageCount: timing.imageCount ?? 0,
      wordCount: timing.wordCount ?? 0,
      totalMs: timing.totalMs ?? 0,
      imageDownloadMs: timing.imageDownloadMs ?? 0,
      aiExtractionMs: timing.aiExtractionMs ?? 0,
      parseValidationMs: timing.parseValidationMs ?? 0,
      exampleGenerationMs: timing.exampleGenerationMs ?? 0,
      dbInsertMs: timing.dbInsertMs ?? 0,
      model: timing.model ?? '',
      status,
    }),
  });
}

interface QuizSeedWord {
  id: string;
  english: string;
  japanese: string;
}

function hasValidDistractors(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length < 3) return false;
  if (value.length === 3 && value[0] === '選択肢1') return false;
  return value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function hasExampleSentence(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPartOfSpeechTags(value: unknown): boolean {
  return normalizePartOfSpeechTags(value).length > 0;
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function firstNonEmpty(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeJapaneseSource(value: unknown): 'scan' | 'ai' | undefined {
  return value === 'scan' || value === 'ai' ? value : undefined;
}

function preferJapaneseSource(
  first?: 'scan' | 'ai',
  second?: 'scan' | 'ai',
): 'scan' | 'ai' | undefined {
  if (first === 'scan' || second === 'scan') return 'scan';
  if (first === 'ai' || second === 'ai') return 'ai';
  return undefined;
}

function mergeDistractors(existing: string[], incoming: unknown): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const incomingList = Array.isArray(incoming) ? incoming : [];

  for (const candidate of [...existing, ...incomingList]) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    const token = normalized.toLowerCase();
    if (seen.has(token)) continue;
    seen.add(token);
    merged.push(normalized);
    if (merged.length >= 3) break;
  }

  return merged;
}

function parseExtractedWords(rawWords: unknown[]): ProcessedExtractedWord[] {
  const parsed: ProcessedExtractedWord[] = [];

  for (const rawWord of rawWords) {
    if (!rawWord || typeof rawWord !== 'object') continue;

    const word = rawWord as Record<string, unknown>;
    const english = normalizeText(word.english);
    const japanese = normalizeText(word.japanese);
    if (!english) continue;
    // Filter out placeholder/invalid Japanese translations
    const INVALID_JAPANESE = ['unknown', '不明', 'n/a', '-', '---'];
    const normalizedJapanese = INVALID_JAPANESE.includes(japanese.toLowerCase()) ? '' : japanese;

    parsed.push({
      english,
      japanese: normalizedJapanese,
      japaneseSource: normalizedJapanese ? normalizeJapaneseSource(word.japaneseSource) : undefined,
      distractors: mergeDistractors([], word.distractors),
      partOfSpeechTags: normalizePartOfSpeechTags(word.partOfSpeechTags),
      exampleSentence: firstNonEmpty(word.exampleSentence),
      exampleSentenceJa: firstNonEmpty(word.exampleSentenceJa),
    });
  }

  return parsed;
}

function dedupeExtractedWords(words: ProcessedExtractedWord[]): ProcessedExtractedWord[] {
  if (words.length === 0) return [];

  const deduped: ProcessedExtractedWord[] = [];
  const indexByKey = new Map<string, number>();

  for (const source of words) {
    const key = `${source.english.toLowerCase()}||${source.japanese}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, deduped.length);
      deduped.push({
        english: source.english,
        japanese: source.japanese,
        japaneseSource: source.japaneseSource,
        distractors: mergeDistractors([], source.distractors),
        partOfSpeechTags: normalizePartOfSpeechTags(source.partOfSpeechTags),
        exampleSentence: firstNonEmpty(source.exampleSentence),
        exampleSentenceJa: firstNonEmpty(source.exampleSentenceJa),
      });
      continue;
    }

    const existing = deduped[existingIndex];
    deduped[existingIndex] = {
      english: existing.english,
      japanese: existing.japanese,
      japaneseSource: preferJapaneseSource(existing.japaneseSource, source.japaneseSource),
      distractors: mergeDistractors(existing.distractors, source.distractors),
      partOfSpeechTags: normalizePartOfSpeechTags([
        ...(existing.partOfSpeechTags ?? []),
        ...(source.partOfSpeechTags ?? []),
      ]),
      exampleSentence: existing.exampleSentence ?? firstNonEmpty(source.exampleSentence),
      exampleSentenceJa: existing.exampleSentenceJa ?? firstNonEmpty(source.exampleSentenceJa),
    };
  }

  return deduped;
}

async function generateQuizContentWithRetry(words: QuizSeedWord[]): Promise<{
  results: QuizContentResult[];
  failedWordIds: string[];
}> {
  if (words.length === 0) {
    return { results: [], failedWordIds: [] };
  }

  const resultMap = new Map<string, QuizContentResult>();
  let pending = words;

  for (let attempt = 1; attempt <= QUIZ_PREFILL_MAX_ATTEMPTS && pending.length > 0; attempt += 1) {
    try {
      const generated = await generateQuizContentForWords(pending);
      const succeededIds = new Set<string>();

      for (const item of generated) {
        if (!item?.wordId || !Array.isArray(item.distractors) || item.distractors.length === 0) continue;
        resultMap.set(item.wordId, item);
        succeededIds.add(item.wordId);
      }

      pending = pending.filter((word) => !succeededIds.has(word.id));
      if (pending.length > 0 && attempt < QUIZ_PREFILL_MAX_ATTEMPTS) {
        await sleep(250 * attempt);
      }
    } catch (error) {
      console.error(`Quiz prefill failed (attempt ${attempt}/${QUIZ_PREFILL_MAX_ATTEMPTS}):`, error);
      if (attempt < QUIZ_PREFILL_MAX_ATTEMPTS) {
        await sleep(250 * attempt);
      }
    }
  }

  return {
    results: Array.from(resultMap.values()),
    failedWordIds: pending.map((word) => word.id),
  };
}

// Extract words from a single image using the appropriate mode
async function extractFromImage(
  base64Image: string,
  mode: ExtractMode,
  eikenLevel: string | null,
  apiKeys: { gemini?: string; openai?: string },
  handlers: ExtractionHandlers = defaultExtractionHandlers
): Promise<{ result: ExtractionLikeResult; warningCode?: ExtractionWarningCode }> {
  switch (mode) {
    case 'circled': {
      return { result: await handlers.extractCircledWordsFromImage(base64Image, apiKeys, {}) as ExtractionLikeResult };
    }
    case 'highlighted': {
      return { result: await handlers.extractHighlightedWordsFromImage(base64Image, apiKeys) as ExtractionLikeResult };
    }
    case 'eiken': {
      const normalizedLevel = normalizeEikenLevel(eikenLevel);
      if (eikenLevel && normalizedLevel !== eikenLevel.trim()) {
        console.log('Normalized eikenLevel for scan job:', { rawLevel: eikenLevel, normalizedLevel });
      }
      return {
        result: await handlers.extractEikenWordsFromImage(
          base64Image,
          apiKeys,
          normalizedLevel
        ) as ExtractionLikeResult,
      };
    }
    case 'idiom': {
      const idiomResult = await handlers.extractIdiomsFromImage(base64Image, apiKeys);
      if (!idiomResult.success && idiomResult.reason === 'no_idiom_found') {
        console.warn('No idioms found in background scan. Falling back to all-word extraction.');
        return {
          result: await handlers.extractWordsFromImage(base64Image, apiKeys, { includeExamples: false }) as ExtractionLikeResult,
          warningCode: 'grammar_not_found',
        };
      }
      return { result: idiomResult as ExtractionLikeResult };
    }
    case 'wrong': {
      return { result: await handlers.extractWrongAnswersFromImage(base64Image, apiKeys) as ExtractionLikeResult };
    }
    default: {
      return { result: await handlers.extractWordsFromImage(base64Image, apiKeys, { includeExamples: false }) as ExtractionLikeResult };
    }
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
      console.warn('[scan-jobs/process] Unauthorized trigger request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, processSchema, {
      invalidMessage: 'Missing jobId',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { jobId } = parsed.data;
    console.log('[scan-jobs/process] Request received', { jobId });

    const processingTimestamp = new Date().toISOString();
    const { data: claimedJob, error: claimError } = await getSupabaseAdmin()
      .from('scan_jobs')
      .update({ status: 'processing', updated_at: processingTimestamp })
      .eq('id', jobId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (claimError) {
      console.error('[scan-jobs/process] Failed to claim job:', claimError);
    }

    const job = claimedJob;
    if (!job) {
      const { data: existingJob, error: jobError } = await getSupabaseAdmin()
      .from('scan_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

      if (jobError || !existingJob) {
        console.error('Job not found:', jobError);
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      if (existingJob.status !== 'pending') {
        console.log('[scan-jobs/process] Job already claimed or finished', {
          jobId,
          status: existingJob.status,
        });
        return NextResponse.json({ message: 'Job already processed', status: existingJob.status });
      }

      console.warn('[scan-jobs/process] Job remained pending after claim attempt', { jobId });
      return NextResponse.json({ message: 'Job claim deferred', status: 'pending' });
    }

    const apiKeys = getAPIKeys();
    const startedAt = Date.now();
    const timing = {
      totalMs: 0,
      imageDownloadMs: 0,
      aiExtractionMs: 0,
      parseValidationMs: 0,
      lexiconResolutionMs: 0,
      exampleGenerationMs: 0,
      dbInsertMs: 0,
      imageCount: 0,
      wordCount: 0,
      scanMode: '',
      model: AI_CONFIG.extraction.words.model,
      perImage: [] as Array<{ downloadMs: number; extractionMs: number }>,
    };

    try {
      // Collect all image paths (support both single and multiple)
      const imagePaths: string[] = job.image_paths || (job.image_path ? [job.image_path] : []);
      const saveMode: ScanJobSaveMode = job.save_mode === 'client_local' ? 'client_local' : 'server_cloud';
      const targetProjectId: string | null =
        typeof job.target_project_id === 'string' && job.target_project_id.length > 0
          ? job.target_project_id
          : null;

      if (imagePaths.length === 0) {
        throw new Error('No images to process');
      }

      const mode = job.scan_mode as ExtractMode;
      timing.scanMode = mode;

      const missingProviderKey = getMissingProviderKey(mode, apiKeys);
      if (missingProviderKey) {
        const providerLabel = missingProviderKey === 'gemini' ? 'Google AI' : 'OpenAI';
        throw new Error(`${providerLabel} APIキーが設定されていません`);
      }

      const { data: preference } = await getSupabaseAdmin()
        .from('user_preferences')
        .select('ai_enabled')
        .eq('user_id', job.user_id)
        .maybeSingle<{ ai_enabled: boolean | null }>();
      const aiEnabled = preference?.ai_enabled !== false;

      const allExtractedWords: ProcessedExtractedWord[] = [];
      let allSourceLabels: string[] = [];
      let firstExtractionError: string | null = null;
      const warningCodes = new Set<ExtractionWarningCode>();
      const pageWarnings: string[] = [];
      let grammarWarningNotified = false;

      console.log('scan-jobs/process config:', {
        mode,
        imageCount: imagePaths.length,
        saveMode,
        extractionTimeoutMs: EXTRACTION_TIMEOUT_MS,
        extractionTimeoutMinutes: EXTRACTION_TIMEOUT_MINUTES,
      });

      // Process each image in parallel (concurrency limit: 5)
      const PARALLEL_CONCURRENCY = 5;

      async function processOneImage(pageIndex: number): Promise<{
        words: ProcessedExtractedWord[];
        sourceLabels: string[];
        warningCode?: ExtractionWarningCode;
        error?: string;
        pageWarning?: string;
      }> {
        const imagePath = imagePaths[pageIndex];
        const pageLabel = `ページ${pageIndex + 1}`;

        const dlStart = Date.now();
        const { data: imageData, error: downloadError } = await getSupabaseAdmin().storage
          .from('scan-images')
          .download(imagePath);
        const dlMs = Date.now() - dlStart;

        if (downloadError || !imageData) {
          console.error(`Failed to download image ${imagePath}:`, downloadError);
          return { words: [], sourceLabels: [], error: '画像データの取得に失敗しました', pageWarning: `${pageLabel}: 画像データの取得に失敗しました` };
        }

        const buffer = await imageData.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const ext = imagePath.split('.').pop()?.toLowerCase();
        const mimeType = ext === 'pdf'
          ? 'application/pdf'
          : ext === 'png'
            ? 'image/png'
            : ext === 'webp'
              ? 'image/webp'
              : 'image/jpeg';
        const base64Image = `data:${mimeType};base64,${base64}`;

        try {
          const exStart = Date.now();
          const extractionResult = await withTimeout(
            extractFromImage(base64Image, mode, job.eiken_level, apiKeys),
            EXTRACTION_TIMEOUT_MS,
            `画像解析がタイムアウトしました（${EXTRACTION_TIMEOUT_MINUTES}分）`
          );
          const exMs = Date.now() - exStart;

          timing.perImage.push({ downloadMs: dlMs, extractionMs: exMs });
          timing.imageDownloadMs += dlMs;
          timing.aiExtractionMs += exMs;

          const { result, warningCode } = extractionResult;

          if (result.success && result.data?.words) {
            return {
              words: parseExtractedWords(result.data.words),
              sourceLabels: ensureSourceLabels(result.data.sourceLabels),
              warningCode,
            };
          } else if (!result.success) {
            const errMsg = result.error || '画像の解析に失敗しました';
            return { words: [], sourceLabels: [], warningCode, error: errMsg, pageWarning: `${pageLabel}: ${errMsg}` };
          }
          return { words: [], sourceLabels: [], warningCode };
        } catch (error) {
          console.error(`Extraction timed out or failed unexpectedly for ${imagePath}:`, error);
          const errMsg = error instanceof Error ? error.message : '画像解析に失敗しました';
          return { words: [], sourceLabels: [], error: errMsg, pageWarning: `${pageLabel}: 画像解析に失敗しました` };
        }
      }

      // Run in batches of PARALLEL_CONCURRENCY
      for (let batchStart = 0; batchStart < imagePaths.length; batchStart += PARALLEL_CONCURRENCY) {
        const batchEnd = Math.min(batchStart + PARALLEL_CONCURRENCY, imagePaths.length);
        const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);

        console.log(`Processing batch: pages ${batchStart + 1}-${batchEnd} of ${imagePaths.length} (parallel=${batchIndices.length})`);

        const batchResults = await Promise.allSettled(batchIndices.map(i => processOneImage(i)));

        for (const settledResult of batchResults) {
          if (settledResult.status === 'rejected') {
            console.error('Unexpected batch rejection:', settledResult.reason);
            if (!firstExtractionError) {
              firstExtractionError = '画像解析中に予期しないエラーが発生しました';
            }
            continue;
          }

          const { words, sourceLabels, warningCode, error, pageWarning } = settledResult.value;

          if (error && !firstExtractionError) {
            firstExtractionError = error;
          }
          if (pageWarning) {
            pageWarnings.push(pageWarning);
          }
          if (warningCode) {
            warningCodes.add(warningCode);
          }
          if (warningCode === 'grammar_not_found' && !grammarWarningNotified) {
            grammarWarningNotified = true;
            const warningParams = {
              userId: job.user_id,
              jobId,
              projectId: null,
              projectTitle: job.project_title,
              status: 'warning' as const,
            };
            await sendScanJobPushNotifications(getSupabaseAdmin(), warningParams);
            void sendScanJobApnsNotifications(getSupabaseAdmin(), warningParams).catch(e => console.error('[APNs] warning push failed:', e));
          }

          allExtractedWords.push(...words);
          allSourceLabels = mergeSourceLabels(allSourceLabels, sourceLabels);
        }
      }

      const parseStart = Date.now();
      const dedupedWords = dedupeExtractedWords(allExtractedWords);
      const dedupedSourceLabels = ensureSourceLabels(allSourceLabels);
      timing.parseValidationMs = Date.now() - parseStart;

      if (dedupedWords.length === 0) {
        const errorMessage = firstExtractionError || 'No words found in any image';
        timing.totalMs = Date.now() - startedAt;
        timing.imageCount = imagePaths.length;
        timing.wordCount = 0;
        await getSupabaseAdmin()
          .from('scan_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        const failParams1 = {
          userId: job.user_id,
          jobId,
          projectId: null,
          projectTitle: job.project_title,
          status: 'failed' as const,
          wordCount: 0,
        };
        await sendScanJobPushNotifications(getSupabaseAdmin(), failParams1);
        void sendScanJobApnsNotifications(getSupabaseAdmin(), failParams1).catch(e => console.error('[APNs] fail push failed:', e));

        void logTimingToSheet(timing, jobId, job.user_id, 'failed').catch(e =>
          console.error('[timing-sheet] Failed to log:', e)
        );

        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }

      const warnings = Array.from(new Set<string>([...Array.from(warningCodes), ...pageWarnings]));
      const masterFirstEnabled = isMasterFirstResolutionEnabled(mode);
      const resolvedResult = masterFirstEnabled
        ? await resolveImmediateWordsWithMasterFirst(dedupedWords)
        : null;
      const rollbackResult = masterFirstEnabled
        ? null
        : await backfillMissingJapaneseTranslationsWithMetadata(dedupedWords);
      const resolvedWords = resolvedResult?.words ?? rollbackResult?.words ?? dedupedWords;
      const aiJapaneseCount = resolvedWords.filter((word) => word.japaneseSource === 'ai').length;

      console.log('[scan-jobs/process] Extraction finished', {
        jobId,
        mode,
        masterFirstEnabled,
        imageCount: imagePaths.length,
        rawWordCount: allExtractedWords.length,
        dedupedWordCount: dedupedWords.length,
        wordCount: resolvedWords.length,
        masterHitCount: resolvedResult?.metrics.masterHitCount ?? 0,
        masterTranslationHitCount: resolvedResult?.metrics.masterTranslationHitCount ?? 0,
        aiJapaneseCount,
        masterLookupKeyCount: resolvedResult?.metrics.lookupKeyCount ?? 0,
        masterLookupElapsedMs: resolvedResult?.metrics.lookupElapsedMs ?? 0,
        translationElapsedMs: resolvedResult?.metrics.translationElapsedMs ?? 0,
        elapsedMs: Date.now() - startedAt,
      });

      if (saveMode === 'client_local') {
        // --- Synchronous example sentence generation (client_local) ---
        const wordsNeedingExamples = resolvedWords
          .filter((w, i) => !w.exampleSentence)
          .map((w, i) => ({
            id: String(i), // client_local has no DB ids; use index as placeholder
            english: w.english,
            japanese: w.japanese,
          }));

        if (wordsNeedingExamples.length > 0) {
          try {
            const exampleResult = await generateExampleSentences(wordsNeedingExamples, apiKeys);
            const exampleMap = new Map(exampleResult.examples.map((ex) => [ex.wordId, ex]));

            let exIdx = 0;
            for (const word of resolvedWords) {
              if (!word.exampleSentence) {
                const generated = exampleMap.get(String(exIdx));
                if (generated) {
                  word.exampleSentence = generated.exampleSentence;
                  word.exampleSentenceJa = generated.exampleSentenceJa;
                  if (!word.partOfSpeechTags?.length) {
                    word.partOfSpeechTags = generated.partOfSpeechTags;
                  }
                }
                exIdx++;
              }
            }

            if (exampleResult.errors.length > 0) {
              console.warn('[scan-jobs/process] Example generation partial errors (client_local):', exampleResult.errors);
            }
          } catch (exampleError) {
            // Example generation failure should NOT fail the scan
            console.error('[scan-jobs/process] Example generation failed (client_local), continuing without:', exampleError);
          }
        }

        const resultPayload: {
          wordCount: number;
          warnings?: string[];
          saveMode: ScanJobSaveMode;
          extractedWords: ProcessedExtractedWord[];
          sourceLabels: string[];
          lexiconEntries: unknown[];
        } = {
          wordCount: resolvedWords.length,
          saveMode,
          extractedWords: resolvedWords,
          sourceLabels: dedupedSourceLabels,
          lexiconEntries: [],
        };
        if (warnings.length > 0) {
          resultPayload.warnings = warnings;
        }

        timing.totalMs = Date.now() - startedAt;
        timing.imageCount = imagePaths.length;
        timing.wordCount = dedupedWords.length;

        await getSupabaseAdmin()
          .from('scan_jobs')
          .update({
            status: 'completed',
            project_id: null,
            result: JSON.stringify(resultPayload),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        const completedParams1 = {
          userId: job.user_id,
          jobId,
          projectId: null,
          projectTitle: job.project_title,
          status: 'completed' as const,
          wordCount: resolvedWords.length,
        };
        void sendScanJobPushNotifications(getSupabaseAdmin(), completedParams1).catch(e => console.error('Failed to send completed push notification:', e));
        void sendScanJobApnsNotifications(getSupabaseAdmin(), completedParams1).catch(e => console.error('[APNs] completed push failed:', e));

        return NextResponse.json({
          success: true,
          saveMode,
          projectId: null,
          wordCount: resolvedWords.length,
        });
      }

      let projectId: string;
      let projectTitleForNotification = job.project_title as string;
      let createdNewProject = false;
      let usedProjectSourceLabelsCompat = false;

      if (targetProjectId) {
        const { data: existingProject, error: existingProjectError, usedLegacyColumns: usedLegacySelectColumns } =
          await selectProjectWithSourceLabelsCompat<{
            id: string;
            title: string | null;
            source_labels?: string[] | null;
          }>(
            getSupabaseAdmin(),
            targetProjectId,
            job.user_id,
          );
        usedProjectSourceLabelsCompat = usedProjectSourceLabelsCompat || usedLegacySelectColumns;

        if (existingProjectError || !existingProject) {
          throw new Error('指定した単語帳が見つかりません。');
        }

        projectId = existingProject.id;
        projectTitleForNotification = existingProject.title ?? projectTitleForNotification;

        if (job.project_icon_image) {
          const { error: iconUpdateError } = await getSupabaseAdmin()
            .from('projects')
            .update({ icon_image: job.project_icon_image })
            .eq('id', existingProject.id)
            .eq('user_id', job.user_id);

          if (iconUpdateError) {
            console.error('Project icon update error:', iconUpdateError);
            throw new Error('Failed to update project icon');
          }
        }

        const mergedProjectSourceLabels = mergeSourceLabels(existingProject.source_labels, dedupedSourceLabels);
        const { error: sourceLabelUpdateError, usedLegacyColumns: usedLegacyUpdateColumns } = await updateProjectSourceLabelsCompat(
          getSupabaseAdmin(),
          existingProject.id,
          mergedProjectSourceLabels,
          job.user_id,
        );
        usedProjectSourceLabelsCompat = usedProjectSourceLabelsCompat || usedLegacyUpdateColumns;

        if (sourceLabelUpdateError) {
          console.error('Project source label update error:', sourceLabelUpdateError);
          throw new Error('Failed to update project source labels');
        }
      } else {
        const { data: newProject, error: projectError, usedLegacyColumns: usedLegacyInsertColumns } =
          await insertProjectWithSourceLabelsCompat<{
            id: string;
            title?: string | null;
          }>(
            getSupabaseAdmin(),
            {
              user_id: job.user_id,
              title: job.project_title,
              source_labels: dedupedSourceLabels,
              icon_image: job.project_icon_image ?? null,
            },
          );
        usedProjectSourceLabelsCompat = usedProjectSourceLabelsCompat || usedLegacyInsertColumns;

        if (projectError || !newProject) {
          console.error('Project creation error:', projectError);
          throw new Error('Failed to create project');
        }

        projectId = newProject.id;
        projectTitleForNotification = newProject.title ?? projectTitleForNotification;
        createdNewProject = true;
      }

      if (usedProjectSourceLabelsCompat) {
        console.warn('[scan-jobs/process] projects.source_labels compatibility fallback used');
      }

      const wordsToInsert = resolvedWords.map((word) => ({
        project_id: projectId,
        english: word.english,
        japanese: word.japanese,
        lexicon_entry_id: word.lexiconEntryId ?? null,
        distractors: word.distractors,
        example_sentence: word.exampleSentence || null,
        example_sentence_ja: word.exampleSentenceJa || null,
        part_of_speech_tags: word.partOfSpeechTags,
      }));

      const dbInsertStart = Date.now();
      const { data: insertedWords, error: wordsError } = await getSupabaseAdmin()
        .from('words')
        .insert(wordsToInsert)
        .select('id, english, japanese, lexicon_entry_id, distractors, example_sentence, example_sentence_ja, part_of_speech_tags');
      timing.dbInsertMs = Date.now() - dbInsertStart;

      if (wordsError) {
        if (createdNewProject) {
          await getSupabaseAdmin().from('projects').delete().eq('id', projectId);
        }
        throw new Error('Failed to insert words');
      }

      const insertedWordsArray = insertedWords ?? [];
      const aiTranslatedWordIds = resolvedWords
        .map((word, index) => (word.japaneseSource === 'ai' ? insertedWordsArray[index]?.id : null))
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

      // --- Synchronous example sentence generation (server_cloud) ---
      const wordsForExampleGen = insertedWordsArray
        .filter((w: { id: string; example_sentence: string | null; japanese: string }) =>
          !w.example_sentence || w.example_sentence.trim().length === 0
        )
        .map((w: { id: string; english: string; japanese: string }) => ({
          id: w.id,
          english: w.english,
          japanese: w.japanese,
        }));

      let exampleGenCount = 0;
      if (wordsForExampleGen.length > 0) {
        try {
          const exampleResult = await generateExampleSentences(wordsForExampleGen, apiKeys);

          if (exampleResult.examples.length > 0) {
            // Batch update DB with generated examples
            await Promise.all(
              exampleResult.examples.map((ex) =>
                getSupabaseAdmin()
                  .from('words')
                  .update({
                    example_sentence: ex.exampleSentence,
                    example_sentence_ja: ex.exampleSentenceJa,
                    part_of_speech_tags: ex.partOfSpeechTags,
                  })
                  .eq('id', ex.wordId)
              )
            );
            exampleGenCount = exampleResult.examples.length;
          }

          if (exampleResult.errors.length > 0) {
            console.warn('[scan-jobs/process] Example generation partial errors:', exampleResult.errors);
          }

          console.log('[scan-jobs/process] Example generation completed', {
            jobId,
            requested: wordsForExampleGen.length,
            generated: exampleGenCount,
            elapsedMs: Date.now() - startedAt,
          });
        } catch (exampleError) {
          // Example generation failure should NOT fail the scan
          console.error('[scan-jobs/process] Example generation failed, continuing without:', exampleError);
        }
      }

      const resultPayload: {
        wordCount: number;
        warnings?: string[];
        saveMode: ScanJobSaveMode;
        targetProjectId: string;
        sourceLabels: string[];
        quizPrefillRequested?: number;
        quizPrefillSucceeded?: number;
        quizPrefillFailed?: number;
      } = {
        wordCount: resolvedWords.length,
        saveMode,
        targetProjectId: projectId,
        sourceLabels: dedupedSourceLabels,
      };
      if (warnings.length > 0) {
        resultPayload.warnings = warnings;
      }


      const exampleGenStart = Date.now();
      if (aiEnabled) {
        const quizSeedWords: QuizSeedWord[] = insertedWordsArray
          .filter((w: {
            distractors: unknown;
            example_sentence: string | null;
            example_sentence_ja: string | null;
            part_of_speech_tags: unknown;
          }) =>
            !hasValidDistractors(w.distractors) ||
            !hasExampleSentence(w.example_sentence) ||
            !hasPartOfSpeechTags(w.part_of_speech_tags)
          )
          .map((w: { id: string; english: string; japanese: string }) => ({
            id: w.id,
            english: w.english,
            japanese: w.japanese,
          }));

        let quizPrefillSucceeded = 0;
        const quizPrefillFailedWordIds = new Set<string>();

        for (const batch of chunkArray(quizSeedWords, QUIZ_PREFILL_BATCH_SIZE)) {
          const { results, failedWordIds } = await generateQuizContentWithRetry(batch);

          if (results.length > 0) {
            try {
              await Promise.all(
                results.map((item) =>
                  getSupabaseAdmin()
                    .from('words')
                    .update({
                      distractors: item.distractors,
                      example_sentence: item.exampleSentence || null,
                      example_sentence_ja: item.exampleSentenceJa || null,
                      part_of_speech_tags: item.partOfSpeechTags,
                    })
                    .eq('id', item.wordId)
                )
              );
              quizPrefillSucceeded += results.length;
            } catch (persistError) {
              console.error('Failed to persist quiz prefill batch:', persistError);
              for (const item of results) {
                quizPrefillFailedWordIds.add(item.wordId);
              }
            }
          }

          for (const failedWordId of failedWordIds) {
            quizPrefillFailedWordIds.add(failedWordId);
          }
        }

        if (quizSeedWords.length > 0) {
          resultPayload.quizPrefillRequested = quizSeedWords.length;
          resultPayload.quizPrefillSucceeded = quizPrefillSucceeded;
          resultPayload.quizPrefillFailed = quizPrefillFailedWordIds.size;
        }
      }
      timing.exampleGenerationMs = Date.now() - exampleGenStart;

      timing.totalMs = Date.now() - startedAt;
      timing.imageCount = imagePaths.length;
      timing.wordCount = dedupedWords.length;

      await getSupabaseAdmin()
        .from('scan_jobs')
        .update({
          status: 'completed',
          project_id: projectId,
          result: JSON.stringify(resultPayload),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      const completedParams2 = {
        userId: job.user_id,
        jobId,
        projectId,
        projectTitle: projectTitleForNotification,
        status: 'completed' as const,
        wordCount: resolvedWords.length,
      };
      void sendScanJobPushNotifications(getSupabaseAdmin(), completedParams2).catch(e => console.error('Failed to send completed push notification:', e));
      void sendScanJobApnsNotifications(getSupabaseAdmin(), completedParams2).catch(e => console.error('[APNs] completed push failed:', e));

      // Log timing to Google Spreadsheet (fire-and-forget)
      void logTimingToSheet(timing, jobId, job.user_id, 'completed').catch(e =>
        console.error('[timing-sheet] Failed to log:', e)
      );

      // Heavy/non-critical tasks run after completion update.
      after(async () => {
        const aiTranslatedWordIdSet = new Set(aiTranslatedWordIds);
        const pendingWordIds = insertedWordsArray
          .filter((row: {
            id: string;
            lexicon_entry_id?: string | null;
            part_of_speech_tags?: unknown;
          }) =>
            aiTranslatedWordIdSet.has(row.id) ||
            needsWordLexiconResolution({
              lexiconEntryId: row.lexicon_entry_id ?? null,
              partOfSpeechTags: row.part_of_speech_tags,
            })
          )
          .map((row: { id: string }) => row.id);

        if (pendingWordIds.length > 0) {
          try {
            const wordResolutionJobIds = await enqueueWordLexiconResolutionJobs(
              'scan',
              pendingWordIds,
              {
                aiTranslatedWordIds,
              },
            );
            if (ENABLE_IMMEDIATE_WORD_LEXICON_PROCESSING && wordResolutionJobIds.length > 0) {
              await Promise.all(
                wordResolutionJobIds.map((resolutionJobId) =>
                  triggerWordLexiconResolutionProcessing(request.url, resolutionJobId),
                ),
              );
            }
          } catch (error) {
            console.error('[scan-jobs/process] Failed to enqueue word lexicon resolution', {
              jobId,
              error,
            });
          }
        }

        if (insertedWordsArray.length === 0) return;

        if (ENABLE_POST_SCAN_QUIZ_PREFILL && aiEnabled) {
          const quizSeedWords: QuizSeedWord[] = insertedWordsArray
            .filter((w: {
              distractors: unknown;
              example_sentence: string | null;
              example_sentence_ja: string | null;
              part_of_speech_tags: unknown;
            }) =>
              !hasValidDistractors(w.distractors) ||
              !hasExampleSentence(w.example_sentence) ||
              !hasPartOfSpeechTags(w.part_of_speech_tags)
            )
            .map((w: { id: string; english: string; japanese: string }) => ({
              id: w.id,
              english: w.english,
              japanese: w.japanese,
            }));

          if (quizSeedWords.length > 0) {
            let quizPrefillSucceeded = 0;
            const quizPrefillFailedWordIds = new Set<string>();

            for (const batch of chunkArray(quizSeedWords, QUIZ_PREFILL_BATCH_SIZE)) {
              const { results, failedWordIds } = await generateQuizContentWithRetry(batch);

              if (results.length > 0) {
                try {
                  await Promise.all(
                    results.map((item) =>
                      getSupabaseAdmin()
                        .from('words')
                        .update({
                          distractors: item.distractors,
                          example_sentence: item.exampleSentence || null,
                          example_sentence_ja: item.exampleSentenceJa || null,
                          part_of_speech_tags: item.partOfSpeechTags,
                        })
                        .eq('id', item.wordId)
                    )
                  );
                  quizPrefillSucceeded += results.length;
                } catch (persistError) {
                  console.error('Failed to persist quiz prefill batch:', persistError);
                  for (const item of results) {
                    quizPrefillFailedWordIds.add(item.wordId);
                  }
                }
              }

              for (const failedWordId of failedWordIds) {
                quizPrefillFailedWordIds.add(failedWordId);
              }
            }

            console.log('Background quiz prefill finished:', {
              jobId,
              requested: quizSeedWords.length,
              succeeded: quizPrefillSucceeded,
              failed: quizPrefillFailedWordIds.size,
            });
          }
        }

      });

      return NextResponse.json({
        success: true,
        saveMode,
        projectId,
        wordCount: resolvedWords.length,
      });

    } catch (processingError) {
      console.error('Processing error:', processingError);

      timing.totalMs = Date.now() - startedAt;

      await getSupabaseAdmin()
        .from('scan_jobs')
        .update({
          status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Processing failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      const failParams2 = {
        userId: job.user_id,
        jobId,
        projectId: null,
        projectTitle: job.project_title,
        status: 'failed' as const,
        wordCount: 0,
      };
      await sendScanJobPushNotifications(getSupabaseAdmin(), failParams2);
      void sendScanJobApnsNotifications(getSupabaseAdmin(), failParams2).catch(e => console.error('[APNs] fail push failed:', e));

      void logTimingToSheet(timing, jobId, job.user_id, 'failed').catch(e =>
        console.error('[timing-sheet] Failed to log:', e)
      );

      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }

  } catch (error) {
    console.error('Process route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
