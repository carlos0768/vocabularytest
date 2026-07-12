import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EIKEN_LEVEL_LABELS,
  LEVEL_TEST_QUESTION_COUNT,
  LEVEL_TEST_START_LEVEL,
  MAX_LEVEL_INDEX,
  MIN_LEVEL_INDEX,
  VOCAB_SIZE_BY_LEVEL,
  answerQuestion,
  buildQuestion,
  buildResult,
  createInitialState,
  isFinished,
  pickQuestionIndex,
  usedKeyFor,
  type LevelTestState,
} from './engine';
import type { LevelTestBank } from './bank';

function answerMany(state: LevelTestState, answers: boolean[]): LevelTestState {
  let current = state;
  for (const correct of answers) {
    current = answerQuestion(current, correct).state;
  }
  return current;
}

test('createInitialState starts at 英検4級 with firstAtLevel armed', () => {
  const state = createInitialState();
  assert.equal(state.levelIndex, LEVEL_TEST_START_LEVEL);
  assert.equal(state.firstAtLevel, true);
  assert.equal(state.answeredCount, 0);
  assert.equal(state.wrongStreak, 0);
  assert.equal(state.askedByLevel.length, 7);
  assert.equal(EIKEN_LEVEL_LABELS.length, 7);
  assert.equal(VOCAB_SIZE_BY_LEVEL.length, 7);
});

test('two consecutive correct answers level up and re-arm firstAtLevel', () => {
  const state = createInitialState(1);

  const first = answerQuestion(state, true);
  assert.deepEqual(first.events, ['correct']);
  assert.equal(first.state.levelIndex, 1);
  assert.equal(first.state.streak, 1);

  const second = answerQuestion(first.state, true);
  assert.deepEqual(second.events, ['correct', 'level-up']);
  assert.equal(second.state.levelIndex, 2);
  assert.equal(second.state.streak, 0);
  assert.equal(second.state.firstAtLevel, true);
  assert.equal(second.state.maxLevelIndex, 2);
});

test('wrong on the first question after a level-up drops one level', () => {
  let state = createInitialState(1);
  state = answerMany(state, [true, true]); // -> level 2, firstAtLevel
  const dropped = answerQuestion(state, false);
  assert.deepEqual(dropped.events, ['wrong', 'level-down']);
  assert.equal(dropped.state.levelIndex, 1);
  // 降格直後の誤答1回では連鎖降格しない(wrongStreakは降格でリセット)
  const again = answerQuestion(dropped.state, false);
  assert.deepEqual(again.events, ['wrong']);
  assert.equal(again.state.levelIndex, 1);
  // ただしそこからさらに誤答が続く(2連続誤答)と降格する
  const cascade = answerQuestion(again.state, false);
  assert.deepEqual(cascade.events, ['wrong', 'level-down']);
  assert.equal(cascade.state.levelIndex, 0);
});

test('wrong on the very first question drops from the start level', () => {
  const state = createInitialState(1);
  const result = answerQuestion(state, false);
  assert.deepEqual(result.events, ['wrong', 'level-down']);
  assert.equal(result.state.levelIndex, 0);
});

test('a single non-first wrong answer keeps the level and resets the streak', () => {
  let state = createInitialState(1);
  state = answerQuestion(state, true).state; // streak 1, firstAtLevel consumed
  const wrong = answerQuestion(state, false);
  assert.deepEqual(wrong.events, ['wrong']);
  assert.equal(wrong.state.levelIndex, 1);
  assert.equal(wrong.state.streak, 0);
  assert.equal(wrong.state.wrongStreak, 1);
});

test('two consecutive wrong answers at the same level drop one level', () => {
  let state = createInitialState(1);
  state = answerQuestion(state, true).state; // firstAtLevel consumed
  const first = answerQuestion(state, false);
  assert.deepEqual(first.events, ['wrong']);
  const second = answerQuestion(first.state, false);
  assert.deepEqual(second.events, ['wrong', 'level-down']);
  assert.equal(second.state.levelIndex, 0);
  assert.equal(second.state.wrongStreak, 0);

  // 間に正解を挟むと連続誤答カウントはリセットされる
  let mixed = createInitialState(1);
  mixed = answerQuestion(mixed, true).state;
  mixed = answerQuestion(mixed, false).state; // wrongStreak 1
  mixed = answerQuestion(mixed, true).state; // reset
  const afterReset = answerQuestion(mixed, false);
  assert.deepEqual(afterReset.events, ['wrong']);
  assert.equal(afterReset.state.levelIndex, 1);
});

test('level floor: wrong answers at level 0 never drop below 0', () => {
  let state = createInitialState(0);
  state = answerMany(state, [false, false, false]);
  assert.equal(state.levelIndex, MIN_LEVEL_INDEX);
});

test('level ceiling: two consecutive correct at max level sets clearedMax once', () => {
  const state = createInitialState(MAX_LEVEL_INDEX);
  const first = answerQuestion(state, true);
  const second = answerQuestion(first.state, true);
  assert.ok(second.events.includes('max-cleared'));
  assert.equal(second.state.levelIndex, MAX_LEVEL_INDEX);
  assert.equal(second.state.clearedMax, true);

  // 2回目の2連続正解では max-cleared は再発火しない
  const third = answerQuestion(second.state, true);
  const fourth = answerQuestion(third.state, true);
  assert.ok(!fourth.events.includes('max-cleared'));
});

test('a perfect 20-question run from the start level reaches 英検1級 with clearedMax', () => {
  let state = createInitialState();
  for (let i = 0; i < LEVEL_TEST_QUESTION_COUNT; i += 1) {
    state = answerQuestion(state, true).state;
  }
  assert.equal(isFinished(state), true);
  assert.equal(state.levelIndex, MAX_LEVEL_INDEX);
  assert.equal(state.clearedMax, true);

  const result = buildResult(state);
  assert.equal(result.finalLevel, MAX_LEVEL_INDEX);
  assert.equal(result.correctTotal, LEVEL_TEST_QUESTION_COUNT);
  assert.equal(result.askedByLevel.reduce((a, b) => a + b, 0), LEVEL_TEST_QUESTION_COUNT);
});

test('an all-wrong 20-question run ends at level 0', () => {
  let state = createInitialState();
  for (let i = 0; i < LEVEL_TEST_QUESTION_COUNT; i += 1) {
    state = answerQuestion(state, false).state;
  }
  assert.equal(state.levelIndex, MIN_LEVEL_INDEX);
  const result = buildResult(state);
  assert.equal(result.correctTotal, 0);
  assert.equal(result.askedByLevel.reduce((a, b) => a + b, 0), LEVEL_TEST_QUESTION_COUNT);
});

test('a level-up on the final answer does not award an unproven level', () => {
  // 実際に報告されたバグ: 途中で1級に到達→1級の1問を誤答して降格→
  // 最後の2問連続正解で20問目にちょうど再昇格すると、1級で1問も
  // 正解していないのに1級判定になっていた。
  const answers = [
    true, true, // 4級 -> 3級
    true, true, // -> 準2級
    true, true, // -> 2級
    true, true, // -> 準1級
    true, true, // -> 1級
    false, // 1級の1問目を誤答 -> 準1級へ降格
    false, true, false, true, false, true, false, true, true, // 最後の2連続正解で1級へ再昇格
  ];
  assert.equal(answers.length, LEVEL_TEST_QUESTION_COUNT);

  let state = createInitialState();
  state = answerMany(state, answers);
  assert.equal(isFinished(state), true);
  assert.equal(state.levelIndex, MAX_LEVEL_INDEX); // 内部状態としては1級にいる

  const result = buildResult(state);
  assert.equal(result.correctByLevel[MAX_LEVEL_INDEX], 0);
  // 正解実績のない1級ではなく、実績のある準1級で判定される
  assert.equal(result.finalLevel, MAX_LEVEL_INDEX - 1);
  assert.equal(result.maxLevel, MAX_LEVEL_INDEX);
});

test('per-level tallies stay consistent through a mixed run', () => {
  let state = createInitialState();
  const answers = [true, true, false, true, true, false, false, true, true, true,
    true, false, true, true, false, true, true, true, true, false];
  state = answerMany(state, answers);
  assert.equal(isFinished(state), true);

  const result = buildResult(state);
  assert.equal(result.askedByLevel.reduce((a, b) => a + b, 0), LEVEL_TEST_QUESTION_COUNT);
  assert.equal(result.correctTotal, answers.filter(Boolean).length);
  for (let i = 0; i < 7; i += 1) {
    assert.ok(result.correctByLevel[i] <= result.askedByLevel[i]);
  }
  assert.ok(result.maxLevel >= result.finalLevel);
});

const TEST_BANK: LevelTestBank = {
  version: 1,
  levels: Array.from({ length: 7 }, (_, levelIndex) =>
    Array.from({ length: 4 }, (_, wordIndex) => ({
      english: `word-${levelIndex}-${wordIndex}`,
      japanese: `訳${levelIndex}-${wordIndex}`,
      distractors: ['誤1', '誤2', '誤3'] as [string, string, string],
    }))),
};

test('pickQuestionIndex never repeats a used word', () => {
  const used = new Set<string>();
  for (let i = 0; i < 4; i += 1) {
    const picked = pickQuestionIndex(TEST_BANK, 2, used, () => 0.5);
    assert.ok(picked);
    const key = usedKeyFor(picked!.levelIndex, picked!.wordIndex);
    assert.ok(!used.has(key));
    used.add(key);
  }
});

test('pickQuestionIndex falls back to the nearest level when exhausted', () => {
  const used = new Set<string>();
  for (let wordIndex = 0; wordIndex < 4; wordIndex += 1) used.add(usedKeyFor(2, wordIndex));

  const picked = pickQuestionIndex(TEST_BANK, 2, used, () => 0);
  assert.ok(picked);
  // 易しい側(下のレベル)を優先してフォールバックする
  assert.equal(picked!.levelIndex, 1);
});

test('pickQuestionIndex returns null when the whole bank is used', () => {
  const used = new Set<string>();
  for (let levelIndex = 0; levelIndex < 7; levelIndex += 1) {
    for (let wordIndex = 0; wordIndex < 4; wordIndex += 1) used.add(usedKeyFor(levelIndex, wordIndex));
  }
  assert.equal(pickQuestionIndex(TEST_BANK, 3, used), null);
});

test('buildQuestion shuffles four options and tracks the correct index', () => {
  const word = TEST_BANK.levels[0][0];
  const reversed = <T,>(items: T[]): T[] => [...items].reverse();
  const question = buildQuestion(word, reversed);
  assert.equal(question.prompt, word.english);
  assert.equal(question.options.length, 4);
  assert.equal(question.options[question.correctIndex], word.japanese);
});
