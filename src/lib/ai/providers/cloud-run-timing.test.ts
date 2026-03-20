import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordCloudRunTiming,
  runWithCloudRunTimingCollector,
  summarizeCloudRunTimingEntries,
  withCloudRunTimingPhase,
  type CloudRunTimingEntry,
} from './cloud-run-timing';

test('runWithCloudRunTimingCollector records entries under the current phase', async () => {
  const entries: CloudRunTimingEntry[] = [];

  await runWithCloudRunTimingCollector(entries, async () => {
    await withCloudRunTimingPhase('aiExtraction', async () => {
      recordCloudRunTiming({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        elapsedMs: 1200,
        startedAt: '2026-03-20T10:00:00.000Z',
        endedAt: '2026-03-20T10:00:01.200Z',
      });
    });

    await withCloudRunTimingPhase('exampleGeneration', async () => {
      recordCloudRunTiming({
        provider: 'openai',
        model: 'gpt-5-mini',
        elapsedMs: 800,
        startedAt: '2026-03-20T10:00:02.000Z',
        endedAt: '2026-03-20T10:00:02.800Z',
      });
    });
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.phase, 'aiExtraction');
  assert.equal(entries[1]?.phase, 'exampleGeneration');
});

test('summarizeCloudRunTimingEntries merges overlapping request windows for totalMs and sums by phase', () => {
  const summary = summarizeCloudRunTimingEntries([
    {
      phase: 'aiExtraction',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      elapsedMs: 1500,
      startedAt: '2026-03-20T10:00:00.000Z',
      endedAt: '2026-03-20T10:00:01.500Z',
    },
    {
      phase: 'aiExtraction',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      elapsedMs: 1800,
      startedAt: '2026-03-20T10:00:00.500Z',
      endedAt: '2026-03-20T10:00:02.300Z',
    },
    {
      phase: 'exampleGeneration',
      provider: 'openai',
      model: 'gpt-5-mini',
      elapsedMs: 700,
      startedAt: '2026-03-20T10:00:03.000Z',
      endedAt: '2026-03-20T10:00:03.700Z',
    },
  ]);

  assert.equal(summary.requestCount, 3);
  assert.equal(summary.totalMs, 3000);
  assert.equal(summary.aiExtractionMs, 3300);
  assert.equal(summary.exampleGenerationMs, 700);
  assert.equal(summary.startedAt, '2026-03-20T10:00:00.000Z');
  assert.equal(summary.endedAt, '2026-03-20T10:00:03.700Z');
  assert.equal(summary.model, 'gemini:gemini-2.5-flash | openai:gpt-5-mini');
});
