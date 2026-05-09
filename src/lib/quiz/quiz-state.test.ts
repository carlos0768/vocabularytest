import test from 'node:test';
import assert from 'node:assert/strict';

import type { Word } from '@/types';
import {
  WORD_ORDER_BLANK_TOKEN,
  WORD_ORDER_CACHE_VERSION,
} from '@/lib/quiz/word-order';
import {
  GENERIC_EN_DISTRACTOR_POOL,
  GENERIC_JA_DISTRACTOR_POOL,
  QUIZ_STATE_TTL_MS,
  generateQuizQuestions,
  getQuizStorageKey,
  isQuizStateExpired,
} from './quiz-state';

const identityShuffle = <T>(items: T[]): T[] => [...items];

function createWord(overrides: Partial<Word> & Pick<Word, 'id' | 'english' | 'japanese'>): Word {
  return {
    projectId: 'project-1',
    distractors: [],
    status: 'unlearned',
    createdAt: '2026-01-01T00:00:00.000Z',
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    ...overrides,
  };
}

test('getQuizStorageKey fixes normal and review session keys', () => {
  assert.equal(getQuizStorageKey('project-1', false), 'quiz_state_project-1');
  assert.equal(getQuizStorageKey('project-1', true), 'quiz_state_review');
  assert.equal(getQuizStorageKey('project-1', false, true), 'quiz_state_learn');
});

test('isQuizStateExpired preserves the 30 minute TTL boundary', () => {
  const savedAt = 1_000_000;

  assert.equal(QUIZ_STATE_TTL_MS, 30 * 60 * 1000);
  assert.equal(isQuizStateExpired(savedAt, savedAt + QUIZ_STATE_TTL_MS), false);
  assert.equal(isQuizStateExpired(savedAt, savedAt + QUIZ_STATE_TTL_MS + 1), true);
});

test('generateQuizQuestions builds en-to-ja options from stored distractors and generic fallback', () => {
  const words = [
    createWord({
      id: 'word-1',
      english: 'explain',
      japanese: '説明する',
      distractors: [' 確認する ', '提供する', '説明する', '確認する', ''],
    }),
  ];

  const [question] = generateQuizQuestions(words, 1, 'en-to-ja', identityShuffle);

  assert.equal(question.word.id, 'word-1');
  assert.deepEqual(question.options, [
    '説明する',
    '確認する',
    '提供する',
    GENERIC_JA_DISTRACTOR_POOL[2],
  ]);
  assert.equal(question.correctIndex, 0);
});

test('generateQuizQuestions falls back to other Japanese words when stored distractors are placeholders', () => {
  const words = [
    createWord({
      id: 'word-1',
      english: 'apple',
      japanese: 'りんご',
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
    createWord({
      id: 'word-2',
      english: 'banana',
      japanese: 'バナナ',
      createdAt: '2026-01-02T00:00:00.000Z',
    }),
    createWord({
      id: 'word-3',
      english: 'orange',
      japanese: 'バナナ',
      createdAt: '2026-01-03T00:00:00.000Z',
    }),
  ];

  const [question] = generateQuizQuestions(words, 1, 'en-to-ja', identityShuffle);

  assert.deepEqual(question.options, ['りんご', 'バナナ', '確認する', '提供する']);
  assert.equal(new Set(question.options).size, 4);
  assert.equal(question.correctIndex, 0);
});

test('generateQuizQuestions builds ja-to-en options from other words and English generic fallback', () => {
  const words = [
    createWord({
      id: 'word-1',
      english: 'apple',
      japanese: 'りんご',
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
    createWord({
      id: 'word-2',
      english: 'banana',
      japanese: 'バナナ',
      createdAt: '2026-01-02T00:00:00.000Z',
    }),
    createWord({
      id: 'word-3',
      english: 'banana',
      japanese: '果物',
      createdAt: '2026-01-03T00:00:00.000Z',
    }),
  ];

  const [question] = generateQuizQuestions(words, 1, 'ja-to-en', identityShuffle);

  assert.deepEqual(question.options, ['apple', 'banana', GENERIC_EN_DISTRACTOR_POOL[0], GENERIC_EN_DISTRACTOR_POOL[1]]);
  assert.equal(new Set(question.options).size, 4);
  assert.equal(question.correctIndex, 0);
});

test('generateQuizQuestions excludes the correct English word from generic fallback', () => {
  const words = [
    createWord({
      id: 'word-1',
      english: 'consider',
      japanese: '検討する',
    }),
  ];

  const [question] = generateQuizQuestions(words, 1, 'ja-to-en', identityShuffle);

  assert.deepEqual(question.options, ['consider', 'provide', 'develop', 'maintain']);
  assert.equal(question.correctIndex, 0);
});

test('generateQuizQuestions uses word-order questions for cached multi-word entries', () => {
  const [question] = generateQuizQuestions([
    createWord({
      id: 'word-1',
      english: 'take care',
      japanese: '世話をする',
      wordOrderQuiz: {
        version: WORD_ORDER_CACHE_VERSION,
        sourceEnglish: 'take care',
        sourceJapanese: '世話をする',
        sentenceTokens: [WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN],
        answerTokens: ['take', 'care'],
        decoyTokens: ['hold', 'keep', 'watch'],
        generatedAt: '2026-05-09T00:00:00.000Z',
      },
    }),
  ], 1, 'en-to-ja', identityShuffle);

  assert.equal(question.type, 'word-order');
  assert.deepEqual(question.options, ['take', 'care', 'hold', 'keep', 'watch']);
});

test('generateQuizQuestions does not fall back to multiple-choice for uncached multi-word entries', () => {
  const questions = generateQuizQuestions([
    createWord({
      id: 'word-1',
      english: 'take care',
      japanese: '世話をする',
      distractors: ['守る', '持つ', '作る'],
    }),
    createWord({
      id: 'word-2',
      english: 'adapt',
      japanese: '適応する',
      distractors: ['拒む', '避ける', '忘れる'],
    }),
  ], 2, 'en-to-ja', identityShuffle);

  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.word.id, 'word-2');
  assert.notEqual(questions[0]?.type, 'word-order');
});
