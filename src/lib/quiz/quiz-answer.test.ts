import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQuizAnswerOutcomePlan,
  getTypeInCorrectAnswer,
  isTypeInAnswerCorrect,
} from './quiz-answer';
import type { Word } from '@/types';

const word: Word = {
  id: 'word-1',
  projectId: 'project-original',
  english: 'Inspect',
  japanese: '調べる',
  distractors: ['壊す', '運ぶ', '隠す'],
  status: 'review',
  createdAt: '2026-05-21T00:00:00.000Z',
  easeFactor: 2.5,
  intervalDays: 1,
  repetition: 1,
  isFavorite: false,
};

test('getTypeInCorrectAnswer preserves active and direction rules', () => {
  assert.equal(getTypeInCorrectAnswer({
    word,
    isActiveVocabulary: true,
    quizDirection: 'en-to-ja',
  }), 'Inspect');
  assert.equal(getTypeInCorrectAnswer({
    word,
    isActiveVocabulary: false,
    quizDirection: 'en-to-ja',
  }), '調べる');
  assert.equal(getTypeInCorrectAnswer({
    word,
    isActiveVocabulary: false,
    quizDirection: 'ja-to-en',
  }), 'Inspect');
});

test('isTypeInAnswerCorrect matches trimmed lower-case exact answers', () => {
  assert.equal(isTypeInAnswerCorrect(' inspect ', 'Inspect'), true);
  assert.equal(isTypeInAnswerCorrect('inspected', 'Inspect'), false);
});

test('buildQuizAnswerOutcomePlan builds update payload for correct answers', () => {
  const plan = buildQuizAnswerOutcomePlan({
    word,
    isCorrect: true,
    recordProjectId: 'project-record',
  });

  assert.equal(plan.wordUpdates.status, 'active');
  assert.equal(plan.wordUpdates.repetition, 2);
  assert.equal(plan.wrongAnswer, undefined);
});

test('buildQuizAnswerOutcomePlan builds wrong-answer record details', () => {
  const plan = buildQuizAnswerOutcomePlan({
    word,
    isCorrect: false,
    recordProjectId: 'project-record',
  });

  assert.equal(plan.wordUpdates.status, 'new');
  assert.deepEqual(plan.wrongAnswer, {
    wordId: 'word-1',
    english: 'Inspect',
    japanese: '調べる',
    projectId: 'project-record',
    distractors: ['壊す', '運ぶ', '隠す'],
  });
});
