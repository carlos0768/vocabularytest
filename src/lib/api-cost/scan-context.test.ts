import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getApiCostScanContext,
  getScanContextEventFields,
  runWithApiCostScanContext,
  updateApiCostScanContext,
} from './scan-context';

test('getScanContextEventFields returns null outside a scan context', () => {
  assert.equal(getScanContextEventFields(), null);
});

test('runWithApiCostScanContext auto-generates a scanId and exposes event fields', async () => {
  await runWithApiCostScanContext({ source: 'api/extract' }, async () => {
    const context = getApiCostScanContext();
    assert.ok(context);
    assert.ok(context.scanId.length > 0);

    const fields = getScanContextEventFields();
    assert.ok(fields);
    assert.equal(fields.userId, null);
    assert.deepEqual(fields.metadata, {
      scan_id: context.scanId,
      scan_source: 'api/extract',
    });
  });
});

test('runWithApiCostScanContext keeps an explicit scanId and userId', async () => {
  await runWithApiCostScanContext(
    { scanId: 'job-123', source: 'scan-jobs/process', userId: 'user-1' },
    async () => {
      const fields = getScanContextEventFields();
      assert.ok(fields);
      assert.equal(fields.userId, 'user-1');
      assert.equal(fields.metadata.scan_id, 'job-123');
      assert.equal(fields.metadata.scan_source, 'scan-jobs/process');
    }
  );
});

test('updateApiCostScanContext patches userId and modes across awaits', async () => {
  await runWithApiCostScanContext({ source: 'api/extract' }, async () => {
    updateApiCostScanContext({ userId: 'user-2', modes: ['all', 'idiom'] });
    await Promise.resolve();

    const fields = getScanContextEventFields();
    assert.ok(fields);
    assert.equal(fields.userId, 'user-2');
    assert.deepEqual(fields.metadata.scan_modes, ['all', 'idiom']);
  });
});

test('updateApiCostScanContext is a no-op outside a scan context', () => {
  updateApiCostScanContext({ userId: 'ignored' });
  assert.equal(getScanContextEventFields(), null);
});

test('concurrent scan contexts stay isolated', async () => {
  const results = await Promise.all([
    runWithApiCostScanContext({ scanId: 'scan-a', source: 'api/extract' }, async () => {
      await Promise.resolve();
      return getScanContextEventFields()?.metadata.scan_id;
    }),
    runWithApiCostScanContext({ scanId: 'scan-b', source: 'api/extract' }, async () => {
      await Promise.resolve();
      return getScanContextEventFields()?.metadata.scan_id;
    }),
  ]);
  assert.deepEqual(results, ['scan-a', 'scan-b']);
});
