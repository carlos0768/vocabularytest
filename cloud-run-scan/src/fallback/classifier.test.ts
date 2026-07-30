import test from 'node:test';
import assert from 'node:assert/strict';

import { classify429Label, classifyGeminiError } from './classifier.js';

test('classify429Label detects QUOTA_EXHAUSTED by message', () => {
  const label = classify429Label(new Error('Quota exceeded for metric generate_content_free_tier_requests'));
  assert.equal(label, 'QUOTA_EXHAUSTED');
});

test('classify429Label detects RATE_LIMIT_BURST from structured reason', () => {
  const label = classify429Label({
    status: 429,
    message: 'RESOURCE_EXHAUSTED',
    details: [{ reason: 'rateLimitExceeded' }],
  });
  assert.equal(label, 'RATE_LIMIT_BURST');
});

test('classifyGeminiError detects OVERLOADED and retryable 429', () => {
  const classified = classifyGeminiError({ status: 429, message: 'Please try again later. Resource exhausted' });
  assert.equal(classified.kind, '429');
  assert.equal(classified.label, 'OVERLOADED');
  assert.equal(classified.retriable, true);
  assert.equal(classified.shouldFallback, true);
});

test('classifyGeminiError detects AUTH_OR_PERMISSION from 403', () => {
  const classified = classifyGeminiError({ status: 403, message: 'permission denied' });
  assert.equal(classified.kind, 'AUTH_OR_PERMISSION');
  assert.equal(classified.shouldFallback, false);
});

test('classifyGeminiError treats quota-like 403 as QUOTA_EXHAUSTED fallback', () => {
  const classified = classifyGeminiError({ status: 403, message: 'insufficient quota for this project' });
  assert.equal(classified.kind, '429');
  assert.equal(classified.label, 'QUOTA_EXHAUSTED');
  assert.equal(classified.shouldFallback, true);
});

test('classifyGeminiError detects TIMEOUT/network failures', () => {
  const classified = classifyGeminiError(new Error('fetch failed: ETIMEDOUT'));
  assert.equal(classified.kind, 'TIMEOUT');
  assert.equal(classified.retriable, true);
  assert.equal(classified.shouldFallback, true);
});

test('classifyGeminiError treats empty-content as fallback eligible', () => {
  const classified = classifyGeminiError(new Error('Gemini returned empty content: STOP'));
  assert.equal(classified.kind, 'UPSTREAM_5XX');
  assert.equal(classified.reasonForSlack, 'EMPTY_CONTENT');
  assert.equal(classified.retriable, true);
  assert.equal(classified.shouldFallback, true);
});

// Regression: production Vertex AI error format observed 2026-06-11
// The @google/genai SDK embeds the JSON response body as the error message.
test('classifyGeminiError handles Vertex AI nested JSON error (RESOURCE_EXHAUSTED/OVERLOADED)', () => {
  const vertexError = new Error(
    '{"error":{"code":429,"message":"Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.","status":"RESOURCE_EXHAUSTED"}}',
  );
  const classified = classifyGeminiError(vertexError);
  assert.equal(classified.kind, '429');
  assert.equal(classified.label, 'OVERLOADED');
  assert.equal(classified.statusCode, 429);
  assert.equal(classified.retriable, true);
  assert.equal(classified.shouldFallback, true);
  assert.equal(classified.eligibleForBreaker, true);
});

test('classifyGeminiError handles Vertex AI nested JSON quota error', () => {
  const vertexError = new Error(
    '{"error":{"code":429,"message":"Quota exceeded for quota metric generate_content_free_tier_requests","status":"RESOURCE_EXHAUSTED"}}',
  );
  const classified = classifyGeminiError(vertexError);
  assert.equal(classified.kind, '429');
  assert.equal(classified.label, 'QUOTA_EXHAUSTED');
  assert.equal(classified.statusCode, 429);
  assert.equal(classified.retriable, false);
  assert.equal(classified.shouldFallback, true);
});
