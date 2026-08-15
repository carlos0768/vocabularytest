import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoundActionScheduler,
  type RoundActionTimers,
} from '@/lib/battle/round-action-scheduler';

/** Minimal manual clock: `advance` runs whatever is due, in scheduled order. */
function createFakeClock() {
  let nextId = 1;
  let currentTime = 0;
  const pending = new Map<number, { dueAt: number; handler: () => void }>();

  const timers: RoundActionTimers = {
    setTimeout: (handler, timeoutMs) => {
      const id = nextId++;
      pending.set(id, { dueAt: currentTime + timeoutMs, handler });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };

  const advance = (ms: number) => {
    const target = currentTime + ms;
    for (;;) {
      const due = [...pending.entries()]
        .filter(([, entry]) => entry.dueAt <= target)
        .sort((a, b) => a[1].dueAt - b[1].dueAt)[0];
      if (!due) break;
      const [id, entry] = due;
      pending.delete(id);
      currentTime = entry.dueAt;
      entry.handler();
    }
    currentTime = target;
  };

  return { timers, advance, pendingCount: () => pending.size };
}

/** Lets the promise callbacks inside the scheduler run before we assert. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function createHarness(options?: { landsOn?: number }) {
  const clock = createFakeClock();
  const sent: number[] = [];
  const settled: number[] = [];
  let attempts = 0;

  const scheduler = createRoundActionScheduler({
    delayMs: 2_000,
    retryMs: 1_000,
    maxRetries: 3,
    send: async (round) => {
      sent.push(round);
      attempts += 1;
      return options?.landsOn === undefined || attempts >= options.landsOn;
    },
    onSettled: (round) => { settled.push(round); },
    timers: clock.timers,
  });

  return { clock, scheduler, sent, settled };
}

test('sends the round action once the delay elapses', async () => {
  const { clock, scheduler, sent, settled } = createHarness();

  scheduler.request(0);
  assert.deepEqual(sent, [], 'nothing should go out during the reveal pause');

  clock.advance(2_000);
  await flush();

  assert.deepEqual(sent, [0]);
  assert.deepEqual(settled, [0]);
});

test('repeat requests for the same round do not re-send it', async () => {
  const { clock, scheduler, sent } = createHarness();

  // Stands in for the re-renders caused by realtime events and the reconcile
  // poll: each one re-runs the requesting effect while the pause is still open.
  scheduler.request(0);
  scheduler.request(0);
  scheduler.request(0);

  clock.advance(2_000);
  await flush();

  assert.deepEqual(sent, [0], 'the pause must survive repeat requests');
});

test('a request during the pause does not cancel the pending send', async () => {
  // This is the regression: the advance used to live in an effect whose cleanup
  // fired on every refresh, so the reveal timer was cleared and never rearmed,
  // freezing the battle on the first answered question.
  const { clock, scheduler, sent } = createHarness();

  scheduler.request(0);
  clock.advance(1_900);
  scheduler.request(0);
  clock.advance(100);
  await flush();

  assert.deepEqual(sent, [0], 'the send must still fire on schedule');
});

test('retries a send that does not land, then settles', async () => {
  const { clock, scheduler, sent, settled } = createHarness({ landsOn: 3 });

  scheduler.request(4);
  clock.advance(2_000);
  await flush();
  assert.deepEqual(sent, [4], 'first attempt');
  assert.deepEqual(settled, [], 'a failed call must not settle the round');

  clock.advance(1_000);
  await flush();
  assert.deepEqual(sent, [4, 4], 'retried after the retry delay');

  clock.advance(1_000);
  await flush();
  assert.deepEqual(sent, [4, 4, 4]);
  assert.deepEqual(settled, [4], 'settles once the call lands');
});

test('gives up after the retry budget and settles anyway', async () => {
  const { clock, scheduler, sent, settled } = createHarness({ landsOn: 99 });

  scheduler.request(1);
  clock.advance(2_000);
  await flush();
  for (let i = 0; i < 5; i += 1) {
    clock.advance(1_000);
    await flush();
  }

  assert.equal(sent.length, 4, 'first attempt plus maxRetries, and no more');
  assert.deepEqual(settled, [1]);
});

test('a newer round supersedes a pending one', async () => {
  const { clock, scheduler, sent } = createHarness();

  scheduler.request(0);
  clock.advance(500);
  scheduler.request(1);
  clock.advance(2_000);
  await flush();

  assert.deepEqual(sent, [1], 'only the current round is pushed');
});

test('a late reply for a superseded round does not settle the new one', async () => {
  const clock = createFakeClock();
  const settled: number[] = [];
  const replies: Array<(landed: boolean) => void> = [];

  const scheduler = createRoundActionScheduler({
    delayMs: 0,
    retryMs: 1_000,
    maxRetries: 3,
    send: () => new Promise<boolean>((resolve) => { replies.push(resolve); }),
    onSettled: (round) => { settled.push(round); },
    timers: clock.timers,
  });

  scheduler.request(0);
  clock.advance(0);
  scheduler.request(1);
  clock.advance(0);

  replies[0]?.(true);
  await flush();

  assert.deepEqual(settled, [], 'the stale reply is dropped');

  replies[1]?.(true);
  await flush();
  assert.deepEqual(settled, [1]);
});

test('cancel stops a pending send and any later request', async () => {
  const { clock, scheduler, sent } = createHarness();

  scheduler.request(0);
  scheduler.cancel();
  clock.advance(2_000);
  await flush();

  scheduler.request(1);
  clock.advance(2_000);
  await flush();

  assert.deepEqual(sent, [], 'a cancelled scheduler is inert');
  assert.equal(clock.pendingCount(), 0, 'no timer is left behind');
});

test('cancel after the send suppresses the settle callback', async () => {
  const clock = createFakeClock();
  const settled: number[] = [];
  const replies: Array<(landed: boolean) => void> = [];

  const scheduler = createRoundActionScheduler({
    delayMs: 0,
    retryMs: 1_000,
    maxRetries: 3,
    send: () => new Promise<boolean>((resolve) => { replies.push(resolve); }),
    onSettled: (round) => { settled.push(round); },
    timers: clock.timers,
  });

  scheduler.request(0);
  clock.advance(0);
  scheduler.cancel();
  replies[0]?.(true);
  await flush();

  assert.deepEqual(settled, [], 'an unmounted room must not be refreshed');
});

test('a zero delay sends on the next timer turn, not synchronously', async () => {
  const clock = createFakeClock();
  const sent: number[] = [];

  const scheduler = createRoundActionScheduler({
    delayMs: 0,
    retryMs: 1_000,
    maxRetries: 0,
    send: async (round) => { sent.push(round); return true; },
    onSettled: () => {},
    timers: clock.timers,
  });

  scheduler.request(7);
  assert.deepEqual(sent, []);

  clock.advance(0);
  await flush();
  assert.deepEqual(sent, [7]);
});
