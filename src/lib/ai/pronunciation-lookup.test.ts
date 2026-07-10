import test from 'node:test';
import assert from 'node:assert/strict';

import { __internal, PRONUNCIATION_RESPONSE_SCHEMA } from '@/lib/ai/pronunciation-lookup';

test('PRONUNCIATION_RESPONSE_SCHEMA mirrors the results/{id,pronunciation} shape', () => {
  assert.equal(PRONUNCIATION_RESPONSE_SCHEMA.type, 'OBJECT');
  assert.deepEqual(PRONUNCIATION_RESPONSE_SCHEMA.required, ['results']);
  const item = PRONUNCIATION_RESPONSE_SCHEMA.properties?.results?.items;
  assert.equal(item?.type, 'OBJECT');
  assert.deepEqual(item?.required, ['id', 'pronunciation']);
});

test('normalizePronunciation keeps slash-wrapped IPA', () => {
  assert.equal(__internal.normalizePronunciation('/əˈdæpt/'), '/əˈdæpt/');
});

test('normalizePronunciation wraps bare IPA and bracket IPA in slash format', () => {
  assert.equal(__internal.normalizePronunciation('əˈdæpt'), '/əˈdæpt/');
  assert.equal(__internal.normalizePronunciation('[əˈdæpt]'), '/əˈdæpt/');
});

test('normalizePronunciation rejects empty and placeholder values', () => {
  assert.equal(__internal.normalizePronunciation(''), null);
  assert.equal(__internal.normalizePronunciation('unknown'), null);
  assert.equal(__internal.normalizePronunciation('---'), null);
});

test('buildPronunciationPrompt asks for JSON IPA generation without dictionary API dependency', () => {
  const prompt = __internal.buildPronunciationPrompt([
    { id: 'word-1', english: 'adapt' },
  ]);

  assert.match(prompt, /IPA/);
  assert.match(prompt, /"id": "word-id"/);
  assert.match(prompt, /ID: word-1 \/ English: adapt/);
  assert.doesNotMatch(prompt, /dictionaryapi/i);
});
