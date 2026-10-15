import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCAN_EXAMPLE_GENERATION_ENABLED,
  resolveClassicalScanExamplePolicy,
  shouldAttachStockedScanExamples,
  shouldGenerateScanExamples,
} from './example-source';

test('scan example generation is paused: stocked examples only', () => {
  assert.equal(SCAN_EXAMPLE_GENERATION_ENABLED, false);
});

test('paused: a client asking for examples is neither charged nor generated for', () => {
  assert.equal(shouldGenerateScanExamples(true, false), false);
  assert.equal(shouldGenerateScanExamples(false, false), false);
});

test('paused: stocked examples are attached regardless of toggle or genres', () => {
  for (const includeExamples of [true, false]) {
    for (const hasExampleGenres of [true, false]) {
      assert.equal(
        shouldAttachStockedScanExamples({ includeExamples, hasExampleGenres }, false),
        true,
      );
    }
  }
});

test('paused: classical examples come from the dictionary cache only', () => {
  assert.deepEqual(resolveClassicalScanExamplePolicy(true, false), { cacheOnly: true });
  assert.deepEqual(resolveClassicalScanExamplePolicy(false, false), { cacheOnly: true });
});

test('enabled: keeps the opt-in behavior', () => {
  assert.equal(shouldGenerateScanExamples(true, true), true);
  assert.equal(shouldGenerateScanExamples(false, true), false);
  assert.equal(
    shouldAttachStockedScanExamples({ includeExamples: true, hasExampleGenres: false }, true),
    true,
  );
  assert.equal(
    shouldAttachStockedScanExamples({ includeExamples: true, hasExampleGenres: true }, true),
    false,
  );
  assert.equal(
    shouldAttachStockedScanExamples({ includeExamples: false, hasExampleGenres: false }, true),
    false,
  );
  assert.deepEqual(resolveClassicalScanExamplePolicy(true, true), { cacheOnly: false });
  assert.equal(resolveClassicalScanExamplePolicy(false, true), null);
});
