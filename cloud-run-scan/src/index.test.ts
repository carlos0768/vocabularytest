import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('runGeminiRequest does not force thinkingConfig', () => {
  assert.equal(source.includes('thinkingConfig'), false);
  assert.equal(source.includes('thinkingBudget'), false);
});

test('generate responses include timing payloads', () => {
  assert.equal(source.includes('timing: buildTimingPayload(startTime)'), true);
});
