import test from 'node:test';
import assert from 'node:assert/strict';

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const mockSessionResponse = {
  id: 'sess_test_123',
  resource: 'session',
  mode: 'customer_payment',
  amount: 500,
  currency: 'JPY',
  session_url: 'https://komoju.test/session',
  return_url: 'https://app.test/subscription/success',
  status: 'created',
};

async function importFreshClientModule() {
  const nonce = Math.random().toString(36).slice(2);
  return import(`./client.ts?nonce=${nonce}`);
}

test('createSubscriptionSession sends mode/email/customer_id and idempotency headers', async () => {
  process.env.KOMOJU_SECRET_KEY = 'sk_test_dummy';

  const calls: FetchCall[] = [];
  const originalFetch = global.fetch;
  global.fetch = (async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(mockSessionResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const { createSubscriptionSession } = await importFreshClientModule();

    await createSubscriptionSession({
      planId: 'pro_monthly',
      customerEmail: 'test@example.com',
      customerId: 'cust_123',
      returnUrl: 'https://app.test/subscription/success',
      cancelUrl: 'https://app.test/subscription/cancel',
      idempotencyKey: 'idem_123',
      metadata: { user_id: 'user_123' },
    });

    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(String(call.input), 'https://komoju.com/api/v1/sessions');
    assert.equal(call.init?.method, 'POST');

    const headers = call.init?.headers as Record<string, string>;
    assert.equal(headers['X-KOMOJU-IDEMPOTENCY'], 'idem_123');
    assert.equal(headers['Idempotency-Key'], 'idem_123');

    const payload = JSON.parse(String(call.init?.body));
    assert.equal(payload.mode, 'customer_payment');
    assert.equal(payload.email, 'test@example.com');
    assert.equal(payload.customer_id, 'cust_123');
    assert.equal(payload.metadata.plan_id, 'pro_monthly');
  } finally {
    global.fetch = originalFetch;
  }
});

test('createSubscriptionSession omits customer_id when not provided', async () => {
  process.env.KOMOJU_SECRET_KEY = 'sk_test_dummy';

  const calls: FetchCall[] = [];
  const originalFetch = global.fetch;
  global.fetch = (async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(mockSessionResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const { createSubscriptionSession } = await importFreshClientModule();

    await createSubscriptionSession({
      planId: 'pro_monthly',
      customerEmail: 'test@example.com',
      returnUrl: 'https://app.test/subscription/success',
      cancelUrl: 'https://app.test/subscription/cancel',
      idempotencyKey: 'idem_456',
      metadata: { user_id: 'user_123' },
    });

    const payload = JSON.parse(String(calls[0]?.init?.body));
    assert.equal(Object.hasOwn(payload, 'customer_id'), false);
    assert.equal(payload.mode, 'customer_payment');
  } finally {
    global.fetch = originalFetch;
  }
});

test('getSession fetches KOMOJU session by id', async () => {
  process.env.KOMOJU_SECRET_KEY = 'sk_test_dummy';

  const calls: FetchCall[] = [];
  const originalFetch = global.fetch;
  global.fetch = (async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(mockSessionResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const { getSession } = await importFreshClientModule();
    const session = await getSession('sess_test_123');

    assert.equal(calls.length, 1);
    assert.equal(String(calls[0].input), 'https://komoju.com/api/v1/sessions/sess_test_123');
    assert.equal(calls[0].init?.method, undefined);
    assert.equal(session.id, 'sess_test_123');
  } finally {
    global.fetch = originalFetch;
  }
});
