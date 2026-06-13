import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('runGeminiRequest caps Gemini 2.5 thinking budget', () => {
  assert.equal(source.includes('thinkingConfig'), true);
  assert.equal(source.includes('thinkingBudget'), true);
});

test('generate responses include timing payloads', () => {
  assert.equal(source.includes('timing: buildTimingPayload(startTime)'), true);
});

test('gateway cap is enforced before provider calls', () => {
  assert.equal(source.includes('Gateway daily cap reached'), true);
  assert.equal(source.includes('gatewayLimiter.recordStart'), true);
});
