import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHUNK_RELOAD_MIN_INTERVAL_MS,
  isChunkLoadError,
  shouldAutoReloadForChunkError,
} from './chunk-load';

function chunkError(message: string, name = 'Error'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

test('isChunkLoadError detects ChunkLoadError by name', () => {
  assert.equal(isChunkLoadError(chunkError('anything', 'ChunkLoadError')), true);
});

test('isChunkLoadError detects webpack/turbopack chunk failure messages', () => {
  assert.equal(isChunkLoadError(chunkError('Loading chunk 123 failed. (error: https://example.com/_next/static/chunks/123.js)')), true);
  assert.equal(isChunkLoadError(chunkError('Loading CSS chunk 42 failed')), true);
  assert.equal(isChunkLoadError(chunkError('Failed to fetch dynamically imported module: https://example.com/_next/static/chunks/app/page.js')), true);
  assert.equal(isChunkLoadError(chunkError('Importing a module script failed.')), true);
  assert.equal(isChunkLoadError(chunkError('error loading dynamically imported module')), true);
});

test('isChunkLoadError rejects ordinary runtime errors', () => {
  assert.equal(isChunkLoadError(chunkError("Cannot read properties of undefined (reading 'title')")), false);
  assert.equal(isChunkLoadError(chunkError('Network request failed')), false);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError('Loading chunk 1 failed'), false);
});

test('shouldAutoReloadForChunkError reloads for a chunk error outside the throttle window', () => {
  const error = chunkError('Loading chunk 1 failed');
  assert.equal(shouldAutoReloadForChunkError(error, 0, CHUNK_RELOAD_MIN_INTERVAL_MS + 1), true);
});

test('shouldAutoReloadForChunkError throttles repeated reloads', () => {
  const error = chunkError('Loading chunk 1 failed');
  const lastReloadAt = 1_000_000;
  assert.equal(
    shouldAutoReloadForChunkError(error, lastReloadAt, lastReloadAt + CHUNK_RELOAD_MIN_INTERVAL_MS - 1),
    false,
  );
  assert.equal(
    shouldAutoReloadForChunkError(error, lastReloadAt, lastReloadAt + CHUNK_RELOAD_MIN_INTERVAL_MS),
    true,
  );
});

test('shouldAutoReloadForChunkError never reloads for non-chunk errors', () => {
  const error = chunkError('Something else broke');
  assert.equal(shouldAutoReloadForChunkError(error, 0, Number.MAX_SAFE_INTEGER), false);
});
