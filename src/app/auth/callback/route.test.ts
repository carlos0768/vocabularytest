import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { handleAuthCallbackGet } from './route';
import { OAUTH_ONBOARDING_COOKIE, OAUTH_REDIRECT_COOKIE } from '@/lib/auth/oauth';
import type { OnboardingProfileRow } from '@/lib/auth/onboarding-profile';
import type { SignupProfileFields } from '@/lib/auth/signup-profile';

const USER_ID = 'user-1';
const FAKE_ADMIN = {} as SupabaseClient;

function fakeServerClient(options: { fail?: boolean } = {}) {
  return (async () => ({
    auth: {
      exchangeCodeForSession: async () => (
        options.fail
          ? { data: { user: null, session: null }, error: { message: 'bad code' } }
          : { data: { user: { id: USER_ID }, session: {} }, error: null }
      ),
    },
  })) as unknown as typeof import('@/lib/supabase/server').createClient;
}

function callback(params: {
  cookie?: string;
  query?: string;
  profile: OnboardingProfileRow | null | undefined;
  fail?: boolean;
}) {
  const saved: SignupProfileFields[] = [];
  const seeded: string[] = [];
  const request = new Request(`https://merken.example/auth/callback?code=abc${params.query ?? ''}`, {
    headers: params.cookie ? { cookie: params.cookie } : {},
  });
  const run = handleAuthCallbackGet(request, {
    createServerClient: fakeServerClient({ fail: params.fail }),
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
  return { run, saved, seeded };
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
