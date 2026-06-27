import test from 'node:test';
import assert from 'node:assert/strict';

import type { Word } from '@/types';
import {
  WORD_ORDER_BLANK_TOKEN,
  WORD_ORDER_CACHE_VERSION,
} from '@/lib/quiz/word-order';
import {
  normalizeActiveQuizAnswer,
  stripActiveQuizAnswerSpaces,
} from './active-answer';
import {
  GENERIC_EN_DISTRACTOR_POOL,
  GENERIC_JA_DISTRACTOR_POOL,
  QUIZ_STATE_TTL_MS,
  applyWordOrderQuestionsToPendingQuiz,
  generateQuizQuestions,
  getFavoritesQuizStorageKey,
  getQuizStorageKey,
  isQuizStateExpired,
} from './quiz-state';

const identityShuffle = <T>(items: T[]): T[] => [...items];

function createWord(overrides: Partial<Word> & Pick<Word, 'id' | 'english' | 'japanese'>): Word {
  return {
    projectId: 'project-1',
    distractors: [],
    status: 'new',
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

test('getFavoritesQuizStorageKey uses the favorites suffix for project quiz sessions', () => {
  assert.equal(getFavoritesQuizStorageKey('project-1'), 'quiz_state_project-1_favorites');
  assert.equal(getFavoritesQuizStorageKey('all'), 'quiz_state_all_favorites');
});

test('isQuizStateExpired preserves the 30 minute TTL boundary', () => {
  const savedAt = 1_000_000;

  assert.equal(QUIZ_STATE_TTL_MS, 30 * 60 * 1000);
  assert.equal(isQuizStateExpired(savedAt, savedAt + QUIZ_STATE_TTL_MS), false);
  assert.equal(isQuizStateExpired(savedAt, savedAt + QUIZ_STATE_TTL_MS + 1), true);
});

test('active quiz answer normalization removes spaces before rendering and matching', () => {
  assert.equal(stripActiveQuizAnswerSpaces(' take care  of '), 'takecareof');
  assert.equal(stripActiveQuizAnswerSpaces('look　up'), 'lookup');
  assert.equal(normalizeActiveQuizAnswer(' Make  Up '), 'makeup');
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

test('generateQuizQuestions primaryOnly skips explicit distinct non-primary meanings', () => {
  const questions = generateQuizQuestions([
    createWord({
      id: 'free-primary',
      english: 'free',
      japanese: '自由な',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-primary',
      lexiconSenseIsPrimary: true,
    }),
    createWord({
      id: 'free-cost',
      english: 'free',
      japanese: '無料の',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-cost',
      lexiconDistinctKey: 'cost',
    }),
  ], 3, 'en-to-ja', identityShuffle, { preserveOrder: true, primaryOnly: true });

  assert.deepEqual(questions.map((question) => question.word.id), ['free-primary']);
});

test('generateQuizQuestions expands distinct translations without splitting stored words', () => {
  const questions = generateQuizQuestions([
    createWord({
      id: 'word-free',
      english: 'free',
      japanese: '自由な',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-primary',
      lexiconSenseIsPrimary: true,
      translations: [
        {
          id: 'translation-primary',
          wordId: 'word-free',
          lexiconSenseId: 'sense-primary',
          translationJa: '自由な',
          normalizedTranslationJa: '自由な',
          meaningRank: 1,
          position: 0,
          isPrimary: true,
          lexiconSenseIsPrimary: true,
          status: 'mastered',
        },
        {
          id: 'translation-cost',
          wordId: 'word-free',
          lexiconSenseId: 'sense-cost',
          distinctKey: 'cost',
          translationJa: '無料の',
          normalizedTranslationJa: '無料の',
          meaningRank: 2,
          position: 1,
          isPrimary: false,
          lexiconSenseIsPrimary: false,
          status: 'new',
        },
      ],
    }),
    createWord({ id: 'plain', english: 'plain', japanese: '明白な' }),
  ], 3, 'en-to-ja', identityShuffle, { preserveOrder: true });

  assert.deepEqual(questions.map((question) => question.word.japanese), ['自由な', '無料の', '明白な']);
  assert.deepEqual(questions.map((question) => question.word.id), ['word-free', 'word-free', 'plain']);
  assert.equal(questions[1]?.word.quizTarget?.kind, 'translation');
  assert.equal(questions[1]?.word.quizTarget?.translationId, 'translation-cost');
  assert.equal(questions[1]?.word.status, 'new');
});

test('generateQuizQuestions primaryOnly does not expand distinct translations', () => {
  const questions = generateQuizQuestions([
    createWord({
      id: 'word-free',
      english: 'free',
      japanese: '自由な',
      translations: [
        {
          translationJa: '自由な',
          normalizedTranslationJa: '自由な',
          meaningRank: 1,
          position: 0,
          isPrimary: true,
        },
        {
          distinctKey: 'cost',
          translationJa: '無料の',
          normalizedTranslationJa: '無料の',
          meaningRank: 2,
          position: 1,
          isPrimary: false,
        },
      ],
    }),
  ], 3, 'en-to-ja', identityShuffle, { preserveOrder: true, primaryOnly: true });

  assert.deepEqual(questions.map((question) => question.word.japanese), ['自由な']);
});

test('generateQuizQuestions excludes distinct meanings of the same word as distractors', () => {
  const [question] = generateQuizQuestions([
    createWord({
      id: 'free-primary',
      english: 'free',
      japanese: '自由な',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-primary',
      lexiconSenseIsPrimary: true,
    }),
    createWord({
      id: 'free-cost',
      english: 'free',
      japanese: '無料の',
      lexiconEntryId: 'lex-free',
      lexiconSenseId: 'sense-cost',
      lexiconDistinctKey: 'cost',
    }),
    createWord({
      id: 'plain',
      english: 'plain',
      japanese: '明白な',
    }),
  ], 1, 'en-to-ja', identityShuffle, { preserveOrder: true });

  assert.equal(question.word.id, 'free-primary');
  assert.ok(!question.options.includes('無料の'));
  assert.equal(question.correctIndex, 0);
});

test('generateQuizQuestions removes stored distractors from the same word meanings', () => {
  const [question] = generateQuizQuestions([
    createWord({
      id: 'free-primary',
      english: 'free',
      japanese: '自由な',
      distractors: ['無料の', '明白な', '平凡な'],
      translations: [
        {
          distinctKey: 'cost',
          translationJa: '無料の',
          normalizedTranslationJa: '無料の',
          meaningRank: 2,
          position: 1,
          isPrimary: false,
        },
      ],
    }),
  ], 1, 'en-to-ja', identityShuffle, { preserveOrder: true });

  assert.deepEqual(question.options, ['自由な', '明白な', '平凡な', GENERIC_JA_DISTRACTOR_POOL[0]]);
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

test('generateQuizQuestions keeps active multi-word entries out of word-order mode', () => {
  const [question] = generateQuizQuestions([
    createWord({
      id: 'word-1',
      english: 'take care',
      japanese: '世話をする',
      vocabularyType: 'active',
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

  assert.notEqual(question.type, 'word-order');
  assert.equal(question.word.vocabularyType, 'active');
  assert.deepEqual(question.options, ['世話をする', GENERIC_JA_DISTRACTOR_POOL[0], GENERIC_JA_DISTRACTOR_POOL[1], GENERIC_JA_DISTRACTOR_POOL[2]]);
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

test('applyWordOrderQuestionsToPendingQuiz replaces only unanswered matching questions', () => {
  const pendingQuestion = {
    word: createWord({
      id: 'word-1',
      english: 'take care',
      japanese: '世話をする',
      distractors: ['守る', '持つ', '作る'],
    }),
    options: ['世話をする', '守る', '持つ', '作る'],
    correctIndex: 0,
  };

  const answeredQuestion = {
    word: createWord({
      id: 'word-2',
      english: 'look up',
      japanese: '調べる',
      distractors: ['見る', '上げる', '探す'],
    }),
    options: ['調べる', '見る', '上げる', '探す'],
    correctIndex: 0,
  };

  const nextQuestions = applyWordOrderQuestionsToPendingQuiz(
    [answeredQuestion, pendingQuestion],
    [
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
    ],
    0,
    identityShuffle,
  );

  assert.notEqual(nextQuestions[0]?.type, 'word-order');
  assert.equal(nextQuestions[1]?.type, 'word-order');
  assert.deepEqual(nextQuestions[1]?.options, ['take', 'care', 'hold', 'keep', 'watch']);
});

test('applyWordOrderQuestionsToPendingQuiz inserts delivered current legacy fallback after the active slot', () => {
  const currentQuestion = {
    word: createWord({
      id: 'word-1',
      english: 'take care',
      japanese: '世話をする',
      distractors: ['守る', '持つ', '作る'],
    }),
    options: ['世話をする', '守る', '持つ', '作る'],
    correctIndex: 0,
  };

  const nextQuestions = applyWordOrderQuestionsToPendingQuiz(
    [currentQuestion],
    [
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
    ],
    0,
    identityShuffle,
  );

  assert.equal(nextQuestions.length, 2);
  assert.notEqual(nextQuestions[0]?.type, 'word-order');
  assert.equal(nextQuestions[1]?.type, 'word-order');
});

test('applyWordOrderQuestionsToPendingQuiz inserts newly generated word-order question without multiple-choice fallback', () => {
  const nextQuestions = applyWordOrderQuestionsToPendingQuiz(
    [],
    [
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
    ],
    0,
    identityShuffle,
  );

  assert.equal(nextQuestions.length, 1);
  assert.equal(nextQuestions[0]?.type, 'word-order');
  assert.deepEqual(nextQuestions[0]?.options, ['take', 'care', 'hold', 'keep', 'watch']);
});

test('applyWordOrderQuestionsToPendingQuiz does not replace active multi-word questions', () => {
  const currentQuestion = {
    word: createWord({
      id: 'word-1',
      english: 'take care',
      japanese: '世話をする',
      vocabularyType: 'active',
      distractors: ['守る', '持つ', '作る'],
    }),
    options: ['世話をする', '守る', '持つ', '作る'],
    correctIndex: 0,
  };

  const nextQuestions = applyWordOrderQuestionsToPendingQuiz(
    [currentQuestion],
    [
      createWord({
        id: 'word-1',
        english: 'take care',
        japanese: '世話をする',
        vocabularyType: 'active',
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
    ],
    0,
    identityShuffle,
  );

  assert.equal(nextQuestions.length, 1);
  assert.notEqual(nextQuestions[0]?.type, 'word-order');
  assert.equal(nextQuestions[0]?.word.vocabularyType, 'active');
});
