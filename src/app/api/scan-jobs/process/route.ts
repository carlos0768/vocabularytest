import { after, NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authorizeInternalWorkerRequest } from '@/lib/api/internal-worker';
import { extractWordsFromImage } from '@/lib/ai/extract-words';
import { extractCircledWordsFromImage } from '@/lib/ai/extract-circled-words';
import { extractEikenWordsFromImage } from '@/lib/ai/extract-eiken-words';
import { extractIdiomsFromImage } from '@/lib/ai/extract-idioms';
import { extractCompositeWordsFromImage } from '@/lib/ai/extract-composite-words';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { readSingleLineEnv } from '@/lib/env';
import { sendScanJobPushNotifications } from '@/lib/notifications/web-push';
import { sendScanJobApnsNotifications } from '@/lib/notifications/apns';
import { generateQuizContentForWords, type QuizContentResult } from '@/lib/ai/generate-quiz-content';
import { AI_CONFIG, getAPIKeys } from '@/lib/ai/config';
import {
  applySourceModesFromScanModes,
  getMissingProviderKey,
  getMissingProviderKeyForModes,
  getProvidersForMode,
  normalizeExtractModes,
  type ExtractMode,
} from '@/lib/scan/mode-provider';
import { buildClientLocalScanJobResultPayload } from '@/lib/scan/job-result-payload';
import {
  buildScanJobNoWordsErrorMessage,
  buildScanJobProcessingInput,
  type ScanJobProcessSaveMode,
} from '@/lib/scan/job-processing-input';
import {
  buildServerCloudMergedProjectSourceLabels,
  buildServerCloudProjectInsertPayload,
  buildServerCloudWordsInsertPayload,
  getMissingWordsCompatColumn,
  getServerCloudWordsInsertSelectColumns,
  shouldRollbackServerCloudProjectAfterWordsInsertFailure,
  stripServerCloudWordsInsertPayloadForCompat,
} from '@/lib/scan/server-cloud-persistence';
import { buildServerCloudScanJobResultPayload } from '@/lib/scan/server-cloud-result-payload';
import {
  applyClientLocalGeneratedExamples,
  buildClientLocalExampleSeedWords,
  buildServerCloudExampleSeedWords,
  buildServerCloudExampleUpdatePayload,
  type ServerCloudExampleCandidateWord,
} from '@/lib/scan/example-generation';
import {
  buildScanJobCompletedNotificationParams,
  buildScanJobFailedNotificationParams,
  buildScanJobWarningNotificationParams,
  flushScanJobTimingLogs,
  type ScanJobNotificationParams,
} from '@/lib/scan/job-side-effects';
import {
  processScanImage,
  type ScanImageExtractionResult,
} from '@/lib/scan/image-extraction';
import {
  buildPostScanLexiconResolutionWordIds,
  buildPostScanQuizPrefillSeedWords,
} from '@/lib/scan/post-processing';
import {
  buildQuizPrefillSeedWords,
  buildQuizPrefillWordUpdatePayload,
  type QuizPrefillCandidateWord,
  type QuizPrefillSeedWord,
} from '@/lib/scan/quiz-prefill';
import {
  prefillWordOrderQuizzesForWords,
  type WordOrderQuizPrefillCandidateWord,
} from '@/lib/scan/word-order-prefill';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import {
  generateExampleSentences,
  saveExamplesToLexicon,
  type ExampleGenerationFailureKind,
  type ExampleGenerationSummary,
} from '@/lib/ai/generate-example-sentences';
import { fetchExampleGenresForProUser } from '@/lib/preferences/example-genres';
import { backfillPronunciations } from '@/lib/ai/pronunciation-lookup';
import {
  enqueueWordLexiconResolutionJobs,
  triggerWordLexiconResolutionProcessing,
} from '@/lib/lexicon/word-resolution-jobs';
import { resolveImmediateWordsWithMasterFirst } from '@/lib/lexicon/master-first-scan';
import { backfillMissingJapaneseTranslationsWithMetadata } from '@/lib/words/backfill-japanese';
import {
  buildWordTranslationInsertRows,
  isWordTranslationsSchemaError,
  normalizeWordForTranslationPersistence,
} from '@/lib/words/translation-persistence';
import type { CustomSection, WordTranslation } from '@/types';
import {
  insertProjectWithSourceLabelsCompat,
  selectProjectWithSourceLabelsCompat,
  updateProjectSourceLabelsCompat,
} from '@/lib/supabase/project-source-labels-compat';
import { ensureSourceLabels, mergeSourceLabels } from '../../../../../shared/source-labels';
import {
  runWithCloudRunTimingCollector,
  summarizeCloudRunTimingEntries,
  withCloudRunTimingPhase,
  type CloudRunTimingEntry,
} from '@/lib/ai/providers/cloud-run-timing';

// Lazy initialization to avoid build-time errors
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
    const key = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');
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

type ExtractionWarningCode =
  | 'grammar_not_found'
  | 'example_generation_partial_failure'
  | 'example_generation_failed';
type ScanJobSaveMode = ScanJobProcessSaveMode;

type ExtractionLikeResult =
  | { success: true; data: { words: unknown[]; sourceLabels?: unknown[] } }
  | { success: false; error: string; reason?: string };

export interface ProcessJobDeps {
  supabaseAdmin?: SupabaseClient;
  getApiKeys?: typeof getAPIKeys;
  extractImage?: typeof extractFromImage;
  resolveImmediateWords?: typeof resolveImmediateWordsWithMasterFirst;
  backfillWords?: typeof backfillMissingJapaneseTranslationsWithMetadata;
  generateExamples?: typeof generateExampleSentences;
  prefillWordOrderQuizzes?: typeof prefillWordOrderQuizzesForWords;
  sendPushNotifications?: typeof sendScanJobPushNotifications;
  sendApnsNotifications?: typeof sendScanJobApnsNotifications;
  flushTiming?: typeof flushTimingLogs;
  afterTask?: typeof after;
  scanModesOverride?: ExtractMode[];
}

async function sendScanJobNotifications(params: {
  supabaseAdmin: SupabaseClient;
  notification: ScanJobNotificationParams;
  sendPushNotifications: typeof sendScanJobPushNotifications;
  sendApnsNotifications: typeof sendScanJobApnsNotifications;
  logContext: string;
}): Promise<void> {
  const [webPushResult, apnsResult] = await Promise.allSettled([
    params.sendPushNotifications(params.supabaseAdmin, params.notification),
    params.sendApnsNotifications(params.supabaseAdmin, params.notification),
  ]);

  if (webPushResult.status === 'rejected') {
    console.error(`[scan-jobs/process] ${params.logContext} web push failed:`, webPushResult.reason);
  }
  if (apnsResult.status === 'rejected') {
    console.error(`[scan-jobs/process] ${params.logContext} APNs push failed:`, apnsResult.reason);
  }
}

interface ProcessedExtractedWord {
  english: string;
  japanese: string;
  rawJapanese?: string;
  translations?: WordTranslation[];
  japaneseSource?: 'scan' | 'ai';
  sourceModes?: ExtractMode[];
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  lexiconDistinctKey?: string;
  lexiconSenseIsPrimary?: boolean;
  cefrLevel?: string;
  distractors: string[];
  partOfSpeechTags?: string[];
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  customSections?: CustomSection[];
}

type InsertedServerCloudWord =
  ServerCloudExampleCandidateWord &
  QuizPrefillCandidateWord &
  WordOrderQuizPrefillCandidateWord & {
    lexicon_entry_id?: string | null;
    japaneseSource?: 'scan' | 'ai';
  };

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

export const __internal = {
  getProvidersForMode,
  getMissingProviderKey,
  getMissingProviderKeyForModes,
  normalizeExtractModes,
  extractFromImage,
  parseExtractedWords,
  dedupeExtractedWords,
  getExampleGenerationWarning,
  buildFailedExampleGenerationSummary,
  applyExampleGenerationSummary,
};

function createExampleGenerationFailureKinds(): Record<ExampleGenerationFailureKind, number> {
  return {
    provider: 0,
    parse: 0,
    validation: 0,
    empty: 0,
  };
}

function buildFailedExampleGenerationSummary(
  requested: number,
  kind: ExampleGenerationFailureKind = 'provider',
): ExampleGenerationSummary {
  const failureKinds = createExampleGenerationFailureKinds();
  failureKinds[kind] = requested;

  return {
    requested,
    generated: 0,
    failed: requested,
    retried: 0,
    retryRecovered: 0,
    failureKinds,
  };
}

function getExampleGenerationWarning(
  summary?: ExampleGenerationSummary,
): ExtractionWarningCode | null {
  if (!summary || summary.failed === 0) {
    return null;
  }

  return summary.generated === 0
    ? 'example_generation_failed'
    : 'example_generation_partial_failure';
}

function applyExampleGenerationSummary<T extends { exampleGeneration?: ExampleGenerationSummary }>(
  payload: T,
  warningSet: Set<string>,
  summary?: ExampleGenerationSummary,
): T {
  if (!summary) {
    return payload;
  }

  payload.exampleGeneration = summary;
  const warning = getExampleGenerationWarning(summary);
  if (warning) {
    warningSet.add(warning);
  }

  return payload;
}

function isMasterFirstResolutionEnabledForModes(modes: Iterable<ExtractMode>): boolean {
  const disabledModes = (process.env.MASTER_FIRST_SCAN_DISABLED_MODES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return normalizeExtractModes(Array.from(modes)).every((mode) => !disabledModes.includes(mode));
}

function classifyUnexpectedExampleGenerationFailure(
  error: unknown,
): ExampleGenerationFailureKind {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (message.includes('AI generation failed')) return 'provider';
  if (message.includes('Empty example sentence')) return 'empty';
  if (message.includes('parse') || message.includes('JSON')) return 'parse';
  return 'validation';
}

function logExampleGenerationOutcome(params: {
  jobId: string;
  saveMode: ScanJobSaveMode;
  summary: ExampleGenerationSummary;
  errors: string[];
  elapsedMs: number;
}) {
  const { jobId, saveMode, summary, errors, elapsedMs } = params;
  console.log('[scan-jobs/process] Example generation completed', {
    jobId,
    saveMode,
    requested: summary.requested,
    generated: summary.generated,
    failed: summary.failed,
    retried: summary.retried,
    retryRecovered: summary.retryRecovered,
    failureKinds: summary.failureKinds,
    elapsedMs,
  });

  if (errors.length > 0) {
    console.warn('[scan-jobs/process] Example generation terminal errors', {
      jobId,
      saveMode,
      errors,
    });
  }
}

interface ExtractionHandlers {
  extractWordsFromImage: typeof extractWordsFromImage;
  extractCircledWordsFromImage: typeof extractCircledWordsFromImage;
  extractEikenWordsFromImage: typeof extractEikenWordsFromImage;
  extractIdiomsFromImage: typeof extractIdiomsFromImage;
  extractCompositeWordsFromImage: typeof extractCompositeWordsFromImage;
}

const defaultExtractionHandlers: ExtractionHandlers = {
  extractWordsFromImage,
  extractCircledWordsFromImage,
  extractEikenWordsFromImage,
  extractIdiomsFromImage,
  extractCompositeWordsFromImage,
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

interface TimingMetrics {
  totalMs: number;
  imageDownloadMs: number;
  aiExtractionMs: number;
  parseValidationMs: number;
  lexiconResolutionMs: number;
  exampleGenerationMs: number;
  dbInsertMs: number;
  imageCount: number;
  wordCount: number;
  scanMode: string;
  model: string;
  perImage: Array<{ downloadMs: number; extractionMs: number }>;
}

interface TimingSheetOptions {
  sheetUrl?: string;
  sheetName?: string;
  startedAt?: string;
  endedAt?: string;
}

const SCAN_TIMING_SHEET_URL = process.env.SCAN_TIMING_SHEET_URL?.trim();
const SCAN_TIMING_GCP_SHEET_URL = process.env.SCAN_TIMING_GCP_SHEET_URL?.trim() || SCAN_TIMING_SHEET_URL;
const SCAN_TIMING_GCP_SHEET_NAME = process.env.SCAN_TIMING_GCP_SHEET_NAME?.trim() || 'シート2';

function createTimingMetrics(): TimingMetrics {
  return {
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
    perImage: [],
  };
}

async function logTimingToSheet(
  timing: TimingMetrics,
  jobId: string,
  userId: string,
  status: string,
  options: TimingSheetOptions = {}
): Promise<void> {
  const sheetUrl = options.sheetUrl ?? SCAN_TIMING_SHEET_URL;
  if (!sheetUrl) return;

  const endedAtIso = options.endedAt ?? new Date().toISOString();
  const endedAtMs = Date.parse(endedAtIso);
  const fallbackEndedAtMs = Number.isFinite(endedAtMs) ? endedAtMs : Date.now();
  const startedAtIso =
    options.startedAt ??
    new Date(fallbackEndedAtMs - (timing.totalMs || 0)).toISOString();

  await fetch(sheetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: endedAtIso,
      endedAt: endedAtIso,
      startedAt: startedAtIso,
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
      ...(options.sheetName ? { sheetName: options.sheetName } : {}),
    }),
  });
}

async function flushTimingLogs(
  entries: CloudRunTimingEntry[],
  baseTiming: TimingMetrics,
  jobId: string,
  userId: string,
  status: string
): Promise<void> {
  const tasks: Array<Promise<void>> = [
    logTimingToSheet(baseTiming, jobId, userId, status),
  ];
  const summary = summarizeCloudRunTimingEntries(entries);

  if (summary.requestCount === 0) {
    console.warn('[timing-sheet-gcp] No Cloud Run timing entries collected', {
      jobId,
      status,
      scanMode: baseTiming.scanMode,
      imageCount: baseTiming.imageCount,
      wordCount: baseTiming.wordCount,
    });
  } else {
    console.log('[timing-sheet-gcp] Logging Cloud Run timing', {
      jobId,
      status,
      requestCount: summary.requestCount,
      totalMs: summary.totalMs,
      aiExtractionMs: summary.aiExtractionMs,
      exampleGenerationMs: summary.exampleGenerationMs,
      model: summary.model,
    });

    const gcpTiming = createTimingMetrics();
    gcpTiming.totalMs = summary.totalMs;
    gcpTiming.aiExtractionMs = summary.aiExtractionMs;
    gcpTiming.exampleGenerationMs = summary.exampleGenerationMs;
    gcpTiming.imageCount = baseTiming.imageCount;
    gcpTiming.wordCount = baseTiming.wordCount;
    gcpTiming.scanMode = baseTiming.scanMode;
    gcpTiming.model = summary.model || baseTiming.model;

    tasks.push(
      logTimingToSheet(gcpTiming, jobId, userId, status, {
        sheetUrl: SCAN_TIMING_GCP_SHEET_URL,
        sheetName: SCAN_TIMING_GCP_SHEET_NAME,
        startedAt: summary.startedAt,
        endedAt: summary.endedAt,
      })
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') continue;
    if (index === 0) {
      console.error('[timing-sheet] Failed to log:', result.reason);
      continue;
    }
    console.error('[timing-sheet-gcp] Failed to log:', result.reason);
  }
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

function normalizeSourceModes(value: unknown, fallback: ExtractMode[] = []): ExtractMode[] | undefined {
  const normalized = normalizeExtractModes(value, fallback);
  return normalized.length > 0 ? normalized : undefined;
}

function mergeExtractSourceModes(
  first?: ExtractMode[],
  second?: ExtractMode[],
): ExtractMode[] | undefined {
  return normalizeSourceModes([...(first ?? []), ...(second ?? [])], []);
}

function applySourceModesToExtractionResult(
  result: ExtractionLikeResult,
  modes: ExtractMode[],
): ExtractionLikeResult {
  if (!result.success) return result;

  return {
    ...result,
    data: {
      ...result.data,
      words: applySourceModesFromScanModes(result.data.words, modes),
    },
  };
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
    const normalizedWord = normalizeWordForTranslationPersistence({
      english,
      japanese: normalizedJapanese,
      rawJapanese: firstNonEmpty(word.rawJapanese),
      translations: word.translations,
      japaneseSource: normalizedJapanese ? normalizeJapaneseSource(word.japaneseSource) : undefined,
      sourceModes: normalizeSourceModes(word.sourceModes, []),
      lexiconSenseId: firstNonEmpty(word.lexiconSenseId),
      distractors: mergeDistractors([], word.distractors),
      partOfSpeechTags: normalizePartOfSpeechTags(word.partOfSpeechTags),
      pronunciation: firstNonEmpty(word.pronunciation),
      exampleSentence: firstNonEmpty(word.exampleSentence),
      exampleSentenceJa: firstNonEmpty(word.exampleSentenceJa),
      customSections: word.customSections,
    });

    parsed.push(normalizedWord);
  }

  return parsed;
}

function dedupeExtractedWords(
  words: ProcessedExtractedWord[],
  sourceModesOverride?: ExtractMode[],
): ProcessedExtractedWord[] {
  if (words.length === 0) return [];

  const normalizedSourceModesOverride = sourceModesOverride
    ? normalizeExtractModes(sourceModesOverride)
    : undefined;
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
        rawJapanese: source.rawJapanese,
        translations: source.translations,
        japaneseSource: source.japaneseSource,
        lexiconEntryId: source.lexiconEntryId,
        lexiconSenseId: source.lexiconSenseId,
        lexiconDistinctKey: source.lexiconDistinctKey,
        lexiconSenseIsPrimary: source.lexiconSenseIsPrimary,
        sourceModes: normalizedSourceModesOverride
          ? [...normalizedSourceModesOverride]
          : source.sourceModes,
        distractors: mergeDistractors([], source.distractors),
        partOfSpeechTags: normalizePartOfSpeechTags(source.partOfSpeechTags),
        pronunciation: firstNonEmpty(source.pronunciation),
        exampleSentence: firstNonEmpty(source.exampleSentence),
        exampleSentenceJa: firstNonEmpty(source.exampleSentenceJa),
        customSections: source.customSections,
      });
      continue;
    }

    const existing = deduped[existingIndex];
    deduped[existingIndex] = {
      english: existing.english,
      japanese: existing.japanese,
      rawJapanese: existing.rawJapanese ?? source.rawJapanese,
      translations: existing.translations && existing.translations.length > 0
        ? existing.translations
        : source.translations,
      japaneseSource: preferJapaneseSource(existing.japaneseSource, source.japaneseSource),
      lexiconEntryId: existing.lexiconEntryId ?? source.lexiconEntryId,
      lexiconSenseId: existing.lexiconSenseId ?? source.lexiconSenseId,
      lexiconDistinctKey: existing.lexiconDistinctKey ?? source.lexiconDistinctKey,
      lexiconSenseIsPrimary: existing.lexiconSenseIsPrimary ?? source.lexiconSenseIsPrimary,
      sourceModes: normalizedSourceModesOverride
        ? [...normalizedSourceModesOverride]
        : mergeExtractSourceModes(existing.sourceModes, source.sourceModes),
      distractors: mergeDistractors(existing.distractors, source.distractors),
      partOfSpeechTags: normalizePartOfSpeechTags([
        ...(existing.partOfSpeechTags ?? []),
        ...(source.partOfSpeechTags ?? []),
      ]),
      pronunciation: existing.pronunciation ?? firstNonEmpty(source.pronunciation),
      exampleSentence: existing.exampleSentence ?? firstNonEmpty(source.exampleSentence),
      exampleSentenceJa: existing.exampleSentenceJa ?? firstNonEmpty(source.exampleSentenceJa),
      customSections: existing.customSections ?? source.customSections,
    };
  }

  return deduped;
}

async function generateQuizContentWithRetry(
  words: QuizPrefillSeedWord[],
  genres: readonly string[] = [],
): Promise<{
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
      const generated = await generateQuizContentForWords(pending, { genres });
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
  modesOrMode: ExtractMode[] | ExtractMode,
  eikenLevel: string | null,
  apiKeys: { gemini?: string; openai?: string },
  handlers: ExtractionHandlers = defaultExtractionHandlers
): Promise<{ result: ExtractionLikeResult; warningCode?: ExtractionWarningCode }> {
  const modes = normalizeExtractModes(modesOrMode);
  if (modes.length > 1) {
    const result = await handlers.extractCompositeWordsFromImage(base64Image, apiKeys, {
      modes,
      eikenLevel: modes.includes('eiken') ? normalizeEikenLevel(eikenLevel) : null,
    }) as ExtractionLikeResult;
    return { result: applySourceModesToExtractionResult(result, modes) };
  }

  const mode = modes[0] ?? 'all';
  switch (mode) {
    case 'circled': {
      const result = await handlers.extractCircledWordsFromImage(base64Image, apiKeys, {}) as ExtractionLikeResult;
      return { result: applySourceModesToExtractionResult(result, modes) };
    }
    case 'eiken': {
      const normalizedLevel = normalizeEikenLevel(eikenLevel);
      if (eikenLevel && normalizedLevel !== eikenLevel.trim()) {
        console.log('Normalized eikenLevel for scan job:', { rawLevel: eikenLevel, normalizedLevel });
      }
      const result = await handlers.extractEikenWordsFromImage(
          base64Image,
          apiKeys,
          normalizedLevel
        ) as ExtractionLikeResult;
      return { result: applySourceModesToExtractionResult(result, modes) };
    }
    case 'idiom': {
      const idiomResult = await handlers.extractIdiomsFromImage(base64Image, apiKeys);
      if (!idiomResult.success && idiomResult.reason === 'no_idiom_found') {
        console.warn('No idioms found in background scan. Falling back to all-word extraction.');
        return {
          result: applySourceModesToExtractionResult(
            await handlers.extractWordsFromImage(base64Image, apiKeys, { includeExamples: false }) as ExtractionLikeResult,
            modes,
          ),
          warningCode: 'grammar_not_found',
        };
      }
      return { result: applySourceModesToExtractionResult(idiomResult as ExtractionLikeResult, modes) };
    }
    default: {
      const result = await handlers.extractWordsFromImage(base64Image, apiKeys, { includeExamples: false }) as ExtractionLikeResult;
      return { result: applySourceModesToExtractionResult(result, modes) };
    }
  }
}

export async function processJobById(jobId: string, processDeps?: ProcessJobDeps): Promise<NextResponse> {
  try {
    console.log('[scan-jobs/process] Processing started', { jobId });

    const supabaseAdmin = processDeps?.supabaseAdmin ?? getSupabaseAdmin();
    const getApiKeys = processDeps?.getApiKeys ?? getAPIKeys;
    const extractImage = processDeps?.extractImage ?? extractFromImage;
    const resolveImmediateWords = processDeps?.resolveImmediateWords ?? resolveImmediateWordsWithMasterFirst;
    const backfillWords = processDeps?.backfillWords ?? backfillMissingJapaneseTranslationsWithMetadata;
    const generateExamples = processDeps?.generateExamples ?? generateExampleSentences;
    const prefillWordOrderQuizzes = processDeps?.prefillWordOrderQuizzes ?? prefillWordOrderQuizzesForWords;
    const sendPushNotifications = processDeps?.sendPushNotifications ?? sendScanJobPushNotifications;
    const sendApnsNotifications = processDeps?.sendApnsNotifications ?? sendScanJobApnsNotifications;
    const flushTiming = processDeps?.flushTiming ?? flushTimingLogs;
    const scheduleAfter = processDeps?.afterTask ?? after;

    const processingTimestamp = new Date().toISOString();
    const { data: claimedJob, error: claimError } = await supabaseAdmin
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
      const { data: existingJob, error: jobError } = await supabaseAdmin
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

    const cloudRunTimingEntries: CloudRunTimingEntry[] = [];
    return await runWithCloudRunTimingCollector(cloudRunTimingEntries, async () => {
      const apiKeys = getApiKeys();
      // ユーザの興味ジャンル（例文パーソナライズ用・Pro限定）。非Pro/取得失敗時は空配列で続行。
      const exampleGenres = await fetchExampleGenresForProUser(supabaseAdmin, job.user_id);
      const processingStartedAt = Date.now();
      const timing = createTimingMetrics();

      try {
        const { imagePaths, saveMode } = buildScanJobProcessingInput(job);
        const targetProjectId: string | null =
          typeof job.target_project_id === 'string' && job.target_project_id.length > 0
            ? job.target_project_id
            : null;

        if (imagePaths.length === 0) {
          throw new Error('No images to process');
        }

        const modes = normalizeExtractModes(
          processDeps?.scanModesOverride,
          normalizeExtractModes(
            (job as { scan_modes?: unknown }).scan_modes,
            normalizeExtractModes(job.scan_mode),
          ),
        );
        const primaryMode = modes[0] ?? 'all';
        timing.scanMode = modes.join(',');

        const missingProviderKey = getMissingProviderKeyForModes(modes, apiKeys);
        if (missingProviderKey) {
          const providerLabel = missingProviderKey === 'gemini' ? 'Google AI' : 'OpenAI';
          throw new Error(`${providerLabel} APIキーが設定されていません`);
        }

        const { data: preference } = await supabaseAdmin
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
          modes,
          primaryMode,
          imageCount: imagePaths.length,
          saveMode,
          extractionTimeoutMs: EXTRACTION_TIMEOUT_MS,
          extractionTimeoutMinutes: EXTRACTION_TIMEOUT_MINUTES,
        });

      // Process each image in parallel (concurrency limit: 5)
      const PARALLEL_CONCURRENCY = 5;

      async function processOneImage(pageIndex: number): Promise<ScanImageExtractionResult<ProcessedExtractedWord, ExtractionWarningCode>> {
        const result = await processScanImage<ProcessedExtractedWord, ExtractionWarningCode>(
          {
            imagePath: imagePaths[pageIndex],
            pageIndex,
            modes,
            eikenLevel: job.eiken_level,
            apiKeys,
            timeoutMs: EXTRACTION_TIMEOUT_MS,
            timeoutMessage: `画像解析がタイムアウトしました（${EXTRACTION_TIMEOUT_MINUTES}分）`,
          },
          {
            downloadImage: (imagePath) => supabaseAdmin.storage
              .from('scan-images')
              .download(imagePath),
            extractImage,
            parseWords: (rawWords) => applySourceModesFromScanModes(parseExtractedWords(rawWords), modes),
            withTimingPhase: withCloudRunTimingPhase,
            withTimeout,
          },
        );

        if (typeof result.downloadMs === 'number' && typeof result.extractionMs === 'number') {
          timing.perImage.push({
            downloadMs: result.downloadMs,
            extractionMs: result.extractionMs,
          });
          timing.imageDownloadMs += result.downloadMs;
          timing.aiExtractionMs += result.extractionMs;
        }

        return result;
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
            const warningParams = buildScanJobWarningNotificationParams({
              userId: job.user_id,
              jobId,
              projectTitle: job.project_title,
            });
            await sendScanJobNotifications({
              supabaseAdmin,
              notification: warningParams,
              sendPushNotifications,
              sendApnsNotifications,
              logContext: 'warning',
            });
          }

          allExtractedWords.push(...words);
          allSourceLabels = mergeSourceLabels(allSourceLabels, sourceLabels);
        }
      }

      const parseStart = Date.now();
      const dedupedWords = dedupeExtractedWords(allExtractedWords, modes);
      const dedupedSourceLabels = ensureSourceLabels(allSourceLabels);
      timing.parseValidationMs = Date.now() - parseStart;

      if (dedupedWords.length === 0) {
        const errorMessage = buildScanJobNoWordsErrorMessage(firstExtractionError);
        timing.totalMs = Date.now() - processingStartedAt;
        timing.imageCount = imagePaths.length;
        timing.wordCount = 0;
        await supabaseAdmin
          .from('scan_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        const failParams1 = buildScanJobFailedNotificationParams({
          userId: job.user_id,
          jobId,
          projectTitle: job.project_title,
        });
        await sendScanJobNotifications({
          supabaseAdmin,
          notification: failParams1,
          sendPushNotifications,
          sendApnsNotifications,
          logContext: 'no-words failure',
        });

        await flushScanJobTimingLogs({
          flushTiming,
          cloudRunTimingEntries,
          timing,
          jobId,
          userId: job.user_id,
          status: 'failed',
        });

        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }

      const warningSet = new Set<string>([...Array.from(warningCodes), ...pageWarnings]);
      const masterFirstEnabled = isMasterFirstResolutionEnabledForModes(modes);
      const lexiconResolutionStart = Date.now();
      // ジャンル指定ユーザはマスター例文を読み込まず、毎回ジャンル別に生成する。
      const resolvedResult = masterFirstEnabled
        ? await resolveImmediateWords(dedupedWords, undefined, {
            skipMasterExamples: exampleGenres.length > 0,
          })
        : null;
      const rollbackResult = masterFirstEnabled
        ? null
        : await backfillWords(dedupedWords);
      timing.lexiconResolutionMs = Date.now() - lexiconResolutionStart;
      const resolvedWords = applySourceModesFromScanModes(
        resolvedResult?.words ?? rollbackResult?.words ?? dedupedWords,
        modes,
      ).map((word) => normalizeWordForTranslationPersistence(word));
      const aiJapaneseCount = resolvedWords.filter((word) => word.japaneseSource === 'ai').length;

      console.log('[scan-jobs/process] Extraction finished', {
        jobId,
        modes,
        primaryMode,
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
        elapsedMs: Date.now() - processingStartedAt,
      });

      if (saveMode === 'client_local') {
        // --- Synchronous example sentence generation (client_local) ---
        let exampleGenerationSummary: ExampleGenerationSummary | undefined;
        let exampleGenerationErrors: string[] = [];
        let clientLocalResolvedWords = resolvedWords;
        const wordsNeedingExamples = buildClientLocalExampleSeedWords(resolvedWords);

        if (wordsNeedingExamples.length > 0) {
          const exampleGenerationStart = Date.now();
          let exampleGenerationElapsedMs = 0;
          try {
            const exampleResult = await withCloudRunTimingPhase('exampleGeneration', () =>
              generateExamples(wordsNeedingExamples, apiKeys, { genres: exampleGenres })
            );
            exampleGenerationSummary = exampleResult.summary;
            exampleGenerationErrors = exampleResult.errors;
            clientLocalResolvedWords = applyClientLocalGeneratedExamples(
              resolvedWords,
              exampleResult.examples,
            );
          } catch (exampleError) {
            // Example generation failure should NOT fail the scan
            console.error('[scan-jobs/process] Example generation failed (client_local), continuing without:', exampleError);
            exampleGenerationErrors = [exampleError instanceof Error ? exampleError.message : 'Unknown error'];
            exampleGenerationSummary = buildFailedExampleGenerationSummary(
              wordsNeedingExamples.length,
              classifyUnexpectedExampleGenerationFailure(exampleError),
            );
          } finally {
            exampleGenerationElapsedMs = Date.now() - exampleGenerationStart;
            timing.exampleGenerationMs += exampleGenerationElapsedMs;
            if (exampleGenerationSummary) {
              logExampleGenerationOutcome({
                jobId,
                saveMode,
                summary: exampleGenerationSummary,
                errors: exampleGenerationErrors,
                elapsedMs: exampleGenerationElapsedMs,
              });
            }
          }
        }

        const resultPayload = buildClientLocalScanJobResultPayload({
          extractedWords: clientLocalResolvedWords,
          sourceLabels: dedupedSourceLabels,
          lexiconEntries: resolvedResult?.lexiconEntries,
          warnings: warningSet,
          exampleGeneration: exampleGenerationSummary,
        });

        timing.totalMs = Date.now() - processingStartedAt;
        timing.imageCount = imagePaths.length;
        timing.wordCount = dedupedWords.length;

        await supabaseAdmin
          .from('scan_jobs')
          .update({
            status: 'completed',
            project_id: null,
            result: JSON.stringify(resultPayload),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        const completedParams1 = buildScanJobCompletedNotificationParams({
          userId: job.user_id,
          jobId,
          projectId: null,
          projectTitle: job.project_title,
          wordCount: resolvedWords.length,
        });
        await sendScanJobNotifications({
          supabaseAdmin,
          notification: completedParams1,
          sendPushNotifications,
          sendApnsNotifications,
          logContext: 'client-local completion',
        });

        await flushScanJobTimingLogs({
          flushTiming,
          cloudRunTimingEntries,
          timing,
          jobId,
          userId: job.user_id,
          status: 'completed',
        });

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
            supabaseAdmin,
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
          const { error: iconUpdateError } = await supabaseAdmin
            .from('projects')
            .update({ icon_image: job.project_icon_image })
            .eq('id', existingProject.id)
            .eq('user_id', job.user_id);

          if (iconUpdateError) {
            console.error('Project icon update error:', iconUpdateError);
            throw new Error('Failed to update project icon');
          }
        }

        const mergedProjectSourceLabels = buildServerCloudMergedProjectSourceLabels({
          existingSourceLabels: existingProject.source_labels,
          scanSourceLabels: dedupedSourceLabels,
        });
        const { error: sourceLabelUpdateError, usedLegacyColumns: usedLegacyUpdateColumns } = await updateProjectSourceLabelsCompat(
          supabaseAdmin,
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
            supabaseAdmin,
            buildServerCloudProjectInsertPayload({
              userId: job.user_id,
              projectTitle: job.project_title,
              sourceLabels: dedupedSourceLabels,
              projectIconImage: job.project_icon_image,
            }),
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

      const wordsToInsert = buildServerCloudWordsInsertPayload(resolvedWords, projectId);

      const dbInsertStart = Date.now();
      let insertedWords: InsertedServerCloudWord[] | null = null;
      let wordsError: unknown = null;
      let omitJapaneseSource = false;
      let omitSourceModes = false;
      let omitLexiconSenseId = false;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const insertPayload =
          omitJapaneseSource || omitSourceModes || omitLexiconSenseId
            ? stripServerCloudWordsInsertPayloadForCompat(wordsToInsert, {
                omitJapaneseSource,
                omitSourceModes,
                omitLexiconSenseId,
              })
            : wordsToInsert;
        const selectColumns = getServerCloudWordsInsertSelectColumns({
          omitJapaneseSource,
          omitLexiconSenseId,
        });
        const result = await supabaseAdmin
          .from('words')
          .insert(insertPayload)
          .select(selectColumns);

        insertedWords = (result.data ?? null) as InsertedServerCloudWord[] | null;
        wordsError = result.error;
        if (!wordsError) break;

        const missingColumn = getMissingWordsCompatColumn(wordsError);
        if (missingColumn === 'japanese_source' && !omitJapaneseSource) {
          omitJapaneseSource = true;
          console.warn('[scan-jobs/process] words.japanese_source compatibility fallback used', {
            jobId,
            message: result.error?.message,
          });
          continue;
        }
        if (missingColumn === 'source_modes' && !omitSourceModes) {
          omitSourceModes = true;
          console.warn('[scan-jobs/process] words.source_modes compatibility fallback used', {
            jobId,
            message: result.error?.message,
          });
          continue;
        }
        if (missingColumn === 'lexicon_sense_id' && !omitLexiconSenseId) {
          omitLexiconSenseId = true;
          console.warn('[scan-jobs/process] words.lexicon_sense_id compatibility fallback used', {
            jobId,
            message: result.error?.message,
          });
          continue;
        }

        break;
      }
      timing.dbInsertMs = Date.now() - dbInsertStart;

      if (wordsError) {
        console.error('[scan-jobs/process] Words insert error:', wordsError);
        if (shouldRollbackServerCloudProjectAfterWordsInsertFailure({ createdNewProject, wordsInsertError: wordsError })) {
          await supabaseAdmin.from('projects').delete().eq('id', projectId);
        }
        throw new Error('Failed to insert words');
      }

      const insertedWordsArray = insertedWords ?? [];
      const translationRows = buildWordTranslationInsertRows(
        resolvedWords,
        insertedWordsArray.map((word: { id: string }) => word.id),
      );
      if (translationRows.length > 0) {
        const { error: translationError } = await supabaseAdmin
          .from('word_translations')
          .upsert(translationRows, { onConflict: 'word_id,normalized_translation_ja' });

        if (translationError) {
          if (isWordTranslationsSchemaError(translationError)) {
            console.warn('[scan-jobs/process] word_translations compatibility fallback used; continuing without translation rows', {
              jobId,
              message: translationError.message,
            });
          } else {
            console.error('[scan-jobs/process] Word translations insert error:', translationError);
            if (shouldRollbackServerCloudProjectAfterWordsInsertFailure({ createdNewProject, wordsInsertError: translationError })) {
              await supabaseAdmin.from('projects').delete().eq('id', projectId);
            }
            throw new Error('Failed to insert word translations');
          }
        }
      }
      const aiTranslatedWordIds = resolvedWords
        .map((word, index) => (word.japaneseSource === 'ai' ? insertedWordsArray[index]?.id : null))
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

      // --- Synchronous example sentence generation (server_cloud) ---
      const wordsForExampleGen = buildServerCloudExampleSeedWords(insertedWordsArray);

      let exampleGenerationSummary: ExampleGenerationSummary | undefined;
      let exampleGenerationErrors: string[] = [];
      if (wordsForExampleGen.length > 0) {
        const exampleGenerationStart = Date.now();
        let exampleGenerationElapsedMs = 0;
        try {
          const exampleResult = await withCloudRunTimingPhase('exampleGeneration', () =>
            generateExamples(wordsForExampleGen, apiKeys, { genres: exampleGenres })
          );
          exampleGenerationSummary = exampleResult.summary;
          exampleGenerationErrors = exampleResult.errors;

          if (exampleResult.examples.length > 0) {
            // Batch update DB with generated examples
            await Promise.all(
              exampleResult.examples.map((ex) =>
                supabaseAdmin
                  .from('words')
                  .update(buildServerCloudExampleUpdatePayload(ex))
                  .eq('id', ex.wordId)
              )
            );
          }

          // Save examples to lexicon master DB (best-effort, non-blocking).
          // ジャンル指定で個人向けに生成した例文は共有マスターには書き込まない。
          if (exampleResult.examples.length > 0 && exampleGenres.length === 0) {
            const examplesSnapshot = [...exampleResult.examples];
            scheduleAfter(async () => {
              try {
                const generatedWordIds = examplesSnapshot.map(ex => ex.wordId);
                const { data: wordsWithLexicon } = await supabaseAdmin
                  .from('words')
                  .select('id, lexicon_entry_id')
                  .in('id', generatedWordIds)
                  .not('lexicon_entry_id', 'is', null);

                if (wordsWithLexicon && wordsWithLexicon.length > 0) {
                  const lexiconUpdates = wordsWithLexicon
                    .map(w => {
                      const example = examplesSnapshot.find(ex => ex.wordId === w.id);
                      if (!example || !w.lexicon_entry_id) return null;
                      return {
                        lexiconEntryId: w.lexicon_entry_id,
                        exampleSentence: example.exampleSentence,
                        exampleSentenceJa: example.exampleSentenceJa,
                      };
                    })
                    .filter((x): x is NonNullable<typeof x> => x !== null);

                  if (lexiconUpdates.length > 0) {
                    const lexResult = await saveExamplesToLexicon(lexiconUpdates);
                    console.log('[scan-jobs/process] Lexicon master example update:', lexResult);
                  }
                }
              } catch (lexSaveError) {
                console.error('[scan-jobs/process] Lexicon example save failed (non-critical):', lexSaveError);
              }
            });
          }
        } catch (exampleError) {
          // Example generation failure should NOT fail the scan
          console.error('[scan-jobs/process] Example generation failed, continuing without:', exampleError);
          exampleGenerationErrors = [exampleError instanceof Error ? exampleError.message : 'Unknown error'];
          exampleGenerationSummary = buildFailedExampleGenerationSummary(
            wordsForExampleGen.length,
            classifyUnexpectedExampleGenerationFailure(exampleError),
          );
        } finally {
          exampleGenerationElapsedMs = Date.now() - exampleGenerationStart;
          timing.exampleGenerationMs += exampleGenerationElapsedMs;
          if (exampleGenerationSummary) {
            logExampleGenerationOutcome({
              jobId,
              saveMode,
              summary: exampleGenerationSummary,
              errors: exampleGenerationErrors,
              elapsedMs: exampleGenerationElapsedMs,
            });
          }
        }
      }

      // --- Pronunciation backfill (best-effort, non-blocking) ---
      if (insertedWordsArray.length > 0) {
        const pronunciationWordIds = insertedWordsArray.map((w: { id: string }) => w.id);
        scheduleAfter(async () => {
          try {
            const result = await backfillPronunciations(pronunciationWordIds);
            if (result.updated > 0) {
              console.log('[scan-jobs/process] Pronunciation backfill:', result);
            }
          } catch (e) {
            console.error('[scan-jobs/process] Pronunciation backfill failed (non-critical):', e);
          }
        });
      }

      const resultPayload = buildServerCloudScanJobResultPayload({
        wordCount: resolvedWords.length,
        targetProjectId: projectId,
        sourceLabels: dedupedSourceLabels,
        warnings: warningSet,
        exampleGeneration: exampleGenerationSummary,
      });

      if (aiEnabled) {
        const quizPrefillStart = Date.now();
        try {
          const quizSeedWords = buildQuizPrefillSeedWords(insertedWordsArray);

          let quizPrefillSucceeded = 0;
          const quizPrefillFailedWordIds = new Set<string>();

          for (const batch of chunkArray(quizSeedWords, QUIZ_PREFILL_BATCH_SIZE)) {
            const { results, failedWordIds } = await withCloudRunTimingPhase('exampleGeneration', () =>
              generateQuizContentWithRetry(batch, exampleGenres)
            );

            if (results.length > 0) {
              try {
                await Promise.all(
                  results.map((item) => {
                    const updatePayload = buildQuizPrefillWordUpdatePayload(item);
                    return supabaseAdmin
                      .from('words')
                      .update(updatePayload)
                      .eq('id', item.wordId);
                  })
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
        } finally {
          timing.exampleGenerationMs += Date.now() - quizPrefillStart;
        }

        const wordOrderPrefillStart = Date.now();
        try {
          const summary = await withCloudRunTimingPhase('exampleGeneration', () =>
            prefillWordOrderQuizzes(insertedWordsArray, {
              getUpdateClient: () => supabaseAdmin,
            })
          );
          if (summary.requested > 0) {
            console.log('[scan-jobs/process] Word-order quiz prefill finished:', {
              jobId,
              ...summary,
            });
          }
        } catch (error) {
          console.error('[scan-jobs/process] Word-order quiz prefill failed (non-critical):', {
            jobId,
            error,
          });
        } finally {
          timing.exampleGenerationMs += Date.now() - wordOrderPrefillStart;
        }
      }

      timing.totalMs = Date.now() - processingStartedAt;
      timing.imageCount = imagePaths.length;
      timing.wordCount = dedupedWords.length;

      await supabaseAdmin
        .from('scan_jobs')
        .update({
          status: 'completed',
          project_id: projectId,
          result: JSON.stringify(resultPayload),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      const completedParams2 = buildScanJobCompletedNotificationParams({
        userId: job.user_id,
        jobId,
        projectId,
        projectTitle: projectTitleForNotification,
        wordCount: resolvedWords.length,
      });
      await sendScanJobNotifications({
        supabaseAdmin,
        notification: completedParams2,
        sendPushNotifications,
        sendApnsNotifications,
        logContext: 'server-cloud completion',
      });

      await flushScanJobTimingLogs({
        flushTiming,
        cloudRunTimingEntries,
        timing,
        jobId,
        userId: job.user_id,
        status: 'completed',
      });

      // Heavy/non-critical tasks run after completion update.
      scheduleAfter(async () => {
        const pendingWordIds = buildPostScanLexiconResolutionWordIds(
          insertedWordsArray,
          aiTranslatedWordIds,
        );

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
              const vercelUrl = process.env.VERCEL_URL;
              const baseUrl = vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000';
              await Promise.all(
                wordResolutionJobIds.map((resolutionJobId) =>
                  triggerWordLexiconResolutionProcessing(baseUrl, resolutionJobId),
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
          const quizSeedWords = buildPostScanQuizPrefillSeedWords(insertedWordsArray);

          if (quizSeedWords.length > 0) {
            let quizPrefillSucceeded = 0;
            const quizPrefillFailedWordIds = new Set<string>();

            for (const batch of chunkArray(quizSeedWords, QUIZ_PREFILL_BATCH_SIZE)) {
              const { results, failedWordIds } = await generateQuizContentWithRetry(batch);

              if (results.length > 0) {
                try {
                  await Promise.all(
                    results.map((item) => {
                      const updatePayload = buildQuizPrefillWordUpdatePayload(item);
                      return supabaseAdmin
                        .from('words')
                        .update(updatePayload)
                        .eq('id', item.wordId);
                    })
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

        timing.totalMs = Date.now() - processingStartedAt;

        await supabaseAdmin
          .from('scan_jobs')
          .update({
            status: 'failed',
            error_message: processingError instanceof Error ? processingError.message : 'Processing failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        const failParams2 = buildScanJobFailedNotificationParams({
          userId: job.user_id,
          jobId,
          projectTitle: job.project_title,
        });
        await sendScanJobNotifications({
          supabaseAdmin,
          notification: failParams2,
          sendPushNotifications,
          sendApnsNotifications,
          logContext: 'processing failure',
        });

        await flushScanJobTimingLogs({
          flushTiming,
          cloudRunTimingEntries,
          timing,
          jobId,
          userId: job.user_id,
          status: 'failed',
        });

        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
      }
    });

  } catch (error) {
    console.error('Process route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = authorizeInternalWorkerRequest(request);
    if (!authResult.ok) {
      console.warn('[scan-jobs/process] Unauthorized trigger request', {
        reason: authResult.reason,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, processSchema, {
      invalidMessage: 'Missing jobId',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    return await processJobById(parsed.data.jobId);
  } catch (error) {
    console.error('Process route POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
