import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStudyReminderDeliveryKey,
  getDueStudyReminderTimes,
  getLocalDateTimeParts,
  getStudyReminderPeriod,
  isValidStudyReminderTimeValue,
  normalizeStudyReminderTimes,
} from './study-reminders';

test('validates HH:MM reminder time values', () => {
  assert.equal(isValidStudyReminderTimeValue('08:00'), true);
  assert.equal(isValidStudyReminderTimeValue('16:30'), true);
  assert.equal(isValidStudyReminderTimeValue('24:00'), false);
  assert.equal(isValidStudyReminderTimeValue('8:00'), false);
});

test('normalizes reminder times and falls back to defaults', () => {
  assert.deepEqual(normalizeStudyReminderTimes([
    { id: 'one', time: '09:15', enabled: true },
    { id: 'bad', time: '99:99', enabled: true },
    { id: 'one', time: '10:00', enabled: true },
  ]), [
    { id: 'one', time: '09:15', enabled: true },
  ]);

  assert.deepEqual(
    normalizeStudyReminderTimes([]).map((item) => item.time),
    ['08:00', '16:30'],
  );
});

test('detects due reminders for the current local minute', () => {
  const times = normalizeStudyReminderTimes([
    { id: 'morning', time: '08:00', enabled: true },
    { id: 'off', time: '08:00', enabled: false },
    { id: 'evening', time: '16:30', enabled: true },
  ]);

  assert.deepEqual(getDueStudyReminderTimes(times, '08:00').map((item) => item.id), ['morning']);
  assert.deepEqual(getDueStudyReminderTimes(times, '08:01'), []);
});

test('formats local date time parts in the configured timezone', () => {
  const date = new Date('2026-05-31T23:00:00.000Z');
  assert.deepEqual(getLocalDateTimeParts(date, 'Asia/Tokyo'), {
    dateKey: '2026-06-01',
    time: '08:00',
  });
});

test('creates delivery keys and period labels', () => {
  assert.equal(
    createStudyReminderDeliveryKey({
      timeZone: 'Asia/Tokyo',
      localDateKey: '2026-06-01',
      reminderTime: '16:30',
    }),
    'Asia/Tokyo:2026-06-01:16:30',
  );
  assert.equal(getStudyReminderPeriod('16:30').label, '夕方');
});
