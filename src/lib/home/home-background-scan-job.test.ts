import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHomeBackgroundScanJobCreatePayload } from './home-background-scan-job';

test('buildHomeBackgroundScanJobCreatePayload fixes the scan job create request body shape', () => {
  const imagePaths = ['user-1/scan-1.jpg', 'user-1/scan-2.jpg'];

  const payload = buildHomeBackgroundScanJobCreatePayload({
    imagePaths,
    scanMode: 'circled',
    targetProjectId: '11111111-1111-4111-8111-111111111111',
    now: new Date(2026, 4, 21),
  });

  assert.deepEqual(payload, {
    imagePaths,
    projectTitle: 'スキャン 5/21',
    scanMode: 'circled',
    eikenLevel: null,
    targetProjectId: '11111111-1111-4111-8111-111111111111',
    clientPlatform: 'web',
  });
  assert.notEqual(payload.imagePaths, imagePaths);
});

test('buildHomeBackgroundScanJobCreatePayload omits targetProjectId for a new project scan', () => {
  const payload = buildHomeBackgroundScanJobCreatePayload({
    imagePaths: ['user-1/scan-1.jpg'],
    scanMode: 'all',
    targetProjectId: null,
    now: new Date(2026, 0, 9),
  });

  assert.deepEqual(payload, {
    imagePaths: ['user-1/scan-1.jpg'],
    projectTitle: 'スキャン 1/9',
    scanMode: 'all',
    eikenLevel: null,
    targetProjectId: undefined,
    clientPlatform: 'web',
  });
  assert.equal(JSON.stringify(payload).includes('targetProjectId'), false);
});
