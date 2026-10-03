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

test('getTypeInCorrectAnswer always expects the English word (日英 only)', () => {
  assert.equal(getTypeInCorrectAnswer({
    word,
    isActiveVocabulary: true,
    quizDirection: 'en-to-ja',
  }), 'Inspect');
  assert.equal(getTypeInCorrectAnswer({
    word,
    isActiveVocabulary: false,
    quizDirection: 'en-to-ja',
  }), 'Inspect');
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

test('buildQuizAnswerOutcomePlan advances the mastery level of a mastered word and cycles its vocabulary type', () => {
  const mastered: Word = { ...word, status: 'mastered', masteryLevel: 0, vocabularyType: 'active' };
  const plan = buildQuizAnswerOutcomePlan({ word: mastered, isCorrect: true, recordProjectId: 'p' });
  assert.equal(plan.wordUpdates.status, 'mastered');
  assert.equal(plan.wordUpdates.masteryLevel, 1);
  assert.equal(plan.wordUpdates.vocabularyType, 'passive');

  const missed = buildQuizAnswerOutcomePlan({ word: { ...mastered, masteryLevel: 2 }, isCorrect: false, recordProjectId: 'p' });
  assert.equal(missed.wordUpdates.status, 'mastered');
  assert.equal(missed.wordUpdates.masteryLevel, 1);
});

test('buildQuizAnswerOutcomePlan leaves the mastery level alone for translation-target quizzes', () => {
  const translationTarget: Word = {
    ...word,
    status: 'mastered',
    masteryLevel: 0,
    vocabularyType: 'active',
    quizTarget: { kind: 'translation', key: 'k', wordId: word.id, translationId: 't-1' },
  };
  const plan = buildQuizAnswerOutcomePlan({ word: translationTarget, isCorrect: true, recordProjectId: 'p' });
  assert.equal(plan.wordUpdates.status, 'mastered');
  assert.equal(plan.wordUpdates.masteryLevel, undefined);
  assert.equal(plan.wordUpdates.vocabularyType, undefined);
});
