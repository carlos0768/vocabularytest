import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_SCAN_COMPLETION_WINDOW_MS,
  parseResultWordCount,
  SCAN_JOB_FAILED_FALLBACK_MESSAGE,
  selectHomeScanCompletionNotices,
  selectHomeScanFailureNotices,
  type HomeScanCompletionJob,
} from './home-scan-completion';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');

function job(id: string, overrides: Partial<HomeScanCompletionJob> = {}): HomeScanCompletionJob {
  return {
    id,
    status: 'completed',
    project_id: 'project-1',
    project_title: 'ターゲット1900',
    result: JSON.stringify({ wordCount: 12 }),
    updated_at: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

test('recently completed job becomes a notice with word count and project', () => {
  assert.deepEqual(
    selectHomeScanCompletionNotices([job('job-1')], { now: NOW, dismissedIds: new Set() }),
    [{ id: 'job-1', projectId: 'project-1', projectTitle: 'ターゲット1900', wordCount: 12 }],
  );
});

test('pending, processing and failed jobs are not completion notices', () => {
  const jobs = [
    job('a', { status: 'pending' }),
    job('b', { status: 'processing' }),
    job('c', { status: 'failed' }),
  ];
  assert.deepEqual(selectHomeScanCompletionNotices(jobs, { now: NOW, dismissedIds: new Set() }), []);
});

test('dismissed jobs are skipped', () => {
  assert.deepEqual(
    selectHomeScanCompletionNotices([job('job-1')], { now: NOW, dismissedIds: new Set(['job-1']) }),
    [],
  );
});

test('jobs completed before the window are skipped', () => {
  const old = job('job-1', {
    updated_at: new Date(NOW - HOME_SCAN_COMPLETION_WINDOW_MS - 1).toISOString(),
  });
  assert.deepEqual(selectHomeScanCompletionNotices([old], { now: NOW, dismissedIds: new Set() }), []);
});

test('jobs without a project to open are skipped', () => {
  assert.deepEqual(
    selectHomeScanCompletionNotices([job('job-1', { project_id: null })], { now: NOW, dismissedIds: new Set() }),
    [],
  );
});

test('unreadable result keeps the notice but with unknown word count', () => {
  const [notice] = selectHomeScanCompletionNotices([job('job-1', { result: 'not json' })], {
    now: NOW,
    dismissedIds: new Set(),
  });
  assert.equal(notice.wordCount, null);
});

test('parseResultWordCount reads only non-negative numbers', () => {
  assert.equal(parseResultWordCount(JSON.stringify({ wordCount: 0 })), 0);
  assert.equal(parseResultWordCount(JSON.stringify({ wordCount: '3' })), null);
  assert.equal(parseResultWordCount(JSON.stringify({ wordCount: -1 })), null);
  assert.equal(parseResultWordCount(null), null);
});

test('recently failed job becomes a failure notice with its reason', () => {
  const failed = job('job-1', {
    status: 'failed',
    project_id: null,
    target_project_id: 'project-9',
    error_message: '  画像が暗すぎます  ',
  });
  assert.deepEqual(selectHomeScanFailureNotices([failed], { now: NOW, dismissedIds: new Set() }), [
    { id: 'job-1', projectTitle: 'ターゲット1900', targetProjectId: 'project-9', message: '画像が暗すぎます' },
  ]);
});

test('failure without a reason falls back to the default message', () => {
  const [notice] = selectHomeScanFailureNotices(
    [job('job-1', { status: 'failed', error_message: null, target_project_id: null })],
    { now: NOW, dismissedIds: new Set() },
  );
  assert.equal(notice.message, SCAN_JOB_FAILED_FALLBACK_MESSAGE);
  assert.equal(notice.targetProjectId, null);
});

test('failure notices skip completed, dismissed and old jobs', () => {
  const jobs = [
    job('done'),
    job('dismissed', { status: 'failed' }),
    job('old', {
      status: 'failed',
      updated_at: new Date(NOW - HOME_SCAN_COMPLETION_WINDOW_MS - 1).toISOString(),
    }),
  ];
  assert.deepEqual(
    selectHomeScanFailureNotices(jobs, { now: NOW, dismissedIds: new Set(['dismissed']) }),
    [],
  );
});
