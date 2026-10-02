import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MAX_PROFILE_BIO_LENGTH,
  MAX_PROFILE_BIO_LINES,
  countProfileBioChars,
  getProfileBioError,
  normalizeProfileBio,
  splitProfileBio,
} from './bio';

test('normalizeProfileBio trims, unifies newlines and collapses blank runs', () => {
  assert.equal(normalizeProfileBio('  英検準1級  \r\n\r\n\r\n\r\n毎日30語  \n'), '英検準1級\n\n毎日30語');
  assert.equal(normalizeProfileBio('a\rb'), 'a\nb');
});

test('normalizeProfileBio treats blank input as unset', () => {
  assert.equal(normalizeProfileBio(''), null);
  assert.equal(normalizeProfileBio(' \n \n\t'), null);
  assert.equal(normalizeProfileBio(null), null);
  assert.equal(normalizeProfileBio(undefined), null);
});

test('normalizeProfileBio strips invisible control characters but keeps newlines', () => {
  assert.equal(normalizeProfileBio('a​b‮c\u0007\nd'), 'abc\nd');
});

test('bio length counts emoji as one character like Postgres char_length', () => {
  assert.equal(countProfileBioChars('📚あa'), 3);
  assert.equal(getProfileBioError('📚'.repeat(MAX_PROFILE_BIO_LENGTH)), null);
  assert.ok(getProfileBioError('あ'.repeat(MAX_PROFILE_BIO_LENGTH + 1)));
});

test('bio rejects too many lines', () => {
  const ok = Array.from({ length: MAX_PROFILE_BIO_LINES }, (_, i) => `${i}`).join('\n');
  assert.equal(getProfileBioError(ok), null);
  assert.ok(getProfileBioError(`${ok}\nx`));
});

test('MAX_PROFILE_BIO_LENGTH matches the migration CHECK constraint', () => {
  const sql = readFileSync('supabase/migrations/20261002120000_add_profile_bio.sql', 'utf8');
  assert.match(sql, new RegExp(`char_length\\(bio\\) <= ${MAX_PROFILE_BIO_LENGTH}\\b`));
});

test('splitProfileBio turns @account_id into mention segments', () => {
  assert.deepEqual(splitProfileBio('友達は @Merken_Fan です'), [
    { type: 'text', text: '友達は ' },
    { type: 'mention', text: '@Merken_Fan', accountId: 'merken_fan' },
    { type: 'text', text: ' です' },
  ]);
  assert.deepEqual(splitProfileBio('@abc'), [{ type: 'mention', text: '@abc', accountId: 'abc' }]);
});

test('splitProfileBio ignores emails and too-short handles', () => {
  assert.deepEqual(splitProfileBio('mail: me@example.com @ab'), [
    { type: 'text', text: 'mail: me@example.com @ab' },
  ]);
});

test('splitProfileBio keeps all text when joined back', () => {
  const bio = 'こんにちは\n@user_one と @user_two でバトル中!';
  assert.equal(splitProfileBio(bio).map((s) => s.text).join(''), bio);
});
