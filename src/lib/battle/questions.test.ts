import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BATTLE_GENERIC_DISTRACTORS,
  buildBattleQuestions,
  selectBattleWords,
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

test('selectBattleWords stops at the limit', () => {
  const selected = selectBattleWords(makeWords('host', 10, 'h'), 4);

  assert.deepEqual(selected.map((item) => item.id), ['h0', 'h1', 'h2', 'h3']);
});

test('selectBattleWords asks a headword only once', () => {
  const words = [
    word('h0', 'host', 'apple', 'りんご'),
    word('h1', 'host', 'Apple', 'アップル'),
    word('h2', 'host', 'banana', 'バナナ'),
  ];

  const selected = selectBattleWords(words, 10);

  assert.deepEqual(selected.map((item) => item.english), ['apple', 'banana']);
});

test('selectBattleWords skips words missing english or japanese', () => {
  const words = [
    word('h0', 'host', '  ', 'りんご'),
    word('h1', 'host', 'pear', '   '),
    word('h2', 'host', 'banana', 'バナナ'),
  ];

  const selected = selectBattleWords(words, 10);

  assert.deepEqual(selected.map((item) => item.id), ['h2']);
});

test('buildBattleQuestions stops at the requested question count', () => {
  const questions = buildBattleQuestions(makeWords('host', 20, 'h'), 10, identityShuffle);

  assert.equal(questions.length, 10);
  assert.deepEqual(questions.map((item) => item.roundIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('buildBattleQuestions asks only the host wordbook', () => {
  const questions = buildBattleQuestions(makeWords('host', 10, 'h'), 10, identityShuffle);

  const owners = new Set(questions.map((item) => item.sourceUserId));
  assert.deepEqual([...owners], ['host']);
});

test('buildBattleQuestions produces four choices containing the answer at correctIndex', () => {
  const questions = buildBattleQuestions(makeWords('host', 6, 'h'), 4, identityShuffle);

  for (const question of questions) {
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices[question.correctIndex], question.answer);
    assert.equal(new Set(question.choices).size, 4, 'choices must be unique');
  }
});

test('buildBattleQuestions prefers the word own distractors', () => {
  const host = [
    word('h0', 'host', 'apple', 'りんご', ['みかん', 'ぶどう', 'もも']),
    word('h1', 'host', 'banana', 'バナナ', ['いちご', 'すいか', 'なし']),
  ];

  const [question] = buildBattleQuestions(host, 1, identityShuffle);

  assert.equal(question.answer, 'りんご');
  assert.deepEqual(question.choices, ['りんご', 'みかん', 'ぶどう', 'もも']);
});

test('buildBattleQuestions never uses the answer as a distractor', () => {
  const host = [word('h0', 'host', 'apple', 'りんご', ['りんご', 'リンゴ', 'みかん', 'ぶどう'])];

  const [question] = buildBattleQuestions(host, 1, identityShuffle);

  const answerOccurrences = question.choices.filter(
    (choice) => choice.trim().toLowerCase() === question.answer.trim().toLowerCase(),
  );
  assert.equal(answerOccurrences.length, 1);
});

test('buildBattleQuestions fills distractors from the rest of the host wordbook', () => {
  const host = makeWords('host', 6, 'h');

  const [question] = buildBattleQuestions(host, 1, identityShuffle);

  assert.equal(question.answer, 'h訳0');
  assert.deepEqual(question.choices, ['h訳0', 'h訳1', 'h訳2', 'h訳3']);
});

test('buildBattleQuestions falls back to generic distractors for a tiny wordbook', () => {
  const host = [word('h0', 'host', 'apple', 'りんご')];

  const [question] = buildBattleQuestions(host, 1, identityShuffle);

  const fillers = question.choices.filter((choice) =>
    (BATTLE_GENERIC_DISTRACTORS as readonly string[]).includes(choice),
  );
  assert.equal(question.choices.length, 4);
  assert.equal(fillers.length, 3);
});

test('buildBattleQuestions returns fewer questions than requested when words run out', () => {
  const questions = buildBattleQuestions(makeWords('host', 3, 'h'), 10, identityShuffle);

  assert.equal(questions.length, 3);
});
