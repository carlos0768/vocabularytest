import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BATTLE_BOT_LEVELS,
  BATTLE_BOT_MIN_BUZZ_MS,
  BATTLE_BOT_PROFILES,
  buildBattleBotPlans,
  getBattleBotName,
  isBattleBotLevel,
} from '@/lib/battle/bot';
import type { BattleGeneratedQuestion } from '@/lib/battle/types';

function question(roundIndex: number, correctIndex = 0): BattleGeneratedQuestion {
  return {
    roundIndex,
    prompt: `word-${roundIndex}`,
    choices: ['正解', '誤答1', '誤答2', '誤答3'],
    correctIndex,
    answer: '正解',
    sourceUserId: 'host',
  };
}

/** 1問につき「見送り → 押す時刻 → 正解するか → どの誤答か」の4回を引く。 */
function rolls(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

test('plans one round per question, keeping the round order', () => {
  const plans = buildBattleBotPlans(
    [question(0), question(1), question(2)],
    'normal',
    15_000,
    rolls([0.5]),
  );

  assert.deepEqual(plans.map((plan) => plan.roundIndex), [0, 1, 2]);
});

test('answers correctly when the accuracy roll is under the profile accuracy', () => {
  const [plan] = buildBattleBotPlans(
    [question(0, 2)],
    'hard',
    15_000,
    // 見送らない / 押す時刻は中央 / 正解する / (未使用)
    rolls([0.9, 0.5, 0.0, 0.0]),
  );

  assert.equal(plan.willAnswer, true);
  assert.equal(plan.choiceIndex, 2);
});

test('picks a wrong choice -- never the answer -- when the accuracy roll misses', () => {
  const [plan] = buildBattleBotPlans(
    [question(0, 2)],
    'easy',
    15_000,
    // 見送らない / 押す時刻は中央 / 外す / 3つの誤答のうち最後
    rolls([0.9, 0.5, 0.99, 0.99]),
  );

  assert.equal(plan.willAnswer, true);
  assert.notEqual(plan.choiceIndex, 2);
  assert.ok(plan.choiceIndex >= 0 && plan.choiceIndex <= 3);
});

test('skips the round entirely when the pass roll is under the pass rate', () => {
  const [plan] = buildBattleBotPlans(
    [question(0)],
    'easy',
    15_000,
    rolls([0.0, 0.5, 0.0, 0.0]),
  );

  assert.equal(plan.willAnswer, false);
});

test('never buzzes instantly, so the player always gets a chance', () => {
  for (const level of BATTLE_BOT_LEVELS) {
    const [plan] = buildBattleBotPlans([question(0)], level, 15_000, rolls([0.9, 0, 0, 0]));
    assert.ok(
      plan.buzzAtMs >= BATTLE_BOT_MIN_BUZZ_MS,
      `${level} buzzed at ${plan.buzzAtMs}ms`,
    );
  }
});

test('keeps the buzz inside the round even at the shortest round duration', () => {
  const roundDurationMs = 3_000;

  for (const level of BATTLE_BOT_LEVELS) {
    const plans = buildBattleBotPlans(
      [question(0), question(1)],
      level,
      roundDurationMs,
      rolls([0.9, 1, 0, 0]),
    );

    for (const plan of plans) {
      assert.ok(
        plan.buzzAtMs < roundDurationMs,
        `${level} planned to buzz at ${plan.buzzAtMs}ms of a ${roundDurationMs}ms round`,
      );
    }
  }
});

test('a stronger bot is never slower than a weaker one', () => {
  const latest = (level: (typeof BATTLE_BOT_LEVELS)[number]) =>
    buildBattleBotPlans([question(0)], level, 15_000, rolls([0.9, 1, 0, 0]))[0].buzzAtMs;

  assert.ok(latest('hard') < latest('normal'));
  assert.ok(latest('normal') < latest('easy'));
  assert.ok(BATTLE_BOT_PROFILES.hard.accuracy > BATTLE_BOT_PROFILES.easy.accuracy);
});

test('no questions means no plans', () => {
  assert.deepEqual(buildBattleBotPlans([], 'normal', 15_000), []);
});

test('level guard rejects anything outside the three levels', () => {
  assert.equal(isBattleBotLevel('normal'), true);
  assert.equal(isBattleBotLevel('nightmare'), false);
  assert.equal(isBattleBotLevel(null), false);
});

test('every level has a display name', () => {
  for (const level of BATTLE_BOT_LEVELS) {
    assert.ok(getBattleBotName(level).length > 0);
  }
});
