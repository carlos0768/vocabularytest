import test from 'node:test';
import assert from 'node:assert/strict';

import type { CloudRunTimingEntry } from '@/lib/ai/providers/cloud-run-timing';
import {
  buildScanJobCompletedNotificationParams,
  buildScanJobFailedNotificationParams,
  buildScanJobWarningNotificationParams,
  flushScanJobTimingLogs,
} from '@/lib/scan/job-side-effects';

const commonParams = {
  userId: 'user-123',
  jobId: 'job-456',
  projectTitle: 'Scan Result',
};

test('buildScanJobWarningNotificationParams fixes grammar warning notification params', () => {
  assert.deepEqual(
    buildScanJobWarningNotificationParams(commonParams),
    {
      userId: 'user-123',
      jobId: 'job-456',
      projectId: null,
      projectTitle: 'Scan Result',
      status: 'warning',
    },
  );
});

test('buildScanJobFailedNotificationParams fixes failed scan notification params', () => {
  assert.deepEqual(
    buildScanJobFailedNotificationParams(commonParams),
    {
      userId: 'user-123',
      jobId: 'job-456',
      projectId: null,
      projectTitle: 'Scan Result',
      status: 'failed',
      wordCount: 0,
    },
  );
});

test('buildScanJobFailedNotificationParams carries the failure reason into the notification', () => {
  const params = buildScanJobFailedNotificationParams({
    ...commonParams,
    errorMessage: ' 画像から単語を読み取れませんでした。 ',
  });

  assert.equal(params.errorMessage, '画像から単語を読み取れませんでした。');
});

test('buildScanJobFailedNotificationParams omits errorMessage when the reason is blank', () => {
  const params = buildScanJobFailedNotificationParams({
    ...commonParams,
    errorMessage: '   ',
  });

  assert.equal('errorMessage' in params, false);
});

test('buildScanJobCompletedNotificationParams fixes completed scan notification params', () => {
  assert.deepEqual(
    buildScanJobCompletedNotificationParams({
      ...commonParams,
      projectId: 'project-789',
      wordCount: 12,
    }),
    {
      userId: 'user-123',
      jobId: 'job-456',
      projectId: 'project-789',
      projectTitle: 'Scan Result',
      status: 'completed',
      wordCount: 12,
    },
  );
});

test('buildScanJobCompletedNotificationParams preserves null projectId for client_local scans', () => {
  const params = buildScanJobCompletedNotificationParams({
    ...commonParams,
    projectId: null,
    wordCount: 3,
  });

  assert.equal(params.projectId, null);
  assert.equal(params.wordCount, 3);
  assert.equal(params.status, 'completed');
});

test('flushScanJobTimingLogs forwards the existing timing payload unchanged', async () => {
  const timing = {
    totalMs: 100,
    imageCount: 1,
    wordCount: 2,
    scanMode: 'all',
  };
  const entries = [
    {
      phase: 'aiExtraction',
      startedAt: '2026-05-08T00:00:00.000Z',
      endedAt: '2026-05-08T00:00:01.000Z',
      durationMs: 1000,
      model: 'gemini-test',
    },
  ] as unknown as CloudRunTimingEntry[];
  const calls: unknown[][] = [];

  await flushScanJobTimingLogs({
    flushTiming: async (...args) => {
      calls.push(args);
    },
    cloudRunTimingEntries: entries,
    timing,
    jobId: 'job-456',
    userId: 'user-123',
    status: 'completed',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], entries);
  assert.equal(calls[0]?.[1], timing);
  assert.equal(calls[0]?.[2], 'job-456');
  assert.equal(calls[0]?.[3], 'user-123');
  assert.equal(calls[0]?.[4], 'completed');
});
