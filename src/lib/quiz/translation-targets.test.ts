import test from 'node:test';
import assert from 'node:assert/strict';

import type { Word, WordTranslation } from '@/types';
import {
  expandWordForQuizTargets,
  getQuizTargetKey,
  isTranslationQuizTarget,
} from './translation-targets';
import { generateQuizQuestions } from './quiz-state';

const identityShuffle = <T>(items: T[]): T[] => [...items];

function createTranslation(
  overrides: Partial<WordTranslation> & Pick<WordTranslation, 'translationJa'>,
): WordTranslation {
  return {
    normalizedTranslationJa: overrides.translationJa,
    meaningRank: 1,
    position: 0,
    isPrimary: false,
    ...overrides,
  };
}

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

test('expandWordForQuizTargets emits one primary plus one target per distinct translation', () => {
  const word = createWord({
    id: 'word-1',
    english: 'sense',
    japanese: '感覚',
    translations: [
      createTranslation({ translationJa: '感覚', distinctKey: '感覚', isPrimary: true, lexiconSenseIsPrimary: true }),
      createTranslation({ translationJa: '分別', distinctKey: '分別', isPrimary: false }),
    ],
  });

  const targets = expandWordForQuizTargets(word);

  assert.equal(targets.length, 2);
  const primary = targets.find((target) => target.quizTarget?.kind === 'word');
  const distinct = targets.find((target) => isTranslationQuizTarget(target));
  assert.ok(primary, 'primary target should exist');
  assert.ok(distinct, 'distinct translation target should exist');
  assert.equal(primary?.japanese, '感覚');
  assert.equal(distinct?.japanese, '分別');
  // targets are addressed by distinct quiz-target keys
  assert.notEqual(getQuizTargetKey(primary as Word), getQuizTargetKey(distinct as Word));
});

test('primary translations do not produce extra distinct quiz targets', () => {
  const word = createWord({
    id: 'word-2',
    english: 'beautiful',
    japanese: '美しい',
    translations: [
      createTranslation({ translationJa: '美しい', isPrimary: true, lexiconSenseIsPrimary: true }),
    ],
  });

  const targets = expandWordForQuizTargets(word);
  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.quizTarget?.kind, 'word');
});

test('generateQuizQuestions produces a separate question per distinct translation', () => {
  const word = createWord({
    id: 'word-3',
    english: 'sense',
    japanese: '感覚',
    translations: [
      createTranslation({ translationJa: '感覚', distinctKey: '感覚', isPrimary: true, lexiconSenseIsPrimary: true }),
      createTranslation({ translationJa: '分別', distinctKey: '分別', isPrimary: false }),
    ],
  });

  const questions = generateQuizQuestions([word], 10, 'en-to-ja', identityShuffle, {
    preserveOrder: true,
  });

  // one question for the primary meaning and one for the distinct meaning
  const correctAnswers = questions.map((question) => question.options[question.correctIndex]);
  assert.ok(correctAnswers.includes('感覚'), 'primary meaning is quizzed');
  assert.ok(correctAnswers.includes('分別'), 'distinct meaning is quizzed');
  assert.equal(questions.length, 2);
});

test('sense targets use their own distractors instead of the primary meaning ones', () => {
  const word = createWord({
    id: 'word-4',
    english: 'right',
    japanese: '右',
    distractors: ['左', '上', '下'],
    translations: [
      createTranslation({ translationJa: '右', isPrimary: true, lexiconSenseIsPrimary: true }),
      createTranslation({
        translationJa: '権利',
        distinctKey: '権利',
        isPrimary: false,
        distractors: ['義務', '責任', '規則'],
      }),
    ],
  });

  const targets = expandWordForQuizTargets(word);
  const distinct = targets.find((target) => isTranslationQuizTarget(target));

  assert.deepEqual(distinct?.distractors, ['義務', '責任', '規則']);
  // 単語行の例文は主要語義向けなので、語義単位の出題には流用しない
  assert.equal(distinct?.exampleSentence, undefined);
});

test('eikenLevel drops senses that are far below the learner level', () => {
  const word = createWord({
    id: 'word-5',
    english: 'right',
    japanese: '右',
    cefrLevel: 'A1',
    translations: [
      createTranslation({ translationJa: '右', isPrimary: true, lexiconSenseIsPrimary: true, cefrLevel: 'A1' }),
      createTranslation({ translationJa: '権利', distinctKey: '権利', isPrimary: false, cefrLevel: 'B1' }),
    ],
  });

  const targets = expandWordForQuizTargets(word, { eikenLevel: 'pre1' });
  assert.deepEqual(targets.map((target) => target.japanese), ['権利']);

  // 級を指定しない/低い級なら両方の語義を出題する
  assert.equal(expandWordForQuizTargets(word).length, 2);
  assert.equal(expandWordForQuizTargets(word, { eikenLevel: '3' }).length, 2);
});

test('a sense with an unknown level is not judged by the headword level', () => {
  // right（見出し語はA1）の「権利」にCEFRが付いていない場合、見出し語レベルへ
  // フォールバックすると準1級で全語義が落ちてしまう。語義不明は残す。
  const word = createWord({
    id: 'word-6',
    english: 'right',
    japanese: '右',
    cefrLevel: 'A1',
    translations: [
      createTranslation({ translationJa: '右', isPrimary: true, lexiconSenseIsPrimary: true }),
      createTranslation({ translationJa: '権利', distinctKey: '権利', isPrimary: false }),
    ],
  });

  const targets = expandWordForQuizTargets(word, { eikenLevel: 'pre1' });
  assert.deepEqual(targets.map((target) => target.japanese), ['権利']);
});

test('generateQuizQuestions honours the learner eiken level', () => {
  const word = createWord({
    id: 'word-7',
    english: 'right',
    japanese: '右',
    cefrLevel: 'A1',
    translations: [
      createTranslation({ translationJa: '右', isPrimary: true, lexiconSenseIsPrimary: true, cefrLevel: 'A1' }),
      createTranslation({ translationJa: '権利', distinctKey: '権利', isPrimary: false, cefrLevel: 'B1' }),
    ],
  });

  const questions = generateQuizQuestions([word], 10, 'en-to-ja', identityShuffle, {
    preserveOrder: true,
    eikenLevel: 'pre1',
  });

  assert.equal(questions.length, 1);
  assert.equal(questions[0].options[questions[0].correctIndex ?? -1], '権利');
});
