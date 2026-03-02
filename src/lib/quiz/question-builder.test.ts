import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuizQuestions, hasPreparedDistractors } from './question-builder';
import type { Word } from '@/types';

function createWord(overrides: Partial<Word>): Word {
  return {
    id: overrides.id ?? 'word-id',
    projectId: overrides.projectId ?? 'project-id',
    english: overrides.english ?? 'word',
    japanese: overrides.japanese ?? '単語',
    distractors: overrides.distractors ?? ['誤答1', '誤答2', '誤答3'],
    status: overrides.status ?? 'new',
    createdAt: overrides.createdAt ?? '2026-03-01T00:00:00.000Z',
    easeFactor: overrides.easeFactor ?? 2.5,
    intervalDays: overrides.intervalDays ?? 0,
    repetition: overrides.repetition ?? 0,
    isFavorite: overrides.isFavorite ?? false,
    exampleSentence: overrides.exampleSentence,
    exampleSentenceJa: overrides.exampleSentenceJa,
    pronunciation: overrides.pronunciation,
    lastReviewedAt: overrides.lastReviewedAt,
    nextReviewAt: overrides.nextReviewAt,
    partOfSpeechTags: overrides.partOfSpeechTags,
    relatedWords: overrides.relatedWords,
    usagePatterns: overrides.usagePatterns,
    insightsGeneratedAt: overrides.insightsGeneratedAt,
    insightsVersion: overrides.insightsVersion,
  };
}

test('hasPreparedDistractors rejects placeholders', () => {
  const prepared = hasPreparedDistractors(createWord({
    id: 'prepared',
    distractors: ['誤答1', '誤答2', '誤答3'],
  }));
  const placeholder = hasPreparedDistractors(createWord({
    id: 'placeholder',
    distractors: ['選択肢1', '選択肢2', '選択肢3'],
  }));

  assert.equal(prepared, true);
  assert.equal(placeholder, false);
});

test('buildQuizQuestions creates 4 options even when distractors are placeholders', () => {
  const words = [
    createWord({ id: 'a', english: 'apple', japanese: 'りんご', distractors: ['選択肢1', '選択肢2', '選択肢3'] }),
    createWord({ id: 'b', english: 'book', japanese: '本', distractors: ['選択肢1', '選択肢2', '選択肢3'] }),
  ];

  const questions = buildQuizQuestions(words, 2, 'en-to-ja');

  assert.equal(questions.length, 2);
  for (const question of questions) {
    assert.equal(question.options.length, 4);
    assert.ok(question.correctIndex >= 0 && question.correctIndex < 4);
    assert.ok(question.options.includes(question.word.japanese));
  }
});

test('buildQuizQuestions generates JA->EN options with local fallback when candidate pool is small', () => {
  const words = [
    createWord({ id: 'a', english: 'apple', japanese: 'りんご', distractors: ['選択肢1', '選択肢2', '選択肢3'] }),
  ];

  const questions = buildQuizQuestions(words, 1, 'ja-to-en');

  assert.equal(questions.length, 1);
  assert.equal(questions[0].options.length, 4);
  assert.ok(questions[0].options.includes('apple'));
});

