import test from 'node:test';
import assert from 'node:assert/strict';

import type { Word } from '@/types';
import type { ParaphraseMaterial } from './dataset';
import {
  buildParaphraseQuestion,
  generateParaphraseQuestions,
  isParaphraseQuestion,
} from './question';

function word(overrides: Partial<Word> & { id: string; english: string }): Word {
  return {
    projectId: 'p1',
    japanese: '訳',
    distractors: [],
    status: 'new',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    ...overrides,
  } as Word;
}

const identity = <T,>(items: T[]) => [...items];

const plummet: ParaphraseMaterial = {
  headword: 'plummet',
  pos: 'v',
  answers: ['drop', 'decline', 'plunge'],
  distractors: ['wish', 'abuse', 'leaf', 'pioneer', 'gazette', 'candy'],
};

test('正解 1 つと誤答 3 つの 4 択になり、type は paraphrase', () => {
  const question = buildParaphraseQuestion(word({ id: 'w1', english: 'plummet' }), plummet, {
    random: () => 0,
    shuffle: identity,
  });
  assert.ok(question);
  assert.equal(question.type, 'paraphrase');
  assert.equal(question.options.length, 4);
  assert.equal(question.options[question.correctIndex], 'drop');
  assert.ok(isParaphraseQuestion(question));
  // 誤答に正解候補が混ざらない
  for (const answer of plummet.answers) {
    const count = question.options.filter((option) => option === answer).length;
    assert.ok(count <= 1);
  }
});

test('正解は良い順の上位から重みつきで選ぶ (random が大きいほど後ろ)', () => {
  const build = (random: number) =>
    buildParaphraseQuestion(word({ id: 'w1', english: 'plummet' }), plummet, { random: () => random, shuffle: identity });
  assert.equal(build(0.1)!.options[build(0.1)!.correctIndex], 'drop');
  assert.equal(build(0.6)!.options[build(0.6)!.correctIndex], 'decline');
  assert.equal(build(0.95)!.options[build(0.95)!.correctIndex], 'plunge');
});

test('見出し語そのものは正解にも誤答にも出さない', () => {
  const material: ParaphraseMaterial = {
    headword: 'drop',
    pos: 'v',
    answers: ['Drop', 'fall'],
    distractors: ['drop', 'wish', 'abuse', 'leaf'],
  };
  const question = buildParaphraseQuestion(word({ id: 'w1', english: 'Drop ' }), material, {
    random: () => 0,
    shuffle: identity,
  });
  assert.ok(question);
  assert.equal(question.options[question.correctIndex], 'fall');
  assert.ok(!question.options.includes('drop'));
});

test('誤答が 3 つ揃わなければ問題にしない', () => {
  const material: ParaphraseMaterial = {
    headword: 'plummet',
    pos: 'v',
    answers: ['drop'],
    distractors: ['wish', 'abuse'],
  };
  assert.equal(buildParaphraseQuestion(word({ id: 'w1', english: 'plummet' }), material), null);
});

test('材料のある語だけを出題し、同じ見出し語は 1 問にまとめる', () => {
  const words = [
    word({ id: 'w1', english: 'plummet' }),
    word({ id: 'w2', english: 'いとをかし' }),
    word({ id: 'w3', english: 'Plummet', japanese: '(別の訳の行)' }),
    word({ id: 'w4', english: 'deceive' }),
  ];
  const materials = new Map<string, ParaphraseMaterial>([
    ['w1', plummet],
    ['w3', plummet],
    ['w4', { headword: 'deceive', pos: 'v', answers: ['fool', 'betray'], distractors: ['hire', 'plug', 'hate', 'welcome'] }],
  ]);
  const questions = generateParaphraseQuestions(words, materials, 10, {
    preserveOrder: true,
    random: () => 0,
    shuffle: identity,
  });
  assert.deepEqual(questions.map((question) => question.word.id), ['w1', 'w4']);
  assert.ok(questions.every(isParaphraseQuestion));
});

test('count で問題数を切る', () => {
  const words = [word({ id: 'w1', english: 'plummet' }), word({ id: 'w4', english: 'deceive' })];
  const materials = new Map<string, ParaphraseMaterial>([
    ['w1', plummet],
    ['w4', { headword: 'deceive', pos: 'v', answers: ['fool'], distractors: ['hire', 'plug', 'hate'] }],
  ]);
  assert.equal(generateParaphraseQuestions(words, materials, 1, { preserveOrder: true }).length, 1);
});
