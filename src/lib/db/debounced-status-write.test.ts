import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STATUS_WRITE_DEBOUNCE_MS,
  __hasPendingStatusWriteForTests,
  __resetPendingStatusWritesForTests,
  flushAllPendingStatusWrites,
  flushWordStatusWrite,
  scheduleWordStatusWrite,
} from './debounced-status-write';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('DEFAULT_STATUS_WRITE_DEBOUNCE_MS is a sensible positive value', () => {
  assert.ok(DEFAULT_STATUS_WRITE_DEBOUNCE_MS > 0);
  assert.equal(DEFAULT_STATUS_WRITE_DEBOUNCE_MS, 1200);
});

test('single status change flushes after debounce', async () => {
  __resetPendingStatusWritesForTests();
  const calls: Array<{ final: string; original: string }> = [];
  scheduleWordStatusWrite({
    wordId: 'w1',
    currentStatus: 'new',
    newStatus: 'review',
    debounceMs: 30,
    writer: async (final, original) => {
      calls.push({ final, original });
    },
  });
  assert.equal(__hasPendingStatusWriteForTests('w1'), true);
  await sleep(80);
  assert.deepEqual(calls, [{ final: 'review', original: 'new' }]);
  assert.equal(__hasPendingStatusWriteForTests('w1'), false);
});

test('rapid taps collapse into a single write with the latest status', async () => {
  __resetPendingStatusWritesForTests();
  const calls: Array<{ final: string; original: string }> = [];

  // new -> review
  scheduleWordStatusWrite({
    wordId: 'w2',
    currentStatus: 'new',
    newStatus: 'review',
    debounceMs: 40,
    writer: async (f, o) => {
      calls.push({ final: f, original: o });
    },
  });
  await sleep(10);
  // review -> mastered (before first debounce elapses). Caller now sees
  // optimistic 'review' so currentStatus passed in is 'review'; the utility
  // must ignore this and keep the original 'new'.
  scheduleWordStatusWrite({
    wordId: 'w2',
    currentStatus: 'review',
    newStatus: 'mastered',
    debounceMs: 40,
    writer: async (f, o) => {
      calls.push({ final: f, original: o });
    },
  });

  await sleep(80);
  assert.equal(calls.length, 1, 'should collapse into a single write');
  assert.deepEqual(calls[0], { final: 'mastered', original: 'new' });
});

test('cycling back to the original status within the debounce window skips the write', async () => {
  __resetPendingStatusWritesForTests();
  const calls: Array<{ final: string; original: string }> = [];

  scheduleWordStatusWrite({
    wordId: 'w3',
    currentStatus: 'new',
    newStatus: 'review',
    debounceMs: 40,
    writer: async (f, o) => {
      calls.push({ final: f, original: o });
    },
  });
  await sleep(10);
  // user keeps cycling until they land back on 'new'
  scheduleWordStatusWrite({
    wordId: 'w3',
    currentStatus: 'review',
    newStatus: 'mastered',
    debounceMs: 40,
    writer: async (f, o) => {
      calls.push({ final: f, original: o });
    },
  });
  await sleep(10);
  scheduleWordStatusWrite({
    wordId: 'w3',
    currentStatus: 'mastered',
    newStatus: 'new',
    debounceMs: 40,
    writer: async (f, o) => {
      calls.push({ final: f, original: o });
    },
  });

  await sleep(80);
  assert.equal(calls.length, 0, 'no DB write should be performed when user reverts to original');
  assert.equal(__hasPendingStatusWriteForTests('w3'), false);
});

test('independent words do not interfere', async () => {
  __resetPendingStatusWritesForTests();
  const calls: string[] = [];

  scheduleWordStatusWrite({
    wordId: 'a',
    currentStatus: 'new',
    newStatus: 'review',
    debounceMs: 30,
    writer: async (f) => {
      calls.push(`a:${f}`);
    },
  });
  scheduleWordStatusWrite({
    wordId: 'b',
    currentStatus: 'new',
    newStatus: 'mastered',
    debounceMs: 30,
    writer: async (f) => {
      calls.push(`b:${f}`);
    },
  });

  await sleep(80);
  calls.sort();
  assert.deepEqual(calls, ['a:review', 'b:mastered']);
});

test('flushWordStatusWrite immediately triggers the pending write', async () => {
  __resetPendingStatusWritesForTests();
  const calls: string[] = [];

  scheduleWordStatusWrite({
    wordId: 'w4',
    currentStatus: 'new',
    newStatus: 'review',
    debounceMs: 10_000, // long
    writer: async (f) => {
      calls.push(f);
    },
  });
  assert.equal(__hasPendingStatusWriteForTests('w4'), true);
  await flushWordStatusWrite('w4');
  assert.deepEqual(calls, ['review']);
  assert.equal(__hasPendingStatusWriteForTests('w4'), false);
});

test('flushAllPendingStatusWrites drains every word', async () => {
  __resetPendingStatusWritesForTests();
  const calls: string[] = [];

  scheduleWordStatusWrite({
    wordId: 'x',
    currentStatus: 'new',
    newStatus: 'review',
    debounceMs: 10_000,
    writer: async (f) => {
      calls.push(`x:${f}`);
    },
  });
  scheduleWordStatusWrite({
    wordId: 'y',
    currentStatus: 'new',
    newStatus: 'mastered',
    debounceMs: 10_000,
    writer: async (f) => {
      calls.push(`y:${f}`);
    },
  });

  flushAllPendingStatusWrites();
  // flushAllPendingStatusWrites kicks the writes off synchronously; let
  // the microtasks settle.
  await sleep(10);
  calls.sort();
  assert.deepEqual(calls, ['x:review', 'y:mastered']);
  assert.equal(__hasPendingStatusWriteForTests('x'), false);
  assert.equal(__hasPendingStatusWriteForTests('y'), false);
});
