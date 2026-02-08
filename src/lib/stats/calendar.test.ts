import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarGrid,
  calculateCalendarSummary,
  getIntensity,
  getSelectedDayDetail,
  type CalendarDayCell,
} from './calendar';

function createCell(date: string, quizCount: number, correctCount: number): CalendarDayCell {
  return {
    date,
    quizCount,
    correctCount,
    intensity: getIntensity(quizCount),
    isToday: false,
  };
}

test('buildCalendarGrid returns a fixed 12-week grid (7x12)', () => {
  const today = new Date('2026-02-11T12:00:00.000Z');
  const history = [
    { date: '2026-02-10', quizCount: 2, correctCount: 1 },
    { date: '2026-02-11', quizCount: 4, correctCount: 3 },
  ];

  const grid = buildCalendarGrid(history, 12, today);
  const cells = grid.flat().filter((cell) => cell.date);

  assert.equal(grid.length, 7);
  assert.equal(grid[0].length, 12);
  assert.equal(cells.length, 84);

  const todayCell = cells.find((cell) => cell.date === '2026-02-11');
  assert.ok(todayCell);
  assert.equal(todayCell?.quizCount, 4);
  assert.equal(todayCell?.correctCount, 3);
});

test('calculateCalendarSummary computes streak and week metrics correctly', () => {
  const cells = [
    createCell('2026-02-01', 0, 0),
    createCell('2026-02-02', 1, 1),
    createCell('2026-02-03', 1, 1),
    createCell('2026-02-04', 1, 1),
    createCell('2026-02-05', 1, 1),
    createCell('2026-02-06', 1, 1),
    createCell('2026-02-07', 1, 1),
    createCell('2026-02-08', 2, 1),
    createCell('2026-02-09', 0, 0),
    createCell('2026-02-10', 3, 2),
    createCell('2026-02-11', 1, 1),
  ];

  const summary = calculateCalendarSummary(cells, '2026-02-11');

  assert.equal(summary.currentStreak, 2);
  assert.equal(summary.bestStreak, 7);
  assert.equal(summary.thisWeekActiveDays, 3);
  assert.equal(summary.thisWeekQuizCount, 6);
  assert.equal(summary.todayQuizCount, 1);
  assert.equal(summary.todayCorrectRate, 100);
});

test('getSelectedDayDetail returns correct values for active and empty dates', () => {
  const cells = [
    createCell('2026-02-10', 4, 3),
    createCell('2026-02-11', 0, 0),
  ];

  const active = getSelectedDayDetail(cells, '2026-02-10');
  assert.equal(active.quizCount, 4);
  assert.equal(active.correctRate, 75);
  assert.equal(active.statusLabel, '学習あり');

  const empty = getSelectedDayDetail(cells, '2026-02-12');
  assert.equal(empty.quizCount, 0);
  assert.equal(empty.correctRate, 0);
  assert.equal(empty.statusLabel, '学習なし');
});

test('getIntensity maps thresholds to five levels', () => {
  assert.equal(getIntensity(0), 0);
  assert.equal(getIntensity(1), 1);
  assert.equal(getIntensity(5), 1);
  assert.equal(getIntensity(6), 2);
  assert.equal(getIntensity(15), 2);
  assert.equal(getIntensity(16), 3);
  assert.equal(getIntensity(30), 3);
  assert.equal(getIntensity(31), 4);
});
