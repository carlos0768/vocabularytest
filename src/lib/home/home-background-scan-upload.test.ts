import test from 'node:test';
import assert from 'node:assert/strict';

import {
  type HomeBackgroundScanStorageBucket,
  createHomeBackgroundScanJob,
} from './home-background-scan-upload';

class FakeBucket implements HomeBackgroundScanStorageBucket {
  uploads: Array<{ path: string; file: File; options: { contentType: string; upsert: false } }> = [];
  removedPaths: string[][] = [];
  failUploadAt: number | null = null;

  async upload(path: string, file: File, options: { contentType: string; upsert: false }) {
    this.uploads.push({ path, file, options });
    if (this.failUploadAt === this.uploads.length - 1) {
      return { error: { message: 'upload failed' } };
    }
    return { error: null };
  }

  async remove(paths: string[]) {
    this.removedPaths.push(paths);
  }
}

test('createHomeBackgroundScanJob uploads prepared images and creates a scan job', async () => {
  const bucket = new FakeBucket();
  const progressLabels: string[] = [];
  const fetchCalls: Array<{ input: string; init: { headers: Record<string, string>; body: string } }> = [];
  const files = [
    new File(['first'], 'first.jpg', { type: 'image/jpeg' }),
    new File(['second'], 'second.jpg', { type: 'image/jpeg' }),
  ];

  const result = await createHomeBackgroundScanJob({
    files,
    userId: 'user-1',
    accessToken: 'token-1',
    storage: { from: () => bucket },
    scanMode: 'all',
    targetProjectId: 'project-1',
    onProgress: (label) => progressLabels.push(label),
    prepareUploadImage: async ({ file, index }) => ({
      uploadFile: file,
      imagePath: `user-1/prepared-${index}.jpg`,
      contentType: 'image/jpeg',
    }),
    fetcher: async (input, init) => {
      fetchCalls.push({ input, init });
      return { ok: true, json: async () => ({ success: true }) };
    },
  });

  assert.deepEqual(result, {
    imagePaths: ['user-1/prepared-0.jpg', 'user-1/prepared-1.jpg'],
  });
  assert.deepEqual(progressLabels, [
    '画像 1/2 をアップロード中...',
    '画像 2/2 をアップロード中...',
    'スキャンを送信中...',
  ]);
  assert.deepEqual(bucket.uploads.map((upload) => ({
    path: upload.path,
    contentType: upload.options.contentType,
    upsert: upload.options.upsert,
  })), [
    { path: 'user-1/prepared-0.jpg', contentType: 'image/jpeg', upsert: false },
    { path: 'user-1/prepared-1.jpg', contentType: 'image/jpeg', upsert: false },
  ]);
  assert.equal(fetchCalls[0]?.input, '/api/scan-jobs/create');
  assert.equal(fetchCalls[0]?.init.headers.Authorization, 'Bearer token-1');
  const requestBody = JSON.parse(fetchCalls[0]!.init.body) as Record<string, unknown>;
  assert.equal(typeof requestBody.projectTitle, 'string');
  assert.equal((requestBody.projectTitle as string).startsWith('スキャン '), true);
  assert.deepEqual({ ...requestBody, projectTitle: '<dynamic>' }, {
    imagePaths: ['user-1/prepared-0.jpg', 'user-1/prepared-1.jpg'],
    projectTitle: '<dynamic>',
    scanMode: 'all',
    eikenLevel: null,
    targetProjectId: 'project-1',
    clientPlatform: 'web',
  });
  assert.deepEqual(bucket.removedPaths, []);
});

test('createHomeBackgroundScanJob removes uploaded images when a later upload fails', async () => {
  const bucket = new FakeBucket();
  bucket.failUploadAt = 1;

  await assert.rejects(
    () => createHomeBackgroundScanJob({
      files: [
        new File(['first'], 'first.jpg', { type: 'image/jpeg' }),
        new File(['second'], 'second.jpg', { type: 'image/jpeg' }),
      ],
      userId: 'user-1',
      accessToken: 'token-1',
      storage: { from: () => bucket },
      scanMode: 'all',
      prepareUploadImage: async ({ file, index }) => ({
        uploadFile: file,
        imagePath: `user-1/prepared-${index}.jpg`,
        contentType: 'image/jpeg',
      }),
      fetcher: async () => ({ ok: true, json: async () => ({ success: true }) }),
    }),
    /画像のアップロードに失敗しました: upload failed/,
  );

  assert.deepEqual(bucket.removedPaths, [['user-1/prepared-0.jpg']]);
});

test('createHomeBackgroundScanJob removes uploaded images when job creation fails', async () => {
  const bucket = new FakeBucket();

  await assert.rejects(
    () => createHomeBackgroundScanJob({
      files: [new File(['first'], 'first.jpg', { type: 'image/jpeg' })],
      userId: 'user-1',
      accessToken: 'token-1',
      storage: { from: () => bucket },
      scanMode: 'all',
      prepareUploadImage: async ({ file }) => ({
        uploadFile: file,
        imagePath: 'user-1/prepared-0.jpg',
        contentType: 'image/jpeg',
      }),
      fetcher: async () => ({ ok: false, json: async () => ({ error: 'job failed' }) }),
    }),
    /job failed/,
  );

  assert.deepEqual(bucket.removedPaths, [['user-1/prepared-0.jpg']]);
});
