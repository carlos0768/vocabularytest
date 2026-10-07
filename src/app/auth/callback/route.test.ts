import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { handleAuthCallbackGet } from './route';
import { OAUTH_ONBOARDING_COOKIE, OAUTH_REDIRECT_COOKIE } from '@/lib/auth/oauth';
import type { OnboardingProfileRow } from '@/lib/auth/onboarding-profile';
import type { SignupProfileFields } from '@/lib/auth/signup-profile';

const USER_ID = 'user-1';
const FAKE_ADMIN = {} as SupabaseClient;

const NOW_MS = Date.parse('2026-10-07T09:00:00.000Z');

function fakeServerClient(options: { fail?: boolean; createdAt?: string; signedOut?: string[] } = {}) {
  return (async () => ({
    auth: {
      exchangeCodeForSession: async () => (
        options.fail
          ? { data: { user: null, session: null }, error: { message: 'bad code' } }
          : { data: { user: { id: USER_ID, created_at: options.createdAt }, session: {} }, error: null }
      ),
      signOut: async (params?: { scope?: string }) => {
        options.signedOut?.push(params?.scope ?? 'global');
        return { error: null };
      },
    },
  })) as unknown as typeof import('@/lib/supabase/server').createClient;
}

function callback(params: {
  cookie?: string;
  query?: string;
  profile: OnboardingProfileRow | null | undefined;
  fail?: boolean;
  /** `auth.users.created_at` of the signed-in user (omitted = unknown) */
  createdAt?: string;
  /** defaults to true so the existing flow is pinned regardless of the live flag */
  signupEnabled?: boolean;
}) {
  const saved: SignupProfileFields[] = [];
  const seeded: string[] = [];
  const deleted: string[] = [];
  const signedOut: string[] = [];
  const request = new Request(`https://merken.example/auth/callback?code=abc${params.query ?? ''}`, {
    headers: params.cookie ? { cookie: params.cookie } : {},
  });
  const run = handleAuthCallbackGet(request, {
    createServerClient: fakeServerClient({ fail: params.fail, createdAt: params.createdAt, signedOut }),
    signupEnabled: params.signupEnabled ?? true,
    now: () => NOW_MS,
    deleteAuthUser: async (_admin, userId) => {
      deleted.push(userId);
      return null;
    },
    getAdmin: () => FAKE_ADMIN,
    saveSignupProfileFields: async (_admin, _userId, fields) => {
      saved.push(fields);
      return null;
    },
    seedDefaultOfficialWordbooksForUser: async (_admin, _userId, level) => {
      if (level) seeded.push(level);
      return { imported: 1, skipped: 0 } as never;
    },
    loadOnboardingProfile: async () => params.profile,
  });
  return { run, saved, seeded, deleted, signedOut };
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

test('a Google user whose profile is empty is sent to onboarding instead of the app', async () => {
  const { run, saved } = callback({ profile: { username: null, display_name: null, user_handle: null } });
  const response = await run;

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://merken.example/onboarding');
  assert.equal(saved.length, 0);
});

test('the requested destination is carried through onboarding', async () => {
  const { run } = callback({
    profile: null,
    cookie: `${OAUTH_REDIRECT_COOKIE}=${encodeURIComponent('/project/abc?tab=words')}`,
  });
  const response = await run;

  assert.equal(
    response.headers.get('location'),
    'https://merken.example/onboarding?next=%2Fproject%2Fabc%3Ftab%3Dwords',
  );
});

test('a user who already completed onboarding goes straight to the destination', async () => {
  const { run } = callback({
    profile: { username: null, display_name: '太郎', user_handle: 'taro_1' },
    cookie: `${OAUTH_REDIRECT_COOKIE}=${encodeURIComponent('/goal')}`,
  });
  const response = await run;

  assert.equal(response.headers.get('location'), 'https://merken.example/goal');
});

test('the onboarding cookie from /signup is persisted and the user enters the app', async () => {
  const fields = { display_name: '太郎', user_handle: 'taro_1', eiken_level: '2' };
  const { run, saved, seeded } = callback({
    // The row as it looks once the cookie fields were written.
    profile: { display_name: '太郎', user_handle: 'taro_1' },
    cookie: `${OAUTH_ONBOARDING_COOKIE}=${encodeURIComponent(JSON.stringify(fields))}`,
  });
  const response = await run;

  assert.deepEqual(saved, [fields]);
  assert.deepEqual(seeded, ['2']);
  assert.equal(response.headers.get('location'), 'https://merken.example/');
});

test('a failed profile lookup never blocks login', async () => {
  const { run } = callback({ profile: undefined });
  const response = await run;

  assert.equal(response.headers.get('location'), 'https://merken.example/');
});

test('OAuth cookies are cleared on every redirect', async () => {
  const { run } = callback({ profile: null });
  const cookies = setCookies(await run);

  assert.ok(cookies.some((c) => c.startsWith(`${OAUTH_REDIRECT_COOKIE}=;`) && c.includes('Max-Age=0')));
  assert.ok(cookies.some((c) => c.startsWith(`${OAUTH_ONBOARDING_COOKIE}=;`) && c.includes('Max-Age=0')));
});

test('a failed code exchange goes to the error page without touching the profile', async () => {
  const { run, saved } = callback({ profile: null, fail: true });
  const response = await run;

  assert.equal(response.headers.get('location'), 'https://merken.example/auth/auth-code-error');
  assert.equal(saved.length, 0);
});

// ---------------------------------------------------------------------------
// 新規受付停止中 (`NEW_USER_SIGNUP_ENABLED = false`)
// ---------------------------------------------------------------------------

test('while signup is closed, an account Supabase just created for this sign-in is deleted and sent back to login', async () => {
  const { run, saved, seeded, deleted, signedOut } = callback({
    profile: null,
    signupEnabled: false,
    createdAt: new Date(NOW_MS - 8_000).toISOString(),
    cookie: `${OAUTH_REDIRECT_COOKIE}=${encodeURIComponent('/goal')}`,
  });
  const response = await run;

  assert.deepEqual(deleted, [USER_ID]);
  assert.deepEqual(signedOut, ['local']);
  assert.equal(saved.length, 0);
  assert.equal(seeded.length, 0);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://merken.example/login?signup=closed');
  const cookies = setCookies(response);
  assert.ok(cookies.some((c) => c.startsWith(`${OAUTH_REDIRECT_COOKIE}=;`) && c.includes('Max-Age=0')));
});

test('while signup is closed, the onboarding cookie from /signup never gets persisted for a new account', async () => {
  const fields = { display_name: '太郎', user_handle: 'taro_1', eiken_level: '2' };
  const { run, saved, seeded, deleted } = callback({
    profile: null,
    signupEnabled: false,
    createdAt: new Date(NOW_MS - 3_000).toISOString(),
    cookie: `${OAUTH_ONBOARDING_COOKIE}=${encodeURIComponent(JSON.stringify(fields))}`,
  });
  await run;

  assert.deepEqual(deleted, [USER_ID]);
  assert.deepEqual(saved, []);
  assert.deepEqual(seeded, []);
});

test('while signup is closed, an existing user still signs in through OAuth', async () => {
  const { run, deleted, signedOut } = callback({
    profile: { username: null, display_name: '太郎', user_handle: 'taro_1' },
    signupEnabled: false,
    createdAt: '2026-01-15T00:00:00.000Z',
    cookie: `${OAUTH_REDIRECT_COOKIE}=${encodeURIComponent('/goal')}`,
  });
  const response = await run;

  assert.deepEqual(deleted, []);
  assert.deepEqual(signedOut, []);
  assert.equal(response.headers.get('location'), 'https://merken.example/goal');
});

test('while signup is closed, an existing user without a profile still goes to onboarding (never deleted)', async () => {
  const { run, deleted } = callback({
    profile: { username: null, display_name: null, user_handle: null },
    signupEnabled: false,
    createdAt: '2026-01-15T00:00:00.000Z',
  });
  const response = await run;

  assert.deepEqual(deleted, []);
  assert.equal(response.headers.get('location'), 'https://merken.example/onboarding');
});

test('while signup is closed, a user whose created_at is unknown is never deleted', async () => {
  const { run, deleted } = callback({ profile: null, signupEnabled: false });
  const response = await run;

  assert.deepEqual(deleted, []);
  assert.equal(response.headers.get('location'), 'https://merken.example/onboarding');
});
