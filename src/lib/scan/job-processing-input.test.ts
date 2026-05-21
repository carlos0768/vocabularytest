import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScanJobNoWordsErrorMessage,
  buildScanJobProcessingInput,
} from './job-processing-input';

test('buildScanJobProcessingInput keeps multiple image paths and client_local save mode', () => {
  assert.deepEqual(buildScanJobProcessingInput({
    image_paths: ['user-1/one.jpg', 'user-1/two.jpg'],
    image_path: 'user-1/legacy.jpg',
    save_mode: 'client_local',
  }), {
    imagePaths: ['user-1/one.jpg', 'user-1/two.jpg'],
    saveMode: 'client_local',
  });
});

test('buildScanJobProcessingInput falls back to legacy single image path and server_cloud mode', () => {
  assert.deepEqual(buildScanJobProcessingInput({
    image_path: 'user-1/legacy.jpg',
    save_mode: 'unknown',
  }), {
    imagePaths: ['user-1/legacy.jpg'],
    saveMode: 'server_cloud',
  });
});

test('buildScanJobProcessingInput returns no image paths when neither field is set', () => {
  assert.deepEqual(buildScanJobProcessingInput({}), {
    imagePaths: [],
    saveMode: 'server_cloud',
  });
});

test('buildScanJobNoWordsErrorMessage prefers the first extraction error', () => {
  assert.equal(
    buildScanJobNoWordsErrorMessage('画像解析に失敗しました'),
    '画像解析に失敗しました',
  );
  assert.equal(
    buildScanJobNoWordsErrorMessage(null),
    'No words found in any image',
  );
});
