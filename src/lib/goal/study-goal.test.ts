import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOAL_DAILY_QUIZ_HREF,
  buildCalendarMonth,
  daysUntil,
  describeGoalCountdown,
  describeGoalProjectTitles,
  parseLocalDateKey,
  toLocalDateKey,
} from './study-goal';

test('toLocalDateKey はローカル日付で YYYY-MM-DD を作る', () => {
  assert.equal(toLocalDateKey(new Date(2026, 8, 19, 1, 30)), '2026-09-19');
  assert.equal(toLocalDateKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('parseLocalDateKey は存在しない日付や形式違いを弾く', () => {
  assert.equal(parseLocalDateKey('2026-02-30'), null);
  assert.equal(parseLocalDateKey('2026/09/19'), null);
  assert.equal(parseLocalDateKey('2026-09-19')?.getDate(), 19);
});

test('daysUntil は日付の差だけを数える (時刻は無視)', () => {
  const today = new Date(2026, 8, 19, 23, 59);
  assert.equal(daysUntil('2026-09-26', today), 7);
  assert.equal(daysUntil('2026-09-19', today), 0);
  assert.equal(daysUntil('2026-09-17', today), -2);
  assert.equal(daysUntil('2026-10-01', new Date(2026, 8, 19, 0, 0)), 12);
  assert.equal(daysUntil('bad', today), null);
});

test('describeGoalCountdown は残り日数で文言を切り替える', () => {
  assert.equal(describeGoalCountdown('英検準1級', 7), '英検準1級まであと7日');
  assert.equal(describeGoalCountdown('英検準1級', 0), '英検準1級は今日が目標日！');
  assert.equal(describeGoalCountdown('英検準1級', -3), '英検準1級の目標日から3日経過');
});

test('buildCalendarMonth は月曜はじまりで 42 セルを返す', () => {
  // 2026年9月1日は火曜 → 先頭に月曜ぶんの空白が1つ
  const cells = buildCalendarMonth(2026, 8);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].day, null);
  assert.equal(cells[1].day, 1);
  assert.equal(cells[1].key, '2026-09-01');
  assert.equal(cells[30].day, 30);
  assert.equal(cells[31].day, null);
});

test('buildCalendarMonth は月曜はじまりの月に空白を入れない', () => {
  // 2026年6月1日は月曜
  const cells = buildCalendarMonth(2026, 5);
  assert.equal(cells[0].day, 1);
  assert.equal(cells[29].day, 30);
});

test('GOAL_DAILY_QUIZ_HREF は単語帳をまたいで学習モードで 10 問飛ばし、戻り先に /goal を持たせる', () => {
  assert.equal(GOAL_DAILY_QUIZ_HREF, '/quiz/all?learn=1&count=10&from=%2Fgoal');
});

test('describeGoalProjectTitles は1冊ならそのまま、複数なら先頭+件数にする', () => {
  assert.equal(describeGoalProjectTitles(['英検準1級']), '英検準1級');
  assert.equal(describeGoalProjectTitles(['英検準1級', 'TOEIC']), '英検準1級ほか1冊');
  assert.equal(describeGoalProjectTitles(['英検準1級', 'TOEIC', 'IELTS']), '英検準1級ほか2冊');
});
