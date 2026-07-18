import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_UNEXPECTED_ERROR_MESSAGE,
  toUserFacingScanErrorMessage,
} from '@/lib/scan/scan-error-message';

test('toUserFacingScanErrorMessage passes through Japanese user-facing messages', () => {
  assert.equal(
    toUserFacingScanErrorMessage(new Error('画像から単語を読み取れませんでした。もう一度撮影してください。')),
    '画像から単語を読み取れませんでした。もう一度撮影してください。',
  );
  assert.equal(
    toUserFacingScanErrorMessage('Google AI APIキーが設定されていません'),
    'Google AI APIキーが設定されていません',
  );
  assert.equal(
    toUserFacingScanErrorMessage(new Error('画像解析がタイムアウトしました（5分）')),
    '画像解析がタイムアウトしました（5分）',
  );
});

test('toUserFacingScanErrorMessage maps known internal errors to reason-explicit Japanese', () => {
  assert.match(
    toUserFacingScanErrorMessage(new Error('Request timed out after 270000ms')),
    /時間がかかりすぎて中断しました/,
  );
  assert.match(
    toUserFacingScanErrorMessage(new Error('429 Too Many Requests')),
    /混み合っています/,
  );
  assert.match(
    toUserFacingScanErrorMessage(new Error('fetch failed')),
    /通信エラー/,
  );
  assert.match(
    toUserFacingScanErrorMessage(new Error('Invalid API key provided')),
    /サーバーの設定に問題/,
  );
  assert.match(
    toUserFacingScanErrorMessage(new Error('No images to process')),
    /画像を受け取れませんでした/,
  );
  assert.match(
    toUserFacingScanErrorMessage(new Error('StorageApiError: Object not found')),
    /画像の読み込みに失敗しました/,
  );
  assert.match(
    toUserFacingScanErrorMessage(new Error('Failed to insert words')),
    /単語帳の保存に失敗しました/,
  );
  assert.match(
    toUserFacingScanErrorMessage(new Error('Failed to create project')),
    /単語帳の保存に失敗しました/,
  );
});

test('toUserFacingScanErrorMessage hides unknown internal messages behind the fallback', () => {
  assert.equal(
    toUserFacingScanErrorMessage(new Error('duplicate key value violates unique constraint "words_pkey"')),
    SCAN_UNEXPECTED_ERROR_MESSAGE,
  );
  assert.equal(toUserFacingScanErrorMessage('Processing failed'), SCAN_UNEXPECTED_ERROR_MESSAGE);
  assert.equal(toUserFacingScanErrorMessage(null), SCAN_UNEXPECTED_ERROR_MESSAGE);
  assert.equal(toUserFacingScanErrorMessage(undefined), SCAN_UNEXPECTED_ERROR_MESSAGE);
  assert.equal(toUserFacingScanErrorMessage({}), SCAN_UNEXPECTED_ERROR_MESSAGE);
  assert.equal(toUserFacingScanErrorMessage('   '), SCAN_UNEXPECTED_ERROR_MESSAGE);
});

test('toUserFacingScanErrorMessage accepts a custom fallback', () => {
  assert.equal(
    toUserFacingScanErrorMessage(new Error('some obscure failure'), '画像の解析に失敗しました。もう一度お試しください。'),
    '画像の解析に失敗しました。もう一度お試しください。',
  );
});

test('toUserFacingScanErrorMessage reads message from plain error-like objects', () => {
  assert.match(
    toUserFacingScanErrorMessage({ message: 'ECONNRESET while calling upstream' }),
    /通信エラー/,
  );
});
