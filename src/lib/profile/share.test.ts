import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileShareDescription,
  buildProfileShareText,
  buildProfileShareUrl,
  fitProfileShareName,
} from './share';

test('builds the public profile URL from the origin and account id', () => {
  assert.equal(buildProfileShareUrl('https://www.merken.jp', 'carlos'), 'https://www.merken.jp/profile/carlos');
});

test('strips a trailing slash on the origin and a leading @ on the id', () => {
  assert.equal(buildProfileShareUrl('https://www.merken.jp/', '@carlos'), 'https://www.merken.jp/profile/carlos');
});

test('encodes characters that are unsafe in a path segment', () => {
  assert.equal(buildProfileShareUrl('https://www.merken.jp', 'a b/c'), 'https://www.merken.jp/profile/a%20b%2Fc');
});

test('share text names the user and their account id', () => {
  assert.equal(buildProfileShareText('カルロス', 'carlos'), 'カルロス（@carlos）のMERKENプロフィール');
});

test('share text does not repeat the account id when there is no username', () => {
  assert.equal(buildProfileShareText('  ', '@carlos'), '@carlosのMERKENプロフィール');
  assert.equal(buildProfileShareText('@carlos', 'carlos'), '@carlosのMERKENプロフィール');
});

test('description includes learning stats only when a public preview is available', () => {
  assert.equal(
    buildProfileShareDescription({
      name: 'カルロス',
      accountId: 'carlos',
      avatarUrl: null,
      streakDays: 12,
      totalWords: 1234,
      masteredWords: 300,
    }),
    '1,234語を学習中・連続12日。MERKENで一緒に英単語を覚えよう。',
  );
  const generic = buildProfileShareDescription(null);
  assert.ok(!generic.includes('carlos'));
});

test('name fitting shrinks long names and truncates beyond 13 characters', () => {
  assert.deepEqual(fitProfileShareName('カルロス'), { text: 'カルロス', fontSize: 84 });
  assert.equal(fitProfileShareName('abcdefghij').fontSize, 66);
  assert.deepEqual(fitProfileShareName('abcdefghijklm'), { text: 'abcdefghijklm', fontSize: 52 });
  assert.equal(fitProfileShareName('abcdefghijklmn').text, 'abcdefghijkl…');
  // サロゲートペア(絵文字)を途中で切らない
  assert.equal(fitProfileShareName('😀'.repeat(20)).text, `${'😀'.repeat(12)}…`);
});
