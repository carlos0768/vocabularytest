import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeScanGate } from './scan-gate';

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function fakeClient(responder: (name: string) => { data?: unknown; error?: { message: string; code?: string } | null }) {
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

test('flag off: delegates to the legacy batch RPC with unchanged shapes', withFlag(undefined, async () => {
  const { calls, client } = fakeClient(() => ({
    data: { allowed: true, current_count: 3, limit: null, is_pro: true, requires_pro: false },
  }));

  const outcome = await consumeScanGate(client, {
    modes: ['all'],
    imageCount: 2,
    scanJobId: 'job-1',
  });

  assert.deepEqual(calls, [
    { name: 'check_and_increment_scan_batch', args: { p_count: 2, p_require_pro: true } },
  ]);
  assert.ok(outcome.ok);
  assert.deepEqual(outcome.scanInfo, { currentCount: 3, limit: null, isPro: true });
  assert.equal(outcome.coinInfo, null);
}));

test('flag off: preserves legacy 429 limit body', withFlag(undefined, async () => {
  const { client } = fakeClient(() => ({
    data: { allowed: false, current_count: 3, limit: 3, is_pro: false, requires_pro: false },
  }));

  const outcome = await consumeScanGate(client, { modes: ['all'], imageCount: 1 });

  assert.ok(!outcome.ok);
  assert.equal(outcome.status, 429);
  assert.deepEqual(outcome.body, {
    error: '本日のスキャン上限（3回）に達しました。',
    limitReached: true,
    scanInfo: { currentCount: 3, limit: 3, isPro: false },
  });
}));

test('flag on: consumes via consume_scan_coins with modes, count, and job id', withFlag('true', async () => {
  const { calls, client } = fakeClient(() => ({
    data: {
      allowed: true,
      requires_pro: false,
      is_pro: true,
      cost: 5,
      monthly_remaining: 290,
      purchased_remaining: 100,
      total_remaining: 390,
      monthly_allowance: 300,
      month_key: '2026-07',
      current_count: 4,
    },
  }));

  const outcome = await consumeScanGate(client, {
    modes: ['all', 'idiom'],
    imageCount: 3,
    scanJobId: 'job-2',
  });

  assert.deepEqual(calls, [
    {
      name: 'consume_scan_coins',
      args: { p_modes: ['all', 'idiom'], p_image_count: 3, p_scan_job_id: 'job-2' },
    },
  ]);
  assert.ok(outcome.ok);
  // limit:null は旧クライアントが「Pro無制限」として扱う互換表現
  assert.deepEqual(outcome.scanInfo, { currentCount: 4, limit: null, isPro: true });
  assert.deepEqual(outcome.coinInfo, {
    cost: 5,
    monthlyRemaining: 290,
    purchasedRemaining: 100,
    totalRemaining: 390,
    monthlyAllowance: 300,
  });
}));

test('flag on: maps requires_pro to the existing 403 body', withFlag('true', async () => {
  const { client } = fakeClient(() => ({
    data: { allowed: false, requires_pro: true, is_pro: false, cost: null },
  }));

  const outcome = await consumeScanGate(client, { modes: ['circled'], imageCount: 1 });

  assert.ok(!outcome.ok);
  assert.equal(outcome.status, 403);
  assert.deepEqual(outcome.body, { error: 'この機能はProプラン限定です。' });
}));

test('flag on: maps insufficient coins to 429 with legacy-compatible body', withFlag('true', async () => {
  const { client } = fakeClient(() => ({
    data: {
      allowed: false,
      reason: 'insufficient_coins',
      requires_pro: false,
      is_pro: true,
      cost: 6,
      monthly_remaining: 1,
      purchased_remaining: 2,
      total_remaining: 3,
      monthly_allowance: 300,
      month_key: '2026-07',
    },
  }));

  const outcome = await consumeScanGate(client, { modes: ['all', 'eiken'], imageCount: 1 });

  assert.ok(!outcome.ok);
  assert.equal(outcome.status, 429);
  assert.deepEqual(outcome.body, {
    error: 'コインが不足しています。コインを購入するか、翌月の付与をお待ちください。',
    // 旧iOSクライアントは limitReached で既存のブロックUIを出す
    limitReached: true,
    insufficientCoins: true,
    scanInfo: { currentCount: 0, limit: null, isPro: true },
    coinInfo: {
      cost: 6,
      monthlyRemaining: 1,
      purchasedRemaining: 2,
      totalRemaining: 3,
      monthlyAllowance: 300,
    },
  });
}));

test('flag on: maps RPC errors to 500 with the existing message', withFlag('true', async () => {
  const { client } = fakeClient(() => ({ error: { message: 'boom' } }));

  const outcome = await consumeScanGate(client, { modes: ['all'], imageCount: 1 });

  assert.ok(!outcome.ok);
  assert.equal(outcome.status, 500);
  assert.deepEqual(outcome.body, { error: 'スキャン制限の確認に失敗しました' });
}));
