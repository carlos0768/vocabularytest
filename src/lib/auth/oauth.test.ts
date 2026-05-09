import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOAuthCallbackUrl,
  getOAuthProviderLabel,
  isAuthOAuthProvider,
  normalizeOAuthRedirectPath,
} from './oauth';

test('normalizeOAuthRedirectPath keeps app-relative paths with query and hash', () => {
  assert.equal(normalizeOAuthRedirectPath('/project/abc?tab=words#top'), '/project/abc?tab=words#top');
});

test('normalizeOAuthRedirectPath rejects external and protocol-relative redirects', () => {
  assert.equal(normalizeOAuthRedirectPath('https://evil.example/path'), '/');
  assert.equal(normalizeOAuthRedirectPath('//evil.example/path'), '/');
  assert.equal(normalizeOAuthRedirectPath('javascript:alert(1)'), '/');
});

test('buildOAuthCallbackUrl points Supabase OAuth back to the app callback with next', () => {
  assert.equal(
    buildOAuthCallbackUrl('/projects?sort=recent', 'https://merken.example'),
    'https://merken.example/auth/callback?next=%2Fprojects%3Fsort%3Drecent',
  );
});

test('isAuthOAuthProvider accepts only supported launch providers', () => {
  assert.equal(isAuthOAuthProvider('google'), true);
  assert.equal(isAuthOAuthProvider('apple'), true);
  assert.equal(isAuthOAuthProvider('github'), false);
});

test('getOAuthProviderLabel returns user-facing labels', () => {
  assert.equal(getOAuthProviderLabel('google'), 'Google');
  assert.equal(getOAuthProviderLabel('apple'), 'Apple');
});
