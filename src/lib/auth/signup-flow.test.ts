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
} from './signup-flow';

test('signup flow is fixed to form then otp without onboarding steps', () => {
  assert.deepEqual(SIGNUP_STEPS, ['form', 'otp']);
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
