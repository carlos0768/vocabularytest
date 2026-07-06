import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { STRIPE_CONFIG } from '../stripe/config';
import {
  handleChargeRefunded,
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleStripeWebhookEvent,
} from './stripe-webhook-handlers';

type QueryFilter = {
  method: 'eq' | 'is' | 'neq' | 'gte';
  column: string;
  value: unknown;
};

type QuerySnapshot = {
  table: string;
  selectColumns: string | null;
  filters: QueryFilter[];
};

type QueryResult = {
  data: unknown;
  error: Error | null;
};

type UpdateCall = {
  table: string;
  payload: Record<string, unknown>;
  filters: QueryFilter[];
};

function findFilter(
  filters: QueryFilter[],
  method: QueryFilter['method'],
  column: string
): QueryFilter | undefined {
  return filters.find((filter) => filter.method === method && filter.column === column);
}

class FakeSupabaseQuery {
  private selectColumns: string | null = null;
  private updatePayload: Record<string, unknown> | null = null;
  private recorded = false;
  readonly filters: QueryFilter[] = [];

  constructor(
    private readonly parent: FakeSupabase,
    private readonly table: string
  ) {}

  select(columns: string): this {
    this.selectColumns = columns;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.updatePayload = payload;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ method: 'eq', column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ method: 'is', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ method: 'neq', column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ method: 'gte', column, value });
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  async maybeSingle(): Promise<QueryResult> {
    return this.parent.resolveSelect({
      table: this.table,
      selectColumns: this.selectColumns,
      filters: [...this.filters],
    });
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveUpdate()).then(onfulfilled, onrejected);
  }

  private resolveUpdate(): QueryResult {
    if (this.updatePayload && !this.recorded) {
      this.parent.updates.push({
        table: this.table,
        payload: this.updatePayload,
        filters: [...this.filters],
      });
      this.recorded = true;
    }
    return { data: null, error: null };
  }
}

class FakeSupabase {
  readonly fromCalls: string[] = [];
  readonly updates: UpdateCall[] = [];

  constructor(
    private readonly resolver: (query: QuerySnapshot) => QueryResult = () => ({
      data: null,
      error: null,
    })
  ) {}

  from(table: string): FakeSupabaseQuery {
    this.fromCalls.push(table);
    return new FakeSupabaseQuery(this, table);
  }

  resolveSelect(query: QuerySnapshot): QueryResult {
    return this.resolver(query);
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

function makeCheckoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    object: 'checkout.session',
    mode: 'subscription',
    metadata: {
      user_id: 'user_1',
      plan_id: STRIPE_CONFIG.plans.pro.id,
    },
    customer: 'cus_test_1',
    subscription: 'sub_test_1',
    ...overrides,
  } as Stripe.Checkout.Session;
}

function makeInvoice(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  return {
    id: 'in_test_1',
    object: 'invoice',
    billing_reason: 'subscription_cycle',
    metadata: {},
    parent: {
      subscription_details: {
        subscription: 'sub_test_1',
        metadata: {},
      },
    },
    lines: {
      data: [
        {
          period: {
            start: 1800000000,
            end: 1802592000,
          },
        },
      ],
    },
    ...overrides,
  } as Stripe.Invoice;
}

test('checkout session completed activates billing from session', async () => {
  const supabase = new FakeSupabase();
  const activationCalls: Array<{
    supabaseAdmin: SupabaseClient;
    params: Record<string, unknown>;
  }> = [];

  await handleCheckoutSessionCompleted(
    supabase.asClient(),
    makeCheckoutSession(),
    {
      activateBillingFromSessionFn: async (supabaseAdmin, params) => {
        activationCalls.push({ supabaseAdmin, params });
        return {
          activated: true,
          alreadyProcessed: false,
          userId: params.userId,
          sessionId: params.sessionId,
          stripeCustomerId: params.customerIdFromEvent ?? 'cus_test_1',
          stripeSubscriptionId: params.subscriptionIdFromEvent ?? 'sub_test_1',
        };
      },
    }
  );

  assert.equal(activationCalls.length, 1);
  assert.equal(activationCalls[0].supabaseAdmin, supabase.asClient());
  assert.deepEqual(activationCalls[0].params, {
    sessionId: 'cs_test_1',
    userId: 'user_1',
    customerIdFromEvent: 'cus_test_1',
    subscriptionIdFromEvent: 'sub_test_1',
    eventType: 'checkout.session.completed',
    context: 'webhook',
  });
});

test('invoice paid resolves subscription id from invoice parent details', async () => {
  const supabase = new FakeSupabase((query) => {
    assert.equal(query.table, 'subscriptions');
    assert.equal(
      findFilter(query.filters, 'eq', 'stripe_subscription_id')?.value,
      'sub_renew_1'
    );
    return { data: { user_id: 'user_renew_1' }, error: null };
  });

  await handleInvoicePaid(
    supabase.asClient(),
    makeInvoice({
      parent: {
        subscription_details: {
          subscription: 'sub_renew_1',
          metadata: {},
        },
      } as Stripe.Invoice.Parent,
    }),
    { now: () => new Date('2027-01-01T00:00:00.000Z') }
  );

  assert.equal(supabase.updates.length, 1);
  assert.equal(
    findFilter(supabase.updates[0].filters, 'eq', 'stripe_subscription_id')?.value,
    'sub_renew_1'
  );
});

test('invoice paid skips the first subscription_create invoice', async () => {
  const supabase = new FakeSupabase(() => {
    throw new Error('first invoice should not query Supabase');
  });

  await handleInvoicePaid(
    supabase.asClient(),
    makeInvoice({ billing_reason: 'subscription_create' })
  );

  assert.deepEqual(supabase.fromCalls, []);
  assert.deepEqual(supabase.updates, []);
});

test('invoice paid for unknown subscription is a no-op', async () => {
  const supabase = new FakeSupabase(() => ({ data: null, error: null }));

  await handleInvoicePaid(
    supabase.asClient(),
    makeInvoice({
      parent: {
        subscription_details: {
          subscription: 'sub_missing_1',
          metadata: {},
        },
      } as Stripe.Invoice.Parent,
    })
  );

  assert.deepEqual(supabase.updates, []);
});

test('charge refunded writes cancellation payload for matching customer', async () => {
  const now = '2027-02-03T04:05:06.000Z';
  const supabase = new FakeSupabase((query) => {
    assert.equal(query.table, 'subscriptions');
    assert.equal(findFilter(query.filters, 'eq', 'stripe_customer_id')?.value, 'cus_refund_1');
    return { data: { user_id: 'user_refund_1' }, error: null };
  });

  await handleChargeRefunded(
    supabase.asClient(),
    {
      id: 'ch_test_1',
      object: 'charge',
      customer: 'cus_refund_1',
    } as Stripe.Charge,
    { now: () => new Date(now) }
  );

  assert.equal(supabase.updates.length, 1);
  assert.deepEqual(supabase.updates[0], {
    table: 'subscriptions',
    payload: {
      status: 'cancelled',
      pro_source: 'billing',
      cancel_at_period_end: false,
      cancel_requested_at: null,
      current_period_end: now,
      updated_at: now,
    },
    filters: [{ method: 'eq', column: 'user_id', value: 'user_refund_1' }],
  });
});

// ============================================
// コインパック分岐（mode: 'payment' + purpose: 'coin_pack'）
// ============================================

class FakeSupabaseWithRpc extends FakeSupabase {
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    return { data: { credited: true }, error: null };
  }
}

test('checkout completed routes coin pack sessions to credit RPC, not billing activation', async () => {
  const supabase = new FakeSupabaseWithRpc();
  const activations: string[] = [];

  await handleCheckoutSessionCompleted(
    supabase.asClient(),
    makeCheckoutSession({
      mode: 'payment',
      payment_status: 'paid',
      metadata: {
        purpose: 'coin_pack',
        user_id: 'user_coin_1',
        pack_id: 'coins_100',
      },
    } as never),
    {
      activateBillingFromSessionFn: async () => {
        activations.push('activated');
        return { ok: true } as never;
      },
    }
  );

  // サブスク有効化パスに入らないこと
  assert.deepEqual(activations, []);
  assert.deepEqual(supabase.rpcCalls, [
    {
      name: 'credit_coin_pack',
      args: {
        p_user_id: 'user_coin_1',
        p_coins: 100,
        p_provider: 'stripe',
        p_external_ref: 'cs_test_1',
        p_pack_id: 'coins_100',
      },
    },
  ]);
});

test('checkout completed ignores payment-mode sessions without coin_pack purpose', async () => {
  const supabase = new FakeSupabaseWithRpc();
  const activations: string[] = [];

  await handleCheckoutSessionCompleted(
    supabase.asClient(),
    makeCheckoutSession({
      mode: 'payment',
      metadata: { user_id: 'user_1' },
    } as never),
    {
      activateBillingFromSessionFn: async () => {
        activations.push('activated');
        return { ok: true } as never;
      },
    }
  );

  assert.deepEqual(activations, []);
  assert.deepEqual(supabase.rpcCalls, []);
});

test('charge refunded for a coin pack must NOT cancel the subscription', async () => {
  const supabase = new FakeSupabase(() => {
    throw new Error('subscriptions must not be queried for coin pack refunds');
  });

  await handleChargeRefunded(
    supabase.asClient(),
    {
      id: 'ch_coin_1',
      object: 'charge',
      customer: 'cus_refund_1',
      metadata: { purpose: 'coin_pack', user_id: 'user_1', pack_id: 'coins_100' },
    } as unknown as Stripe.Charge,
  );

  // ¥150のパック返金でPro購読が解約されないこと（ガードの回帰テスト）
  assert.deepEqual(supabase.fromCalls, []);
  assert.deepEqual(supabase.updates, []);
});

test('async_payment_succeeded credits coin packs for delayed-notification payment methods', async () => {
  const supabase = new FakeSupabaseWithRpc();

  await handleStripeWebhookEvent(
    supabase.asClient(),
    {
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: makeCheckoutSession({
          mode: 'payment',
          payment_status: 'paid',
          metadata: {
            purpose: 'coin_pack',
            user_id: 'user_async_1',
            pack_id: 'coins_100',
          },
        } as never),
      },
    } as unknown as Stripe.Event,
  );

  assert.deepEqual(supabase.rpcCalls, [
    {
      name: 'credit_coin_pack',
      args: {
        p_user_id: 'user_async_1',
        p_coins: 100,
        p_provider: 'stripe',
        p_external_ref: 'cs_test_1',
        p_pack_id: 'coins_100',
      },
    },
  ]);
});
