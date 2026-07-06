import test from 'node:test';
import assert from 'node:assert/strict';

import { refundScanCoinsForJob } from './refund';

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function fakeAdmin(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: result.data ?? null, error: result.error ?? null };
      },
    } as never,
  };
}

test('refundScanCoinsForJob is a no-op when the coin system is disabled', async () => {
  delete process.env.COIN_SYSTEM_ENABLED;
  const { calls, client } = fakeAdmin({ data: { refunded: true } });

  await refundScanCoinsForJob('job-1', client);

  assert.deepEqual(calls, []);
});

test('refundScanCoinsForJob calls the refund RPC when enabled', async () => {
  process.env.COIN_SYSTEM_ENABLED = 'true';
  try {
    const { calls, client } = fakeAdmin({ data: { refunded: true } });

    await refundScanCoinsForJob('job-2', client);

    assert.deepEqual(calls, [
      { name: 'refund_scan_coins', args: { p_scan_job_id: 'job-2' } },
    ]);
  } finally {
    delete process.env.COIN_SYSTEM_ENABLED;
  }
});

test('refundScanCoinsForJob swallows RPC errors (best-effort)', async () => {
  process.env.COIN_SYSTEM_ENABLED = 'true';
  try {
    const { client } = fakeAdmin({ error: { message: 'boom' } });

    // 返還失敗が失敗処理パス自体を壊さないこと
    await assert.doesNotReject(refundScanCoinsForJob('job-3', client));
  } finally {
    delete process.env.COIN_SYSTEM_ENABLED;
  }
});
