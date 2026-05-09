import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHomeScanJobLocalNotifications,
  type HomeScanJobNotificationJob,
} from './home-scan-job-notifications';

function job(
  id: string,
  overrides: Partial<HomeScanJobNotificationJob> = {},
): HomeScanJobNotificationJob {
  return {
    id,
    project_id: 'project-1',
    project_title: 'MERKEN',
    status: 'completed',
    result: JSON.stringify({ wordCount: 3 }),
    ...overrides,
  };
}

test('completed job builds scan completed notification content', () => {
  assert.deepEqual(buildHomeScanJobLocalNotifications([job('job-1')]), [
    {
      title: 'MERKEN: スキャン完了',
      body: '「MERKEN」に3語追加されました',
      tag: 'scan-job-project-1',
    },
  ]);
});

test('failed job builds scan failed notification content', () => {
  assert.deepEqual(buildHomeScanJobLocalNotifications([
    job('job-1', { status: 'failed' }),
  ]), [
    {
      title: 'MERKEN: スキャン失敗',
      body: '「MERKEN」のスキャンに失敗しました',
      tag: 'scan-job-project-1',
    },
  ]);
});

test('grammar_not_found warning builds grammar fallback notification content', () => {
  assert.deepEqual(buildHomeScanJobLocalNotifications([
    job('job-1', {
      result: JSON.stringify({
        wordCount: 4,
        warnings: ['grammar_not_found'],
      }),
    }),
  ]), [
    {
      title: 'MERKEN: 文法抽出なし',
      body: '「MERKEN」で文法抽出が見つからなかったため、通常抽出に切り替えました',
      tag: 'scan-job-project-1',
    },
  ]);
});

test('failed notification takes priority when a grouped project includes a failed job', () => {
  assert.deepEqual(buildHomeScanJobLocalNotifications([
    job('job-1', {
      result: JSON.stringify({
        wordCount: 4,
        warnings: ['grammar_not_found'],
      }),
    }),
    job('job-2', {
      status: 'failed',
      result: JSON.stringify({ wordCount: 8 }),
    }),
  ]), [
    {
      title: 'MERKEN: スキャン失敗',
      body: '「MERKEN」のスキャンに失敗しました',
      tag: 'scan-job-project-1',
    },
  ]);
});

test('wordCount is summed for jobs with the same project key', () => {
  assert.deepEqual(buildHomeScanJobLocalNotifications([
    job('job-1', { result: JSON.stringify({ wordCount: 2 }) }),
    job('job-2', { result: JSON.stringify({ wordCount: 5 }) }),
  ]), [
    {
      title: 'MERKEN: スキャン完了',
      body: '「MERKEN」に7語追加されました',
      tag: 'scan-job-project-1',
    },
  ]);
});

test('invalid JSON is treated as wordCount 0 and no warning', () => {
  assert.deepEqual(buildHomeScanJobLocalNotifications([
    job('job-1', { result: '{invalid' }),
  ]), [
    {
      title: 'MERKEN: スキャン完了',
      body: '「MERKEN」に0語追加されました',
      tag: 'scan-job-project-1',
    },
  ]);
});

test('missing project title falls back to wordbook label', () => {
  assert.deepEqual(buildHomeScanJobLocalNotifications([
    job('job-1', {
      project_id: 'project-without-title',
      project_title: '',
    }),
  ]), [
    {
      title: 'MERKEN: スキャン完了',
      body: '「単語帳」に3語追加されました',
      tag: 'scan-job-project-without-title',
    },
  ]);
});

test('tag uses scan-job prefix with the grouping key', () => {
  assert.deepEqual(buildHomeScanJobLocalNotifications([
    job('job-1', {
      project_id: null,
      project_title: 'Fallback Key',
    }),
  ]), [
    {
      title: 'MERKEN: スキャン完了',
      body: '「Fallback Key」に3語追加されました',
      tag: 'scan-job-Fallback Key',
    },
  ]);
});
