import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';

import { POST } from './route';

const routeSource = readFileSync(
  fileURLToPath(new URL('./route.ts', import.meta.url)),
  'utf8',
);

function assertSourceOrder(source: string, fragments: string[]) {
  let cursor = -1;
  for (const fragment of fragments) {
    const index = source.indexOf(fragment, cursor + 1);
    assert.ok(index > cursor, `missing or out-of-order fragment: ${fragment}`);
    cursor = index;
  }
}

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/coins/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('coin checkout returns 404 when the coin system is disabled', async () => {
  delete process.env.COIN_SYSTEM_ENABLED;

  const response = await POST(jsonRequest({ packId: 'coins_100' }));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'コイン機能は現在公開していません',
  });
});

test('coin checkout gates flag → auth → Pro → pack resolution in order', () => {
  assertSourceOrder(routeSource, [
    'if (!isCoinSystemEnabled())',
    'await supabase.auth.getUser()',
    'isActiveProSubscription({',
    "error: 'コインの購入はProプラン限定です'",
    '{ status: 403 }',
    'getCoinPack(parsed.data.packId)',
    'provider.createCheckout({',
  ]);
});

test('coin checkout keeps success/cancel URL contract and default provider', () => {
  assert.ok(routeSource.includes('/coins/success?session_id={CHECKOUT_SESSION_ID}'));
  assert.ok(routeSource.includes('/coins?cancelled=1'));
  assert.ok(routeSource.includes("provider: z.enum(['stripe']).optional().default('stripe')"));
});
