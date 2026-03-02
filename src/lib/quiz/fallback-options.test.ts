import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalDistractorsFallback } from './fallback-options';

test('buildLocalDistractorsFallback prefers unique candidates and excludes correct answer', () => {
  const distractors = buildLocalDistractorsFallback({
    correct: 'apple',
    candidateValues: ['banana', 'apple', 'banana', 'orange', 'grape'],
    fallbackValues: ['fallback1', 'fallback2'],
  });

  assert.deepEqual(distractors, ['banana', 'orange', 'grape']);
});

test('buildLocalDistractorsFallback fills missing slots from fallback values', () => {
  const distractors = buildLocalDistractorsFallback({
    correct: 'book',
    candidateValues: ['book', ''],
    fallbackValues: ['pen', 'desk', 'chair'],
  });

  assert.equal(distractors.length, 3);
  assert.deepEqual(distractors, ['pen', 'desk', 'chair']);
});

test('buildLocalDistractorsFallback always returns minimum 3 distractors even with one-word inputs', () => {
  const distractors = buildLocalDistractorsFallback({
    correct: '唯一',
    candidateValues: [],
    fallbackValues: [],
  });

  assert.equal(distractors.length, 3);
  assert.ok(distractors.every((value) => value !== '唯一'));
});

