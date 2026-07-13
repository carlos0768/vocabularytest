import test from 'node:test';
import assert from 'node:assert/strict';

import { chargeManualMorphologyCoins } from './manual-morphology-gate';

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function fakeClient(
  responder: (name: string) => { data?: unknown; error?: { message: string } | null },
) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        const result = responder(name);
        return { data: result.data ?? null, error: result.error ?? null };
      },
    } as never,
  };
}

function withFlag(value: string | undefined, fn: () => Promise<void>) {
  return async () => {
    const previous = process.env.COIN_SYSTEM_ENABLED;
    if (value === undefined) {
      delete process.env.COIN_SYSTEM_ENABLED;
    } else {
      process.env.COIN_SYSTEM_ENABLED = value;
    }
    try {
      await fn();
    } finally {
      if (previous === undefined) {
        delete process.env.COIN_SYSTEM_ENABLED;
      } else {
        process.env.COIN_SYSTEM_ENABLED = previous;
      }
    }
  };
}

test('flag off: charges nothing and allows morphology (legacy free behavior)', withFlag(undefined, async () => {
  const { calls, client } = fakeClient(() => ({ data: null }));

  const result = await chargeManualMorphologyCoins(client, 1);

  assert.deepEqual(calls, []); // RPC は呼ばない
  assert.equal(result.charged, true);
  assert.equal(result.coinSystemEnabled, false);
  assert.equal(result.coinInfo, null);
}));

test('flag on + Pro with coins: consumes and returns balance', withFlag('true', async () => {
  const { calls, client } = fakeClient(() => ({
    data: {
      allowed: true,
      is_pro: true,
      cost: 1,
      monthly_remaining: 299,
      purchased_remaining: 0,
      total_remaining: 299,
      monthly_allowance: 300,
    },
  }));

  const result = await chargeManualMorphologyCoins(client, 1);

  assert.deepEqual(calls, [
    { name: 'consume_manual_morphology_coins', args: { p_count: 1 } },
  ]);
  assert.equal(result.charged, true);
  assert.equal(result.coinSystemEnabled, true);
  assert.deepEqual(result.coinInfo, {
    cost: 1,
    monthlyRemaining: 299,
    purchasedRemaining: 0,
    totalRemaining: 299,
    monthlyAllowance: 300,
  });
}));

test('flag on + free user: not charged, morphology skipped', withFlag('true', async () => {
  const { client } = fakeClient(() => ({
    data: { allowed: false, requires_pro: true, is_pro: false, cost: 1 },
  }));

  const result = await chargeManualMorphologyCoins(client, 1);

  assert.equal(result.charged, false);
  assert.equal(result.coinSystemEnabled, true);
  assert.equal(result.coinInfo, null);
}));

test('flag on + insufficient coins: not charged, morphology skipped', withFlag('true', async () => {
  const { client } = fakeClient(() => ({
    data: {
      allowed: false,
      reason: 'insufficient_coins',
      is_pro: true,
      cost: 1,
      total_remaining: 0,
    },
  }));

  const result = await chargeManualMorphologyCoins(client, 1);

  assert.equal(result.charged, false);
  assert.equal(result.coinInfo, null);
}));

test('flag on + RPC error: best-effort, not charged (never blocks the add)', withFlag('true', async () => {
  const { client } = fakeClient(() => ({ error: { message: 'boom' } }));

  const result = await chargeManualMorphologyCoins(client, 1);

  assert.equal(result.charged, false);
  assert.equal(result.coinInfo, null);
}));

test('word count is floored to at least 1', withFlag('true', async () => {
  const { calls, client } = fakeClient(() => ({ data: { allowed: true, cost: 1 } }));

  await chargeManualMorphologyCoins(client, 0);

  assert.equal(calls[0]?.args.p_count, 1);
}));
