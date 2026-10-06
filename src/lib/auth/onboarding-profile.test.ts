import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOnboardingPath,
  needsOnboardingProfile,
  resolveOnboardingNextPath,
  suggestDisplayNameFromMetadata,
} from './onboarding-profile';

test('needsOnboardingProfile: a missing row means the user never onboarded', () => {
  assert.equal(needsOnboardingProfile(null), true);
  assert.equal(needsOnboardingProfile(undefined), true);
});

test('needsOnboardingProfile: Google signups with an untouched profile must onboard', () => {
  assert.equal(needsOnboardingProfile({ username: null, display_name: null, user_handle: null }), true);
  assert.equal(needsOnboardingProfile({ username: '  ', display_name: '', user_handle: null }), true);
});

test('needsOnboardingProfile: a name without a handle still needs onboarding', () => {
  // The callback drops a handle that was taken mid-OAuth; the user picks another one.
  assert.equal(needsOnboardingProfile({ display_name: '太郎', user_handle: null }), true);
  assert.equal(needsOnboardingProfile({ username: '太郎', user_handle: '' }), true);
});

test('needsOnboardingProfile: a handle without any name still needs onboarding', () => {
  assert.equal(needsOnboardingProfile({ display_name: null, username: null, user_handle: 'taro_1' }), true);
});

test('needsOnboardingProfile: a completed profile is left alone (eiken level is optional)', () => {
  assert.equal(needsOnboardingProfile({ display_name: '太郎', user_handle: 'taro_1' }), false);
  // Legacy rows only have username (display_name came later).
  assert.equal(needsOnboardingProfile({ username: '太郎', display_name: null, user_handle: 'taro_1' }), false);
});

test('buildOnboardingPath carries the destination and drops the default', () => {
  assert.equal(buildOnboardingPath('/'), '/onboarding');
  assert.equal(buildOnboardingPath(null), '/onboarding');
  assert.equal(buildOnboardingPath('/project/abc?tab=words'), '/onboarding?next=%2Fproject%2Fabc%3Ftab%3Dwords');
  assert.equal(buildOnboardingPath('https://evil.example/x'), '/onboarding');
});

test('resolveOnboardingNextPath never loops back to onboarding or auth pages', () => {
  assert.equal(resolveOnboardingNextPath('/onboarding'), '/');
  assert.equal(resolveOnboardingNextPath('/onboarding?next=%2F'), '/');
  assert.equal(resolveOnboardingNextPath('/login?redirect=%2F'), '/');
  assert.equal(resolveOnboardingNextPath('/signup'), '/');
  assert.equal(resolveOnboardingNextPath('/project/abc'), '/project/abc');
  assert.equal(resolveOnboardingNextPath('//evil.example'), '/');
  assert.equal(resolveOnboardingNextPath(null), '/');
});

test('suggestDisplayNameFromMetadata prefills from the Google profile name', () => {
  assert.equal(suggestDisplayNameFromMetadata({ full_name: ' 山田 太郎 ' }), '山田 太郎');
  assert.equal(suggestDisplayNameFromMetadata({ name: 'Taro' }), 'Taro');
  assert.equal(suggestDisplayNameFromMetadata({ full_name: '', name: 'Taro' }), 'Taro');
});

test('suggestDisplayNameFromMetadata caps the name at the 20 chars profiles.username allows', () => {
  assert.equal(suggestDisplayNameFromMetadata({ full_name: 'a'.repeat(30) }), 'a'.repeat(20));
  assert.equal(suggestDisplayNameFromMetadata({ full_name: '𠮷'.repeat(25) })?.length, '𠮷'.repeat(20).length);
});

test('suggestDisplayNameFromMetadata returns null without a usable name', () => {
  assert.equal(suggestDisplayNameFromMetadata(null), null);
  assert.equal(suggestDisplayNameFromMetadata({ email: 'a@b.c' }), null);
  assert.equal(suggestDisplayNameFromMetadata({ full_name: 42 }), null);
});
