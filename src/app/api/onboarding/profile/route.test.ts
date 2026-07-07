import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleOnboardingProfilePost } from './route';

type ProfileRow = {
  username: string | null;
  display_name: string | null;
  user_handle: string | null;
  eiken_level: string | null;
  account_id: string | null;
};

const EMPTY_ROW: ProfileRow = {
  username: null,
  display_name: null,
  user_handle: null,
  eiken_level: null,
  account_id: null,
};

class FakeProfileAdmin {
  readonly upserts: Array<Record<string, unknown>> = [];
  private row: ProfileRow | null;
  private upsertErrors: Array<{ code: string; message: string } | null>;

  constructor(
    row: ProfileRow | null,
    upsertErrors: Array<{ code: string; message: string } | null> = [],
  ) {
    this.row = row;
    this.upsertErrors = upsertErrors;
  }

  from(table: string) {
    assert.equal(table, 'profiles');
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: this.row, error: null }),
        }),
      }),
      upsert: (payload: Record<string, unknown>) => {
        this.upserts.push(payload);
        const error = this.upsertErrors.shift() ?? null;
        return {
          select: () => ({
            single: async () => ({
              data: error ? null : { user_id: payload.user_id },
              error,
            }),
          }),
        };
      },
    };
  }
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/onboarding/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('onboarding profile POST requires authentication', async () => {
  const admin = new FakeProfileAdmin(EMPTY_ROW);
  const response = await handleOnboardingProfilePost(
    request({ display_name: '山田太郎' }),
    {
      resolveUser: async () => null,
      getAdmin: () => admin as never,
    },
  );

  assert.equal(response.status, 401);
  assert.equal(admin.upserts.length, 0);
});

test('onboarding profile POST fills empty fields and mirrors handle to account_id', async () => {
  const admin = new FakeProfileAdmin({ ...EMPTY_ROW, account_id: 'mk0123456789' });
  const response = await handleOnboardingProfilePost(
    request({ display_name: '山田太郎', user_handle: 'kenta_123', eiken_level: 'pre2' }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAdmin: () => admin as never,
      // Keep this test focused on profile writes; the wordbook seed is a no-op.
      seedDefaultOfficialWordbooksForUser: async () => 0,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, applied: true });
  assert.deepEqual(admin.upserts, [{
    user_id: 'user-1',
    display_name: '山田太郎',
    username: '山田太郎',
    user_handle: 'kenta_123',
    account_id: 'kenta_123',
    eiken_level: 'pre2',
  }]);
});

test('onboarding profile POST seeds default wordbooks when the eiken level is first applied', async () => {
  const admin = new FakeProfileAdmin(EMPTY_ROW);
  const seedCalls: Array<{ userId: string; level: unknown }> = [];

  const response = await handleOnboardingProfilePost(
    request({ eiken_level: 'pre2' }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAdmin: () => admin as never,
      seedDefaultOfficialWordbooksForUser: async (_client, userId, level) => {
        seedCalls.push({ userId, level });
        return 5;
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, applied: true });
  assert.equal(seedCalls.length, 1);
  assert.equal(seedCalls[0].userId, 'user-1');
  assert.equal(seedCalls[0].level, 'pre2');
});

test('onboarding profile POST does not seed wordbooks when the eiken level is already set', async () => {
  const admin = new FakeProfileAdmin({ ...EMPTY_ROW, eiken_level: '2' });
  let seedCalled = false;

  const response = await handleOnboardingProfilePost(
    request({ display_name: '山田太郎', eiken_level: '5' }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAdmin: () => admin as never,
      seedDefaultOfficialWordbooksForUser: async () => {
        seedCalled = true;
        return 0;
      },
    },
  );

  assert.equal(response.status, 200);
  // display_name still applied, but the already-set eiken level is untouched and
  // must not trigger a re-seed.
  assert.equal(seedCalled, false);
});

test('onboarding profile POST never overwrites existing profile values', async () => {
  const admin = new FakeProfileAdmin({
    username: '既存ユーザー',
    display_name: '既存ユーザー',
    user_handle: 'existing_handle',
    eiken_level: '2',
    account_id: 'custom_id',
  });
  const response = await handleOnboardingProfilePost(
    request({ display_name: '新しい名前', user_handle: 'new_handle', eiken_level: '5' }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAdmin: () => admin as never,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, applied: false });
  assert.equal(admin.upserts.length, 0);
});

test('onboarding profile POST keeps a customised account_id while filling the handle', async () => {
  const admin = new FakeProfileAdmin({ ...EMPTY_ROW, account_id: 'my_custom_id' });
  const response = await handleOnboardingProfilePost(
    request({ user_handle: 'kenta_123' }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAdmin: () => admin as never,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(admin.upserts, [{
    user_id: 'user-1',
    user_handle: 'kenta_123',
  }]);
});

test('onboarding profile POST drops a taken handle but keeps the rest', async () => {
  const admin = new FakeProfileAdmin(
    { ...EMPTY_ROW, account_id: 'mk0123456789' },
    [{ code: '23505', message: 'duplicate key value violates unique constraint "profiles_user_handle_unique"' }],
  );
  const response = await handleOnboardingProfilePost(
    request({ display_name: '山田太郎', user_handle: 'kenta_123' }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAdmin: () => admin as never,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, applied: true });
  assert.equal(admin.upserts.length, 2);
  assert.deepEqual(admin.upserts[1], {
    user_id: 'user-1',
    display_name: '山田太郎',
    username: '山田太郎',
  });
});

test('onboarding profile POST rejects invalid payloads', async () => {
  const admin = new FakeProfileAdmin(EMPTY_ROW);
  const response = await handleOnboardingProfilePost(
    request({ user_handle: 'UPPER_CASE' }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAdmin: () => admin as never,
    },
  );

  assert.equal(response.status, 400);
  assert.equal(admin.upserts.length, 0);
});
