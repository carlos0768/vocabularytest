import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleOnboardingGet, handleOnboardingPatch, type OnboardingStep } from './route';

class FakeOnboardingAdmin {
  readonly rows = new Map<string, OnboardingStep>();

  constructor(initialRows: Record<string, OnboardingStep> = {}) {
    Object.entries(initialRows).forEach(([userId, step]) => {
      this.rows.set(userId, step);
    });
  }

  from(table: string) {
    assert.equal(table, 'profiles');

    return {
      select: () => ({
        eq: (_field: string, userId: string) => ({
          maybeSingle: async () => ({
            data: this.rows.has(userId)
              ? { onboarding_step: this.rows.get(userId) ?? null }
              : null,
            error: null,
          }),
        }),
      }),
      upsert: (row: { user_id: string; onboarding_step: OnboardingStep }) => {
        this.rows.set(row.user_id, row.onboarding_step);
        return {
          select: () => ({
            single: async () => ({
              data: { onboarding_step: row.onboarding_step },
              error: null,
            }),
          }),
        };
      },
    };
  }
}

function request(method: 'GET' | 'PATCH', body?: unknown) {
  return new NextRequest('http://localhost/api/onboarding', {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('onboarding GET requires authentication', async () => {
  const response = await handleOnboardingGet(request('GET'), {
    resolveUser: async () => null,
    getAdmin: () => new FakeOnboardingAdmin() as never,
  });

  assert.equal(response.status, 401);
});

test('onboarding PATCH requires authentication', async () => {
  const response = await handleOnboardingPatch(request('PATCH', { step: 'signed_up' }), {
    resolveUser: async () => null,
    getAdmin: () => new FakeOnboardingAdmin() as never,
  });

  assert.equal(response.status, 401);
});

test('onboarding GET returns existing signed_up step', async () => {
  const admin = new FakeOnboardingAdmin({ 'user-1': 'signed_up' });

  const response = await handleOnboardingGet(request('GET'), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => admin as never,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { step: 'signed_up' });
});

test('onboarding GET treats a missing profile row as completed', async () => {
  const admin = new FakeOnboardingAdmin();

  const response = await handleOnboardingGet(request('GET'), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => admin as never,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { step: 'completed' });
});

test('onboarding PATCH saves a valid step', async () => {
  const admin = new FakeOnboardingAdmin({ 'user-1': 'signed_up' });

  const response = await handleOnboardingPatch(request('PATCH', { step: 'first_scan_done' }), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => admin as never,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { step: 'first_scan_done' });
  assert.equal(admin.rows.get('user-1'), 'first_scan_done');
});

test('onboarding PATCH rejects an invalid step', async () => {
  const response = await handleOnboardingPatch(request('PATCH', { step: 'guest_signed_up' }), {
    resolveUser: async () => ({ id: 'user-1' }),
    getAdmin: () => new FakeOnboardingAdmin() as never,
  });

  assert.equal(response.status, 400);
});
