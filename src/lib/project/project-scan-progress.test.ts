import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activateProjectMultipleScanFileStep,
  buildProjectMultipleScanInitialSteps,
  buildProjectSingleScanAnalyzeSteps,
  buildProjectSingleScanInitialSteps,
  completeProjectMultipleScanFileStep,
  markActiveOrPendingProjectScanStepsError,
  markProjectMultipleScanFileApiError,
  markProjectMultipleScanFileProcessingError,
  type ProjectScanProgressStep,
} from './project-scan-progress';

const multipleSteps: ProjectScanProgressStep[] = [
  { id: 'file-0', label: '画像 1/3 を処理中...', status: 'active' },
  { id: 'file-1', label: '画像 2/3 を処理中...', status: 'pending' },
  { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
];

test('buildProjectSingleScanInitialSteps keeps upload and analyze step ids and labels', () => {
  assert.deepEqual(buildProjectSingleScanInitialSteps(), [
    { id: 'upload', label: '画像をアップロード中...', status: 'active' },
    { id: 'analyze', label: '文字を解析中...', status: 'pending' },
  ]);
});

test('buildProjectSingleScanAnalyzeSteps marks upload complete and analyze active', () => {
  assert.deepEqual(buildProjectSingleScanAnalyzeSteps(), [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '文字を解析中...', status: 'active' },
  ]);
});

test('buildProjectMultipleScanInitialSteps creates file-indexed pending steps', () => {
  assert.deepEqual(buildProjectMultipleScanInitialSteps(3), multipleSteps);
});

test('activateProjectMultipleScanFileStep activates the current file with the existing processing label', () => {
  const steps: ProjectScanProgressStep[] = [
    { id: 'file-0', label: '画像 1: 処理エラー', status: 'error' },
    { id: 'file-1', label: 'stale label', status: 'pending' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ];

  assert.deepEqual(activateProjectMultipleScanFileStep(steps, 1, 3), [
    { id: 'file-0', label: '画像 1: 処理エラー', status: 'complete' },
    { id: 'file-1', label: '画像 2/3 を処理中...', status: 'active' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ]);
});

test('markProjectMultipleScanFileProcessingError keeps the existing processing error label', () => {
  assert.deepEqual(markProjectMultipleScanFileProcessingError(multipleSteps, 1), [
    { id: 'file-0', label: '画像 1/3 を処理中...', status: 'active' },
    { id: 'file-1', label: '画像 2: 処理エラー', status: 'error' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ]);
});

test('markProjectMultipleScanFileApiError keeps the existing API error label', () => {
  assert.deepEqual(markProjectMultipleScanFileApiError(multipleSteps, 1), [
    { id: 'file-0', label: '画像 1/3 を処理中...', status: 'active' },
    { id: 'file-1', label: '画像 2: エラー', status: 'error' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ]);
});

test('completeProjectMultipleScanFileStep keeps the existing completion label', () => {
  assert.deepEqual(completeProjectMultipleScanFileStep(multipleSteps, 1, 3), [
    { id: 'file-0', label: '画像 1/3 を処理中...', status: 'active' },
    { id: 'file-1', label: '画像 2/3 完了', status: 'complete' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
  ]);
});

test('markActiveOrPendingProjectScanStepsError changes only active and pending steps to error', () => {
  const steps: ProjectScanProgressStep[] = [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '文字を解析中...', status: 'active' },
    { id: 'file-2', label: '画像 3/3 を処理中...', status: 'pending' },
    { id: 'file-3', label: '既存エラー', status: 'error' },
  ];

  assert.deepEqual(markActiveOrPendingProjectScanStepsError(steps, '予期しないエラー'), [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '予期しないエラー', status: 'error' },
    { id: 'file-2', label: '予期しないエラー', status: 'error' },
    { id: 'file-3', label: '既存エラー', status: 'error' },
  ]);
});
