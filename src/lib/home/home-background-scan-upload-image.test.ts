import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareHomeBackgroundScanUploadImage } from './home-background-scan-upload-image';

test('prepareHomeBackgroundScanUploadImage fixes upload file path and metadata', async () => {
  const originalFile = new File(['original'], 'photo.heic', { type: 'image/heic' });
  const processedFile = new File(['processed'], 'photo.jpg', { type: 'image/jpeg' });

  const prepared = await prepareHomeBackgroundScanUploadImage({
    file: originalFile,
    userId: 'user-1',
    index: 2,
    now: 1770000000000,
    suffix: 'scan-uuid',
    processImage: async (file) => {
      assert.equal(file, originalFile);
      return processedFile;
    },
  });

  assert.deepEqual(prepared, {
    uploadFile: processedFile,
    imagePath: 'user-1/1770000000000-2-scan-uuid.jpg',
    contentType: 'image/jpeg',
  });
});

test('prepareHomeBackgroundScanUploadImage preserves supported upload extensions', async () => {
  const cases = [
    { type: 'image/png', expectedPath: 'user-1/1-0-fixed.png' },
    { type: 'image/webp', expectedPath: 'user-1/1-0-fixed.webp' },
    { type: 'image/gif', expectedPath: 'user-1/1-0-fixed.gif' },
    { type: '', expectedPath: 'user-1/1-0-fixed.jpg' },
  ];

  for (const entry of cases) {
    const processedFile = new File(['image'], 'image', { type: entry.type });

    const prepared = await prepareHomeBackgroundScanUploadImage({
      file: processedFile,
      userId: 'user-1',
      index: 0,
      now: 1,
      suffix: 'fixed',
      processImage: async () => processedFile,
    });

    assert.equal(prepared.imagePath, entry.expectedPath);
    assert.equal(prepared.contentType, entry.type || 'image/jpeg');
  }
});
