import test from 'node:test';
import assert from 'node:assert/strict';

import type { MultipleChoiceQuizQuestion, Word, WordOrderQuizQuestion } from '@/types';
import { WORD_ORDER_BLANK_TOKEN } from './word-order';
import {
  buildCompletedWordOrderSentence,
  getUsedWordOrderOptionIndexes,
  getWordOrderExample,
  isMultipleChoiceQuestion,
  isWordOrderQuestion,
  normalizeDisplayText,
  wordOrderTokensMatch,
} from './word-order-answer';

function createWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 'word-1',
    projectId: 'project-1',
    english: 'look forward to',
    japanese: '楽しみにする',
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

function createWordOrderQuestion(overrides: Partial<WordOrderQuizQuestion> = {}): WordOrderQuizQuestion {
  return {
    type: 'word-order',
    word: createWord(),
    sentenceTokens: ['I', WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN, 'it', '.'],
    answerTokens: ['look', 'forward', 'to'],
    decoyTokens: ['for', 'into', 'back'],
    options: ['to', 'look', 'for', 'forward', 'into', 'back'],
    ...overrides,
  };
}

const multipleChoice: MultipleChoiceQuizQuestion = {
  word: createWord(),
  options: ['楽しみにする', 'a', 'b', 'c'],
  correctIndex: 0,
};

test('question guards tell word-order and multiple-choice apart', () => {
  const wordOrder = createWordOrderQuestion();
  assert.equal(isWordOrderQuestion(wordOrder), true);
  assert.equal(isMultipleChoiceQuestion(wordOrder), false);
  assert.equal(isWordOrderQuestion(multipleChoice), false);
  assert.equal(isMultipleChoiceQuestion(multipleChoice), true);
  assert.equal(isWordOrderQuestion(undefined), false);
  assert.equal(isMultipleChoiceQuestion(undefined), false);
});

test('wordOrderTokensMatch ignores case and surrounding spaces but not order', () => {
  assert.equal(wordOrderTokensMatch(['Look', ' forward', 'TO '], ['look', 'forward', 'to']), true);
  assert.equal(wordOrderTokensMatch(['forward', 'look', 'to'], ['look', 'forward', 'to']), false);
  assert.equal(wordOrderTokensMatch(['look', 'forward'], ['look', 'forward', 'to']), false);
});

test('normalizeDisplayText collapses whitespace and maps blank to null', () => {
  assert.equal(normalizeDisplayText('  a   b\n c '), 'a b c');
  assert.equal(normalizeDisplayText('   '), null);
  assert.equal(normalizeDisplayText(null), null);
  assert.equal(normalizeDisplayText(undefined), null);
});

test('buildCompletedWordOrderSentence fills blanks in order and tidies punctuation', () => {
  assert.equal(buildCompletedWordOrderSentence(createWordOrderQuestion()), 'I look forward to it.');
});

test('getWordOrderExample prefers the stored example sentence and translation', () => {
  const question = createWordOrderQuestion({
    word: createWord({ exampleSentence: 'We  look forward to it.', exampleSentenceJa: '楽しみにしています。' }),
  });
  assert.deepEqual(getWordOrderExample(question), {
    sentence: 'We look forward to it.',
    translation: '楽しみにしています。',
  });
});

test('getWordOrderExample falls back to the completed sentence and the word meaning', () => {
  assert.deepEqual(getWordOrderExample(createWordOrderQuestion()), {
    sentence: 'I look forward to it.',
    translation: '楽しみにする',
  });
});

test('getUsedWordOrderOptionIndexes marks one option per selected token, duplicates included', () => {
  const options = ['to', 'look', 'to', 'forward'];
  assert.deepEqual([...getUsedWordOrderOptionIndexes(options, ['TO', 'look'])].sort(), [0, 1]);
  assert.deepEqual([...getUsedWordOrderOptionIndexes(options, ['to', 'to'])].sort(), [0, 2]);
  assert.deepEqual([...getUsedWordOrderOptionIndexes(options, ['missing'])], []);
});
