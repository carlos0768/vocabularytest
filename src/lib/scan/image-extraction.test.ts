import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getScanImageMimeType,
  processScanImage,
  type ProcessScanImageParams,
  type ScanImageExtractionDeps,
} from '@/lib/scan/image-extraction';
import type { ExtractMode } from '@/lib/scan/mode-provider';

type TestWarningCode = 'grammar_not_found';
type TestWord = {
  english: string;
  japanese: string;
};

function nowFrom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}

function createDeps(
  overrides: Partial<ScanImageExtractionDeps<TestWord, TestWarningCode>> = {},
): ScanImageExtractionDeps<TestWord, TestWarningCode> {
  return {
    downloadImage: async () => ({
      data: new Blob(['fake image bytes']),
      error: null,
    }),
    extractImage: async () => ({
      result: {
        success: true,
        data: {
          words: [
            {
              english: ' apple ',
              japanese: ' りんご ',
            },
          ],
          sourceLabels: ['鉄壁'],
        },
      },
    }),
    parseWords: (rawWords) =>
      rawWords.map((rawWord) => {
        assert.equal(typeof rawWord, 'object');
        assert.notEqual(rawWord, null);
        const word = rawWord as Record<string, unknown>;
        return {
          english: String(word.english).trim(),
          japanese: String(word.japanese).trim(),
        };
      }),
    withTimingPhase: async (_phase, task) => task(),
    withTimeout: async (promise) => promise,
    logError: () => undefined,
    ...overrides,
  };
}

function createParams(overrides: Partial<ProcessScanImageParams> = {}): ProcessScanImageParams {
  return {
    imagePath: 'jobs/page.png',
    pageIndex: 0,
    mode: 'all' as ExtractMode,
    eikenLevel: null,
    apiKeys: {
      gemini: 'gemini-key',
      openai: 'openai-key',
    },
    timeoutMs: 270000,
    timeoutMessage: '画像解析がタイムアウトしました（5分）',
    ...overrides,
  };
}

test('getScanImageMimeType preserves pdf, png, webp, and jpeg detection', () => {
  assert.equal(getScanImageMimeType('jobs/page.pdf'), 'application/pdf');
  assert.equal(getScanImageMimeType('jobs/page.PNG'), 'image/png');
  assert.equal(getScanImageMimeType('jobs/page.webp'), 'image/webp');
  assert.equal(getScanImageMimeType('jobs/page.jpeg'), 'image/jpeg');
  assert.equal(getScanImageMimeType('jobs/page.jpg'), 'image/jpeg');
});

test('processScanImage returns empty words, empty sourceLabels, error, and pageWarning on download failure', async () => {
  const result = await processScanImage(
    createParams({
      imagePath: 'jobs/missing.png',
      pageIndex: 1,
    }),
    createDeps({
      now: nowFrom([100, 113]),
      downloadImage: async () => ({
        data: null,
        error: { message: 'not found' },
      }),
      extractImage: async () => {
        throw new Error('extractImage should not be called');
      },
    }),
  );

  assert.deepEqual(result, {
    words: [],
    sourceLabels: [],
    error: '画像データの取得に失敗しました',
    pageWarning: 'ページ2: 画像データの取得に失敗しました',
    downloadMs: 13,
  });
});

test('processScanImage returns first error candidate and pageWarning on extraction failure', async () => {
  const result = await processScanImage(
    createParams(),
    createDeps({
      now: nowFrom([10, 14, 30, 47]),
      extractImage: async () => ({
        result: {
          success: false,
          error: 'OCR failed',
        },
        warningCode: 'grammar_not_found',
      }),
    }),
  );

  assert.deepEqual(result, {
    words: [],
    sourceLabels: [],
    warningCode: 'grammar_not_found',
    error: 'OCR failed',
    pageWarning: 'ページ1: OCR failed',
    downloadMs: 4,
    extractionMs: 17,
  });
});

test('processScanImage returns parsed words, sourceLabels, and download/extraction timing on success', async () => {
  let capturedBase64Image = '';
  let capturedMode: ExtractMode | null = null;
  let capturedPhase = '';
  let capturedTimeoutMs = 0;
  let capturedTimeoutMessage = '';

  const result = await processScanImage(
    createParams({
      mode: 'idiom',
      eikenLevel: '2',
    }),
    createDeps({
      now: nowFrom([100, 112, 200, 245]),
      extractImage: async (base64Image, mode) => {
        capturedBase64Image = base64Image;
        capturedMode = mode;
        return {
          result: {
            success: true,
            data: {
              words: [
                {
                  english: ' apple ',
                  japanese: ' りんご ',
                },
              ],
              sourceLabels: ['教材: 鉄壁', 'note'],
            },
          },
          warningCode: 'grammar_not_found',
        };
      },
      withTimingPhase: async (phase, task) => {
        capturedPhase = phase;
        return task();
      },
      withTimeout: async (promise, timeoutMs, timeoutMessage) => {
        capturedTimeoutMs = timeoutMs;
        capturedTimeoutMessage = timeoutMessage;
        return promise;
      },
    }),
  );

  assert.deepEqual(result, {
    words: [
      {
        english: 'apple',
        japanese: 'りんご',
      },
    ],
    sourceLabels: ['鉄壁', 'ノート'],
    warningCode: 'grammar_not_found',
    downloadMs: 12,
    extractionMs: 45,
  });
  assert.equal(
    capturedBase64Image,
    `data:image/png;base64,${Buffer.from('fake image bytes').toString('base64')}`,
  );
  assert.equal(capturedMode, 'idiom');
  assert.equal(capturedPhase, 'aiExtraction');
  assert.equal(capturedTimeoutMs, 270000);
  assert.equal(capturedTimeoutMessage, '画像解析がタイムアウトしました（5分）');
});
