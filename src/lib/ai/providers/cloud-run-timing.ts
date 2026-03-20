import { AsyncLocalStorage } from 'node:async_hooks';

export type CloudRunTimingPhase = 'aiExtraction' | 'exampleGeneration' | 'other';

export interface CloudRunTimingEntry {
  phase: CloudRunTimingPhase;
  provider: string;
  model: string;
  elapsedMs: number;
  startedAt: string;
  endedAt: string;
}

export interface CloudRunTimingSummary {
  requestCount: number;
  totalMs: number;
  aiExtractionMs: number;
  exampleGenerationMs: number;
  startedAt?: string;
  endedAt?: string;
  model: string;
}

const collectorStorage = new AsyncLocalStorage<CloudRunTimingEntry[]>();
const phaseStorage = new AsyncLocalStorage<CloudRunTimingPhase>();

export function runWithCloudRunTimingCollector<T>(
  entries: CloudRunTimingEntry[],
  fn: () => Promise<T>
): Promise<T> {
  return collectorStorage.run(entries, fn);
}

export function withCloudRunTimingPhase<T>(
  phase: CloudRunTimingPhase,
  fn: () => Promise<T>
): Promise<T> {
  if (!collectorStorage.getStore()) {
    return fn();
  }
  return phaseStorage.run(phase, fn);
}

export function recordCloudRunTiming(
  entry: Omit<CloudRunTimingEntry, 'phase'> & { phase?: CloudRunTimingPhase }
): void {
  const entries = collectorStorage.getStore();
  if (!entries) return;

  entries.push({
    ...entry,
    phase: entry.phase ?? phaseStorage.getStore() ?? 'other',
  });
}

export function summarizeCloudRunTimingEntries(entries: CloudRunTimingEntry[]): CloudRunTimingSummary {
  if (entries.length === 0) {
    return {
      requestCount: 0,
      totalMs: 0,
      aiExtractionMs: 0,
      exampleGenerationMs: 0,
      model: '',
    };
  }

  let aiExtractionMs = 0;
  let exampleGenerationMs = 0;
  let earliestStartedAt: number | null = null;
  let latestEndedAt: number | null = null;
  let fallbackTotalMs = 0;
  const models = new Set<string>();
  const intervals: Array<{ start: number; end: number }> = [];

  for (const entry of entries) {
    fallbackTotalMs += entry.elapsedMs;
    if (entry.phase === 'aiExtraction') {
      aiExtractionMs += entry.elapsedMs;
    } else if (entry.phase === 'exampleGeneration') {
      exampleGenerationMs += entry.elapsedMs;
    }

    const startedAt = Date.parse(entry.startedAt);
    const endedAt = Date.parse(entry.endedAt);
    if (Number.isFinite(startedAt)) {
      earliestStartedAt = earliestStartedAt === null ? startedAt : Math.min(earliestStartedAt, startedAt);
    }
    if (Number.isFinite(endedAt)) {
      latestEndedAt = latestEndedAt === null ? endedAt : Math.max(latestEndedAt, endedAt);
    }
    if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt) {
      intervals.push({ start: startedAt, end: endedAt });
    }

    const modelLabel = entry.provider ? `${entry.provider}:${entry.model}` : entry.model;
    if (modelLabel) {
      models.add(modelLabel);
    }
  }

  const startedAtIso = earliestStartedAt === null ? undefined : new Date(earliestStartedAt).toISOString();
  const endedAtIso = latestEndedAt === null ? undefined : new Date(latestEndedAt).toISOString();
  intervals.sort((a, b) => a.start - b.start);
  let mergedTotalMs = 0;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  for (const interval of intervals) {
    if (currentStart === null || currentEnd === null) {
      currentStart = interval.start;
      currentEnd = interval.end;
      continue;
    }

    if (interval.start > currentEnd) {
      mergedTotalMs += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
      continue;
    }

    currentEnd = Math.max(currentEnd, interval.end);
  }

  if (currentStart !== null && currentEnd !== null) {
    mergedTotalMs += currentEnd - currentStart;
  }

  const totalMs =
    mergedTotalMs > 0
      ? mergedTotalMs
      : fallbackTotalMs;

  return {
    requestCount: entries.length,
    totalMs,
    aiExtractionMs,
    exampleGenerationMs,
    startedAt: startedAtIso,
    endedAt: endedAtIso,
    model: Array.from(models).join(' | '),
  };
}
