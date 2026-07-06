import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOAuthCallbackUrl,
  buildOAuthOnboardingCookie,
  buildOAuthRedirectCookie,
  readOAuthOnboardingCookie,
  getEnabledOAuthProviders,
  getOAuthProviderLabel,
  isAuthOAuthProvider,
  normalizeOAuthRedirectPath,
  readOAuthRedirectCookie,
} from './oauth';

test('normalizeOAuthRedirectPath keeps app-relative paths with query and hash', () => {
  assert.equal(normalizeOAuthRedirectPath('/project/abc?tab=words#top'), '/project/abc?tab=words#top');
});

test('normalizeOAuthRedirectPath rejects external and protocol-relative redirects', () => {
  assert.equal(normalizeOAuthRedirectPath('https://evil.example/path'), '/');
  assert.equal(normalizeOAuthRedirectPath('//evil.example/path'), '/');
  assert.equal(normalizeOAuthRedirectPath('javascript:alert(1)'), '/');
});

test('buildOAuthCallbackUrl points Supabase OAuth back to a fixed app callback', () => {
  assert.equal(
    buildOAuthCallbackUrl('https://merken.example'),
    'https://merken.example/auth/callback',
  );
});

test('OAuth redirect cookie stores only normalized app-relative paths', () => {
  const cookie = buildOAuthRedirectCookie('/projects?sort=recent', false);
  assert.match(cookie, /^merken_oauth_next=%2Fprojects%3Fsort%3Drecent; Path=\/; Max-Age=600; SameSite=Lax$/);
  assert.equal(readOAuthRedirectCookie(cookie), '/projects?sort=recent');
});

test('OAuth redirect cookie rejects external paths when read', () => {
  assert.equal(readOAuthRedirectCookie('merken_oauth_next=https%3A%2F%2Fevil.example; Path=/'), '/');
});

test('OAuth onboarding cookie stores validated signup profile fields', () => {
  const cookie = buildOAuthOnboardingCookie({
    display_name: ' 山田太郎 ',
    user_handle: 'kenta_123',
    eiken_level: '1',
  }, false);

  assert.deepEqual(readOAuthOnboardingCookie(cookie), {
    display_name: '山田太郎',
    user_handle: 'kenta_123',
    eiken_level: '1',
  });
});

test('OAuth onboarding cookie ignores invalid profile fields', () => {
  const raw = encodeURIComponent(JSON.stringify({
    display_name: '',
    user_handle: 'UPPER',
    eiken_level: 'unknown',
  }));

  assert.equal(readOAuthOnboardingCookie(`merken_oauth_onboarding=${raw}; Path=/`), null);
});

test('isAuthOAuthProvider accepts only supported launch providers', () => {
  assert.equal(isAuthOAuthProvider('google'), true);
  assert.equal(isAuthOAuthProvider('apple'), true);
  assert.equal(isAuthOAuthProvider('github'), false);
});

test('getEnabledOAuthProviders returns only configured supported providers in stable order', () => {
  assert.deepEqual(getEnabledOAuthProviders(undefined), []);
  assert.deepEqual(getEnabledOAuthProviders(''), []);
  assert.deepEqual(getEnabledOAuthProviders('apple, google, github, GOOGLE'), ['google', 'apple']);
});

test('getOAuthProviderLabel returns user-facing labels', () => {
  assert.equal(getOAuthProviderLabel('google'), 'Google');
  assert.equal(getOAuthProviderLabel('apple'), 'Apple');
});
