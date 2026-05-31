import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseHomeImmediateScanExtractResponse,
  readHomeImmediateScanExtractResponse,
  type HomeImmediateScanResponseLike,
} from './home-immediate-scan-response';

test('parseHomeImmediateScanExtractResponse returns accumulator input for a successful extract response', () => {
  const response = parseHomeImmediateScanExtractResponse({
    responseOk: true,
    imageIndex: 0,
    body: {
      success: true,
      words: [{ english: 'accurate', japanese: '正確な' }],
      sourceLabels: ['Target 1900'],
      lexiconEntries: [{ id: 'lexicon-1', headword: 'accurate' }],
    },
  });

  assert.deepEqual(response, {
    ok: true,
    result: {
      words: [{ english: 'accurate', japanese: '正確な' }],
      sourceLabels: ['Target 1900'],
      lexiconEntries: [{ id: 'lexicon-1', headword: 'accurate' }],
    },
  });
});

test('parseHomeImmediateScanExtractResponse uses API error when the HTTP response failed', () => {
  const response = parseHomeImmediateScanExtractResponse({
    responseOk: false,
    imageIndex: 1,
    body: {
      success: false,
      error: '本日のスキャン上限に達しました。',
    },
  });

  assert.deepEqual(response, {
    ok: false,
    error: '本日のスキャン上限に達しました。',
  });
});

test('parseHomeImmediateScanExtractResponse falls back to the existing per-image error message', () => {
  const response = parseHomeImmediateScanExtractResponse({
    responseOk: true,
    imageIndex: 2,
    body: { success: false },
  });

  assert.deepEqual(response, {
    ok: false,
    error: '画像 3 の抽出に失敗しました',
  });
});

test('readHomeImmediateScanExtractResponse treats invalid JSON as an empty failed body', async () => {
  const response: HomeImmediateScanResponseLike = {
    ok: false,
    json: async () => {
      throw new Error('invalid json');
    },
  };

  assert.deepEqual(await readHomeImmediateScanExtractResponse(response, { imageIndex: 0 }), {
    ok: false,
    error: '画像 1 の抽出に失敗しました',
  });
});
