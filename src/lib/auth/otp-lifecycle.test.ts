import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_OTP_MAX_ATTEMPTS,
  AUTH_OTP_ROUTE_SUCCESS_EFFECTS,
  RESET_PASSWORD_VERIFIED_OTP_GRACE_MINUTES,
  buildOtpInsertPayload,
  evaluateAuthOtpCode,
  evaluateResetPasswordVerifiedOtp,
  findAuthUserByNormalizedEmail,
  normalizeOtpEmail,
  resolveAuthOtpSendPolicy,
  type AuthOtpRecord,
} from './otp-lifecycle';

const now = new Date('2026-05-08T12:00:00.000Z');

function otpRecord(overrides: Partial<AuthOtpRecord> = {}): AuthOtpRecord {
  return {
    id: 'otp-123',
    otp_code: '123456',
    expires_at: '2026-05-08T12:10:00.000Z',
    attempts: 0,
    ...overrides,
  };
}

test('normalizes OTP email lookups to lower-case', () => {
  const normalizedEmail = normalizeOtpEmail('USER+OTP@Example.COM');
  assert.equal(normalizedEmail, 'user+otp@example.com');

  const users = [
    { id: 'user-1', email: 'first@example.com' },
    { id: 'user-2', email: 'USER+OTP@example.com' },
  ];

  assert.deepEqual(findAuthUserByNormalizedEmail(users, normalizedEmail), users[1]);
});

test('buildOtpInsertPayload fixes lower-case email, unverified state, and zero attempts', () => {
  assert.deepEqual(buildOtpInsertPayload({
    normalizedEmail: 'user@example.com',
    otpCode: '654321',
  }), {
    email: 'user@example.com',
    otp_code: '654321',
    verified: false,
    attempts: 0,
  });
});

test('send policy fixes signup existing-email 409 and reset-password missing-email concealment', () => {
  assert.deepEqual(resolveAuthOtpSendPolicy('signup', true), {
    action: 'reject_existing_signup',
    shouldSendOtp: false,
    response: {
      body: {
        error: 'このメールアドレスは既に登録されています',
        existing_user: true,
      },
      status: 409,
    },
  });

  assert.deepEqual(resolveAuthOtpSendPolicy('reset-password', false), {
    action: 'conceal_missing_reset_user',
    shouldSendOtp: false,
    response: {
      body: {
        success: true,
        message: '登録されているメールアドレスの場合、認証コードを送信しました',
      },
    },
  });

  assert.deepEqual(resolveAuthOtpSendPolicy('signup', false), {
    action: 'send',
    shouldSendOtp: true,
  });
  assert.deepEqual(resolveAuthOtpSendPolicy('reset-password', true), {
    action: 'send',
    shouldSendOtp: true,
  });
});

test('invalid OTP code increments attempts and fixes MAX_ATTEMPTS at 5', () => {
  assert.equal(AUTH_OTP_MAX_ATTEMPTS, 5);

  const result = evaluateAuthOtpCode({
    otpRecord: otpRecord({ attempts: 2 }),
    code: '000000',
    now,
  });

  assert.deepEqual(result, {
    status: 'invalid_code',
    otpId: 'otp-123',
    attemptsUpdate: { attempts: 3 },
    remainingAttempts: 2,
    response: {
      body: {
        error: '認証コードが正しくありません。残り2回',
      },
      status: 400,
    },
  });
});

test('expired OTP and max-attempt OTP require deleting the OTP row', () => {
  assert.deepEqual(evaluateAuthOtpCode({
    otpRecord: otpRecord({ expires_at: '2026-05-08T11:59:59.999Z' }),
    code: '123456',
    now,
  }), {
    status: 'expired',
    otpId: 'otp-123',
    response: {
      body: {
        error: '認証コードの有効期限が切れました。再度コードを送信してください。',
      },
      status: 400,
    },
  });

  assert.deepEqual(evaluateAuthOtpCode({
    otpRecord: otpRecord({ attempts: AUTH_OTP_MAX_ATTEMPTS }),
    code: '123456',
    now,
  }), {
    status: 'max_attempts',
    otpId: 'otp-123',
    response: {
      body: {
        error: '試行回数の上限に達しました。再度コードを送信してください。',
      },
      status: 400,
    },
  });
});

test('valid OTP code marks the OTP row verified without changing auth user or session state itself', () => {
  assert.deepEqual(evaluateAuthOtpCode({
    otpRecord: otpRecord({ attempts: 4, expires_at: now }),
    code: '123456',
    now,
  }), {
    status: 'verified',
    otpId: 'otp-123',
    verifiedUpdate: { verified: true },
  });
});

test('missing OTP keeps current not-found response shape', () => {
  assert.deepEqual(evaluateAuthOtpCode({
    otpRecord: null,
    code: '123456',
    now,
  }), {
    status: 'missing',
    response: {
      body: {
        error: '認証コードが見つかりません。再度コードを送信してください。',
      },
      status: 400,
    },
  });
});

test('reset-password set-password step uses verified OTP with extra five-minute grace', () => {
  assert.equal(RESET_PASSWORD_VERIFIED_OTP_GRACE_MINUTES, 5);

  assert.deepEqual(evaluateResetPasswordVerifiedOtp({
    otpRecord: null,
    now,
  }), {
    status: 'missing',
    response: {
      body: {
        error: '認証が完了していません。最初からやり直してください。',
      },
      status: 400,
    },
  });

  assert.deepEqual(evaluateResetPasswordVerifiedOtp({
    otpRecord: {
      id: 'otp-123',
      expires_at: '2026-05-08T11:54:59.999Z',
    },
    now,
  }), {
    status: 'expired',
    otpId: 'otp-123',
    response: {
      body: {
        error: 'セッションが期限切れです。最初からやり直してください。',
      },
      status: 400,
    },
  });

  assert.deepEqual(evaluateResetPasswordVerifiedOtp({
    otpRecord: {
      id: 'otp-123',
      expires_at: '2026-05-08T11:55:00.000Z',
    },
    now,
  }), {
    status: 'valid',
    otpId: 'otp-123',
  });
});

test('route success-effects fixture fixes what each OTP route updates after valid OTP state', () => {
  assert.deepEqual(AUTH_OTP_ROUTE_SUCCESS_EFFECTS, {
    verifyOtp: {
      validOtpUpdate: {
        table: 'otp_requests',
        update: { verified: true },
        match: 'id',
      },
      authUser: 'find_existing_or_create_confirmed_user_with_random_password',
      session: 'generate_magiclink_and_verify_token_hash',
      cleanup: {
        table: 'otp_requests',
        deleteWhere: 'email',
      },
    },
    signupVerify: {
      validOtpUpdate: {
        table: 'otp_requests',
        update: { verified: true },
        match: 'id',
      },
      existingEmailConflict: {
        status: 409,
        cleanupBeforeResponse: {
          table: 'otp_requests',
          deleteWhere: 'email',
        },
      },
      authUser: 'create_confirmed_user_with_submitted_password',
      session: 'generate_magiclink_and_verify_token_hash',
      cleanup: {
        table: 'otp_requests',
        deleteWhere: 'email',
      },
    },
    resetPasswordVerify: {
      validOtpUpdate: {
        table: 'otp_requests',
        update: { verified: true },
        match: 'id',
      },
      authUser: 'unchanged',
      session: 'unchanged',
    },
    resetPasswordSetPassword: {
      requiresVerifiedOtp: true,
      verifiedOtpGraceMinutes: 5,
      authUser: 'update_password_by_id',
      cleanup: {
        table: 'otp_requests',
        deleteWhere: 'email',
      },
      session: 'sign_in_with_password_best_effort',
    },
  });
});
