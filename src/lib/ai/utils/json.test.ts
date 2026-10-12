import test from 'node:test';
import assert from 'node:assert/strict';

import { extractJsonContent } from './json';

test('extractJsonContent unwraps a ```json fence', () => {
  assert.equal(extractJsonContent('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJsonContent('```\n{"a":1}\n```'), '{"a":1}');
});

test('extractJsonContent unwraps an uppercase ```JSON fence', () => {
  assert.equal(extractJsonContent('```JSON\n{"a":1}\n```'), '{"a":1}');
});

test('extractJsonContent slices from the first { to the last } without a fence', () => {
  assert.equal(extractJsonContent('Here you go: {"a":{"b":2}} thanks'), '{"a":{"b":2}}');
});

test('extractJsonContent returns the input unchanged when no JSON object is present', () => {
  assert.equal(extractJsonContent('no json here'), 'no json here');
});
