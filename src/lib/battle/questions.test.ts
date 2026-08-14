import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BATTLE_GENERIC_DISTRACTORS,
  buildBattleQuestions,
  interleaveSources,
  type ShuffleFn,
} from '@/lib/battle/questions';
import type { BattleSourceWord } from '@/lib/battle/types';

const identityShuffle: ShuffleFn = (items) => [...items];

function word(
  id: string,
  ownerId: string,
  english: string,
  japanese: string,
  distractors: string[] = [],
): BattleSourceWord {
  return { id, ownerId, english, japanese, distractors };
}

function makeWords(ownerId: string, count: number, prefix: string): BattleSourceWord[] {
  return Array.from({ length: count }, (_, index) =>
    word(`${prefix}${index}`, ownerId, `${prefix}word${index}`, `${prefix}訳${index}`),
  );
}

test('interleaveSources alternates between the two wordbooks', () => {
  const host = makeWords('host', 3, 'h');
  const guest = makeWords('guest', 3, 'g');

  const merged = interleaveSources(host, guest, 6);

  assert.deepEqual(
    merged.map((item) => item.ownerId),
    ['host', 'guest', 'host', 'guest', 'host', 'guest'],
  );
});

test('interleaveSources fills from the remaining side once one runs out', () => {
  const host = makeWords('host', 1, 'h');
  const guest = makeWords('guest', 4, 'g');

  const merged = interleaveSources(host, guest, 5);

  assert.deepEqual(
    merged.map((item) => item.ownerId),
    ['host', 'guest', 'guest', 'guest', 'guest'],
  );
});

test('interleaveSources drops duplicate english across the two wordbooks', () => {
  const host = [word('h0', 'host', 'apple', 'りんご')];
  const guest = [word('g0', 'guest', 'Apple', 'アップル'), word('g1', 'guest', 'banana', 'バナナ')];

  const merged = interleaveSources(host, guest, 10);

  assert.deepEqual(
    merged.map((item) => item.english),
    ['apple', 'banana'],
  );
});

test('interleaveSources skips words missing english or japanese', () => {
  const host = [word('h0', 'host', '  ', 'りんご'), word('h1', 'host', 'pear', '   ')];
  const guest = [word('g0', 'guest', 'banana', 'バナナ')];

  const merged = interleaveSources(host, guest, 10);

  assert.deepEqual(merged.map((item) => item.id), ['g0']);
});

test('buildBattleQuestions stops at the requested question count', () => {
  const questions = buildBattleQuestions(
    makeWords('host', 20, 'h'),
    makeWords('guest', 20, 'g'),
    10,
    identityShuffle,
  );

  assert.equal(questions.length, 10);
  assert.deepEqual(questions.map((item) => item.roundIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('buildBattleQuestions draws from both wordbooks', () => {
  const questions = buildBattleQuestions(
    makeWords('host', 10, 'h'),
    makeWords('guest', 10, 'g'),
    10,
    identityShuffle,
  );

  const owners = new Set(questions.map((item) => item.sourceUserId));
  assert.deepEqual([...owners].sort(), ['guest', 'host']);
});

test('buildBattleQuestions produces four choices containing the answer at correctIndex', () => {
  const questions = buildBattleQuestions(
    makeWords('host', 6, 'h'),
    makeWords('guest', 6, 'g'),
    4,
    identityShuffle,
  );

  for (const question of questions) {
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices[question.correctIndex], question.answer);
    assert.equal(new Set(question.choices).size, 4, 'choices must be unique');
  }
});

test('buildBattleQuestions prefers the word own distractors', () => {
  const host = [word('h0', 'host', 'apple', 'りんご', ['みかん', 'ぶどう', 'もも'])];
  const guest = [word('g0', 'guest', 'banana', 'バナナ', ['いちご', 'すいか', 'なし'])];

  const [question] = buildBattleQuestions(host, guest, 1, identityShuffle);

  assert.equal(question.answer, 'りんご');
  assert.deepEqual(question.choices, ['りんご', 'みかん', 'ぶどう', 'もも']);
});

test('buildBattleQuestions never uses the answer as a distractor', () => {
  const host = [word('h0', 'host', 'apple', 'りんご', ['りんご', 'リンゴ', 'みかん', 'ぶどう'])];

  const [question] = buildBattleQuestions(host, [], 1, identityShuffle);

  const answerOccurrences = question.choices.filter(
    (choice) => choice.trim().toLowerCase() === question.answer.trim().toLowerCase(),
  );
  assert.equal(answerOccurrences.length, 1);
});

test('buildBattleQuestions falls back to generic distractors for a tiny pool', () => {
  const host = [word('h0', 'host', 'apple', 'りんご')];

  const [question] = buildBattleQuestions(host, [], 1, identityShuffle);

  const fillers = question.choices.filter((choice) =>
    (BATTLE_GENERIC_DISTRACTORS as readonly string[]).includes(choice),
  );
  assert.equal(question.choices.length, 4);
  assert.equal(fillers.length, 3);
});

test('buildBattleQuestions works when only one side has words', () => {
  const questions = buildBattleQuestions(makeWords('host', 8, 'h'), [], 5, identityShuffle);

  assert.equal(questions.length, 5);
  assert.ok(questions.every((item) => item.sourceUserId === 'host'));
});

test('buildBattleQuestions returns fewer questions than requested when words run out', () => {
  const questions = buildBattleQuestions(
    makeWords('host', 2, 'h'),
    makeWords('guest', 1, 'g'),
    10,
    identityShuffle,
  );

  assert.equal(questions.length, 3);
});
