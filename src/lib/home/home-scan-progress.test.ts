import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activateMultipleScanFileStep,
  appendMultipleScanNavigateStep,
  buildMultipleScanInitialSteps,
  buildSingleScanAnalyzeSteps,
  buildSingleScanCompleteSteps,
  buildSingleScanInitialSteps,
  completeMultipleScanFileStep,
  markActiveOrPendingScanStepsError,
  markMultipleScanFileApiError,
  markMultipleScanFileProcessingError,
  type HomeScanProgressStep,
} from './home-scan-progress';

const multipleSteps: HomeScanProgressStep[] = [
  { id: 'file-0', label: '画像 1/3 を処理中...', status: 'active' },
  { id: 'file-1', label: '画像 2/3 を処理中...', status: 'pending' },
  { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
];

test('buildSingleScanInitialSteps keeps the existing upload and analyze step labels', () => {
  assert.deepEqual(buildSingleScanInitialSteps(), [
    { id: 'upload', label: '画像をアップロード中...', status: 'active' },
    { id: 'analyze', label: '文字を解析中...', status: 'pending' },
  ]);
});

test('buildSingleScanAnalyzeSteps marks upload complete and analyze active', () => {
  assert.deepEqual(buildSingleScanAnalyzeSteps(), [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '文字を解析中...', status: 'active' },
  ]);
});

test('buildSingleScanCompleteSteps marks both single scan steps complete', () => {
  assert.deepEqual(buildSingleScanCompleteSteps(), [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '文字を解析中...', status: 'complete' },
  ]);
});

test('buildMultipleScanInitialSteps creates one step per file with existing ids and labels', () => {
  assert.deepEqual(buildMultipleScanInitialSteps(3), multipleSteps);
});

test('activateMultipleScanFileStep activates the current file and preserves previous labels', () => {
  const steps: HomeScanProgressStep[] = [
    { id: 'file-0', label: '画像 1: 処理エラー', status: 'error' },
    { id: 'file-1', label: 'stale label', status: 'pending' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ];

  assert.deepEqual(activateMultipleScanFileStep(steps, 1, 3), [
    { id: 'file-0', label: '画像 1: 処理エラー', status: 'complete' },
    { id: 'file-1', label: '画像 2/3 を処理中...', status: 'active' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ]);
});

test('markMultipleScanFileProcessingError keeps the existing processing error label', () => {
  assert.deepEqual(markMultipleScanFileProcessingError(multipleSteps, 1), [
    { id: 'file-0', label: '画像 1/3 を処理中...', status: 'active' },
    { id: 'file-1', label: '画像 2: 処理エラー', status: 'error' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ]);
});

test('markMultipleScanFileApiError keeps the existing API error label', () => {
  assert.deepEqual(markMultipleScanFileApiError(multipleSteps, 1), [
    { id: 'file-0', label: '画像 1/3 を処理中...', status: 'active' },
    { id: 'file-1', label: '画像 2: エラー', status: 'error' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ]);
});

test('completeMultipleScanFileStep keeps the existing completion label', () => {
  assert.deepEqual(completeMultipleScanFileStep(multipleSteps, 1, 3), [
    { id: 'file-0', label: '画像 1/3 を処理中...', status: 'active' },
    { id: 'file-1', label: '画像 2/3 完了', status: 'complete' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ]);
});

test('appendMultipleScanNavigateStep completes existing steps and appends navigate active', () => {
  const steps: HomeScanProgressStep[] = [
    { id: 'file-0', label: '画像 1/2 完了', status: 'complete' },
    { id: 'file-1', label: '画像 2: エラー', status: 'error' },
  ];

  assert.deepEqual(appendMultipleScanNavigateStep(steps), [
    { id: 'file-0', label: '画像 1/2 完了', status: 'complete' },
    { id: 'file-1', label: '画像 2: エラー', status: 'complete' },
    { id: 'navigate', label: '結果を表示中...', status: 'active' },
  ]);
});

test('markActiveOrPendingScanStepsError changes only active and pending steps to error', () => {
  const steps: HomeScanProgressStep[] = [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '文字を解析中...', status: 'active' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
    { id: 'file-3', label: '既存エラー', status: 'error' },
  ];

  assert.deepEqual(markActiveOrPendingScanStepsError(steps, '予期しないエラー'), [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '予期しないエラー', status: 'error' },
    { id: 'file-2', label: '予期しないエラー', status: 'error' },
    { id: 'file-3', label: '既存エラー', status: 'error' },
  ]);
});
