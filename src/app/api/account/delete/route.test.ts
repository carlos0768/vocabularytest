import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleAccountDelete } from './route';

type FakeSubscriptionRow = {
  status: string | null;
  plan: string | null;
  pro_source: string | null;
  test_pro_expires_at: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
};

class FakeAccountDeleteAdmin {
  readonly deletedUserIds: string[] = [];
  selectedColumns = '';
  queriedUserId: string | null = null;

  constructor(
    private readonly subscription: FakeSubscriptionRow | null,
    private readonly subscriptionError: unknown = null,
    private readonly deleteError: unknown = null,
  ) {}

  auth = {
    admin: {
      deleteUser: async (userId: string) => {
        this.deletedUserIds.push(userId);
        return {
          data: { user: null },
          error: this.deleteError,
        };
      },
    },
  };

  from(table: string) {
    assert.equal(table, 'subscriptions');

    return {
      select: (columns: string) => {
        this.selectedColumns = columns;
        return {
          eq: (field: string, userId: string) => {
            assert.equal(field, 'user_id');
            this.queriedUserId = userId;
            return {
              maybeSingle: async () => ({
                data: this.subscription,
                error: this.subscriptionError,
              }),
            };
          },
        };
      },
    };
  }
}

function request(method: 'POST' | 'DELETE' = 'POST') {
  return new NextRequest('http://localhost/api/account/delete', { method });
}

const activeBillingSubscription: FakeSubscriptionRow = {
  status: 'active',
  plan: 'pro',
  pro_source: 'billing',
  test_pro_expires_at: null,
  current_period_end: '2099-01-01T00:00:00.000Z',
  stripe_subscription_id: 'sub_123',
  cancel_at_period_end: false,
};

test('account/delete requires authentication', async () => {
  const admin = new FakeAccountDeleteAdmin(null);

  const response = await handleAccountDelete(request(), {
    resolveUser: async () => null,
    getAdmin: () => admin as never,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(admin.deletedUserIds, []);
});

test('account/delete deletes a free account', async () => {
  const admin = new FakeAccountDeleteAdmin({
    status: 'free',
    plan: 'free',
    pro_source: 'none',
    test_pro_expires_at: null,
    current_period_end: null,
    stripe_subscription_id: null,
    cancel_at_period_end: false,
  });
  const cancelled: string[] = [];

  const response = await handleAccountDelete(request(), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => admin as never,
    cancelBillingSubscription: async (subscriptionId) => {
      cancelled.push(subscriptionId);
      return {} as never;
    },
    now: () => new Date('2026-05-30T00:00:00.000Z'),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    billingSubscriptionCancelled: false,
  });
  assert.equal(admin.queriedUserId, 'user-1');
  assert.deepEqual(admin.deletedUserIds, ['user-1']);
  assert.deepEqual(cancelled, []);
});

test('account/delete cancels active Stripe billing before deleting the user', async () => {
  const admin = new FakeAccountDeleteAdmin(activeBillingSubscription);
  const cancelled: string[] = [];

  const response = await handleAccountDelete(request('DELETE'), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => admin as never,
    cancelBillingSubscription: async (subscriptionId) => {
      cancelled.push(subscriptionId);
      return {} as never;
    },
    now: () => new Date('2026-05-30T00:00:00.000Z'),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    billingSubscriptionCancelled: true,
  });
  assert.deepEqual(cancelled, ['sub_123']);
  assert.deepEqual(admin.deletedUserIds, ['user-1']);
});

test('account/delete blocks active Stripe billing when the subscription id is missing', async () => {
  const admin = new FakeAccountDeleteAdmin({
    ...activeBillingSubscription,
    stripe_subscription_id: null,
  });

  const response = await handleAccountDelete(request(), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => admin as never,
    now: () => new Date('2026-05-30T00:00:00.000Z'),
  });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'missing_stripe_subscription_id');
  assert.deepEqual(admin.deletedUserIds, []);
});

test('account/delete blocks active App Store subscriptions until auto-renew is disabled', async () => {
  const admin = new FakeAccountDeleteAdmin({
    status: 'active',
    plan: 'pro',
    pro_source: 'appstore',
    test_pro_expires_at: null,
    current_period_end: '2099-01-01T00:00:00.000Z',
    stripe_subscription_id: null,
    cancel_at_period_end: false,
  });

  const response = await handleAccountDelete(request(), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => admin as never,
    now: () => new Date('2026-05-30T00:00:00.000Z'),
  });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'active_appstore_subscription');
  assert.deepEqual(admin.deletedUserIds, []);
});

test('account/delete allows App Store accounts after cancellation is scheduled', async () => {
  const admin = new FakeAccountDeleteAdmin({
    status: 'active',
    plan: 'pro',
    pro_source: 'appstore',
    test_pro_expires_at: null,
    current_period_end: '2099-01-01T00:00:00.000Z',
    stripe_subscription_id: null,
    cancel_at_period_end: true,
  });

  const response = await handleAccountDelete(request(), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => admin as never,
    now: () => new Date('2026-05-30T00:00:00.000Z'),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(admin.deletedUserIds, ['user-1']);
});
