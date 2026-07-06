import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';

import { handleCoinPackCheckoutCompleted, isCoinPackCheckoutSession } from './stripe-webhook';

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

function coinPackSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    mode: 'payment',
    payment_status: 'paid',
    metadata: {
      purpose: 'coin_pack',
      user_id: 'user-1',
      pack_id: 'coins_100',
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

test('isCoinPackCheckoutSession requires payment mode and coin_pack purpose', () => {
  assert.equal(isCoinPackCheckoutSession(coinPackSession()), true);
  assert.equal(
    isCoinPackCheckoutSession(coinPackSession({ mode: 'subscription' } as never)),
    false,
  );
  assert.equal(
    isCoinPackCheckoutSession(coinPackSession({ metadata: { user_id: 'user-1' } } as never)),
    false,
  );
});

test('credits coins from the server-side pack definition, not metadata', async () => {
  const { calls, client } = fakeAdmin({ data: { credited: true } });

  await handleCoinPackCheckoutCompleted(client, coinPackSession({
    metadata: {
      purpose: 'coin_pack',
      user_id: 'user-1',
      pack_id: 'coins_100',
      // 攻撃的なmetadataを混ぜてもコイン数はサーバー定義から解決される
      coins: '999999',
    } as never,
  }));

  assert.deepEqual(calls, [
    {
      name: 'credit_coin_pack',
      args: {
        p_user_id: 'user-1',
        p_coins: 100,
        p_provider: 'stripe',
        p_external_ref: 'cs_test_1',
        p_pack_id: 'coins_100',
      },
    },
  ]);
});

test('skips crediting when the session is not paid yet', async () => {
  const { calls, client } = fakeAdmin({ data: { credited: true } });

  await handleCoinPackCheckoutCompleted(client, coinPackSession({ payment_status: 'unpaid' } as never));

  assert.deepEqual(calls, []);
});

test('treats a duplicate credit as success (idempotent replay)', async () => {
  const { client } = fakeAdmin({ data: { credited: false, reason: 'duplicate' } });

  await assert.doesNotReject(
    handleCoinPackCheckoutCompleted(client, coinPackSession()),
  );
});

test('throws on unknown pack id so the webhook retries visibly', async () => {
  const { calls, client } = fakeAdmin({ data: { credited: true } });

  await assert.rejects(
    handleCoinPackCheckoutCompleted(client, coinPackSession({
      metadata: { purpose: 'coin_pack', user_id: 'user-1', pack_id: 'coins_nope' },
    } as never)),
    /Unknown coin pack id/,
  );
  assert.deepEqual(calls, []);
});

test('throws when user_id is missing from metadata', async () => {
  const { client } = fakeAdmin({ data: { credited: true } });

  await assert.rejects(
    handleCoinPackCheckoutCompleted(client, coinPackSession({
      metadata: { purpose: 'coin_pack', pack_id: 'coins_100' },
    } as never)),
    /No user_id/,
  );
});
