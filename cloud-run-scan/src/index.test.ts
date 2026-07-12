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

test('gateway cap is enforced before provider calls via the Firestore guard only', () => {
  assert.equal(source.includes('gatewayFirestoreGuard.checkEligibility'), true);
  assert.equal(source.includes('gatewayFirestoreGuard.commitRequestCost'), true);
  assert.equal(source.includes('gatewayFirestoreGuard.recordFailure'), true);
  assert.equal(source.includes('DailyGatewayLimiter'), false);
  assert.equal(source.includes("if (isBillable)"), true);
});

test('actual usage cost is calculated and committed instead of a fixed yen-per-call', () => {
  assert.equal(source.includes('calculateEstimatedCost'), true);
  assert.equal(source.includes('estimatedYenPerCall'), false);
});

test('429 responses carry a machine readable reason', () => {
  assert.equal(source.includes("reason: 'unpriced_model_blocked'"), true);
  assert.equal(source.includes('reason: eligibility.reason'), true);
});
