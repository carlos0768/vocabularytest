import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIGNUP_OTP_LENGTH,
  SIGNUP_RESEND_COOLDOWN_SECONDS,
  SIGNUP_STEPS,
  buildSignupOtpRequestBody,
  buildSignupVerifyRequestBody,
  isSignupOtpComplete,
  resolveSignupRouteError,
  validateSignupCredentials,
  validateOnboardingData,
} from './signup-flow';

test('signup flow splits profile and level before form and otp steps', () => {
  assert.deepEqual(SIGNUP_STEPS, ['profile', 'level', 'form', 'otp']);
  assert.equal(SIGNUP_OTP_LENGTH, 6);
  assert.equal(SIGNUP_RESEND_COOLDOWN_SECONDS, 60);
});

test('signup credentials validation rejects short or mismatched passwords', () => {
  assert.deepEqual(
    validateSignupCredentials({
      password: 'short',
      confirmPassword: 'short',
    }),
    {
      ok: false,
      error: 'パスワードは8文字以上で入力してください',
    },
  );

  assert.deepEqual(
    validateSignupCredentials({
      password: 'password123',
      confirmPassword: 'different123',
    }),
    {
      ok: false,
      error: 'パスワードが一致しません',
    },
  );

  assert.deepEqual(
    validateSignupCredentials({
      password: 'password123',
      confirmPassword: 'password123',
    }),
    { ok: true },
  );
});

test('signup request bodies use the existing OTP API contracts', () => {
  assert.deepEqual(buildSignupOtpRequestBody('User@Example.COM'), {
    email: 'User@Example.COM',
  });

  assert.deepEqual(
    buildSignupVerifyRequestBody({
      email: 'User@Example.COM',
      code: '123456',
      password: 'password123',
    }),
    {
      email: 'User@Example.COM',
      code: '123456',
      password: 'password123',
    },
  );

  assert.deepEqual(
    buildSignupVerifyRequestBody({
      email: 'User@Example.COM',
      code: '123456',
      password: 'password123',
      onboarding: {
        displayName: ' 山田太郎 ',
        userHandle: 'kenta_123',
        eikenLevel: '3',
      },
    }),
    {
      email: 'User@Example.COM',
      code: '123456',
      password: 'password123',
      display_name: '山田太郎',
      user_handle: 'kenta_123',
      eiken_level: '3',
    },
  );
});

test('validateOnboardingData validates name and handle', () => {
  assert.deepEqual(
    validateOnboardingData({ displayName: '', userHandle: 'abc', eikenLevel: null }),
    { ok: false, error: 'ユーザー名は1〜30文字で入力してください' },
  );

  assert.deepEqual(
    validateOnboardingData({ displayName: '山田太郎', userHandle: 'ab', eikenLevel: null }),
    { ok: false, error: 'IDは半角英小文字・数字・アンダースコアで3〜20文字です' },
  );

  assert.deepEqual(
    validateOnboardingData({ displayName: '山田太郎', userHandle: 'AB_UPPER', eikenLevel: null }),
    { ok: false, error: 'IDは半角英小文字・数字・アンダースコアで3〜20文字です' },
  );

  assert.deepEqual(
    validateOnboardingData({ displayName: '山田太郎', userHandle: 'kenta_123', eikenLevel: '3' }),
    { ok: true },
  );
});

test('signup otp completeness stays client-side length based', () => {
  assert.equal(isSignupOtpComplete('12345'), false);
  assert.equal(isSignupOtpComplete('123456'), true);
});

test('signup route errors prefer API messages with a fallback', () => {
  assert.equal(
    resolveSignupRouteError(
      { error: 'このメールアドレスは既に登録されています', existing_user: true },
      '認証コードの送信に失敗しました',
    ),
    'このメールアドレスは既に登録されています',
  );

  assert.equal(
    resolveSignupRouteError({}, '認証コードの送信に失敗しました'),
    '認証コードの送信に失敗しました',
  );
});
