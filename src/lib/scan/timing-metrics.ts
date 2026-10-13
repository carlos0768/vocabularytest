// スキャンジョブの段階別所要時間の計測と、スプレッドシートへの記録。
import { AI_CONFIG } from '@/lib/ai/config';
import {
  summarizeCloudRunTimingEntries,
  type CloudRunTimingEntry,
} from '@/lib/ai/providers/cloud-run-timing';

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

export function createTimingMetrics(): TimingMetrics {
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

export async function flushTimingLogs(
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
