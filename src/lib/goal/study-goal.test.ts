import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCalendarMonth,
  buildGoalDailyQuizHref,
  buildGoalReviewQuizHref,
  resolveTodayStudy,
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

test('buildGoalDailyQuizHref は単語帳をまたいで学習モードで 10 問飛ばし、戻り先を from に持たせる', () => {
  assert.equal(buildGoalDailyQuizHref('/goal'), '/quiz/all?learn=1&count=10&from=%2Fgoal');
});

test('describeGoalProjectTitles は1冊ならそのまま、複数なら先頭+件数にする', () => {
  assert.equal(describeGoalProjectTitles(['英検準1級']), '英検準1級');
  assert.equal(describeGoalProjectTitles(['英検準1級', 'TOEIC']), '英検準1級ほか1冊');
  assert.equal(describeGoalProjectTitles(['英検準1級', 'TOEIC', 'IELTS']), '英検準1級ほか2冊');
});

test('クイズへのリンクはホームから開けばホームへ戻す', () => {
  assert.equal(buildGoalDailyQuizHref('/'), '/quiz/all?learn=1&count=10&from=%2F');
  assert.equal(buildGoalReviewQuizHref('/'), '/quiz/all?review=1&from=%2F');
});

test('resolveTodayStudy は目標が無ければ今日の復習を返す', () => {
  const projects = [{ id: 'a', title: '英検準1級', totalWords: 30 }];
  assert.deepEqual(
    resolveTodayStudy({ goal: null, projects, dueCount: 7, today: new Date(2026, 9, 14) }),
    { kind: 'review', dueCount: 7 },
  );
});

test('resolveTodayStudy は目標の単語帳が全部消えていたら今日の復習に倒す', () => {
  const projects = [{ id: 'a', title: '英検準1級', totalWords: 30 }];
  assert.deepEqual(
    resolveTodayStudy({ goal: { projectIds: ['gone'], targetDate: '2026-10-21' }, projects, dueCount: 3, today: null }),
    { kind: 'review', dueCount: 3 },
  );
});

test('resolveTodayStudy は目標があれば目標の今日の10問に切り替える', () => {
  const projects = [
    { id: 'a', title: '英検準1級', totalWords: 4 },
    { id: 'b', title: 'ターゲット1900', totalWords: 3 },
    { id: 'c', title: '関係ない本', totalWords: 100 },
  ];
  assert.deepEqual(
    resolveTodayStudy({
      goal: { projectIds: ['a', 'b', 'gone'], targetDate: '2026-10-21' },
      projects,
      dueCount: 50,
      today: new Date(2026, 9, 14, 22, 0),
    }),
    { kind: 'goal', projectIds: ['a', 'b'], title: '英検準1級ほか1冊', remainingDays: 7, questionCount: 7 },
  );
});
