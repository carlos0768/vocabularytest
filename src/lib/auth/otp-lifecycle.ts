export const AUTH_OTP_MAX_ATTEMPTS = 5;
export const RESET_PASSWORD_VERIFIED_OTP_GRACE_MINUTES = 5;

export type AuthOtpRecord = {
  id: string;
  otp_code: string;
  expires_at: string | Date;
  attempts: number;
};

export type AuthEmailUser = {
  email?: string | null;
};

export type AuthOtpResponseDescriptor<TBody extends Record<string, unknown> = Record<string, unknown>> = {
  body: TBody;
  status?: number;
};

export type AuthOtpSendFlow = 'signup' | 'reset-password';

export type AuthOtpSendPolicy =
  | {
      action: 'send';
      shouldSendOtp: true;
    }
  | {
      action: 'reject_existing_signup';
      shouldSendOtp: false;
      response: AuthOtpResponseDescriptor<{
        error: string;
        existing_user: true;
      }>;
    }
  | {
      action: 'conceal_missing_reset_user';
      shouldSendOtp: false;
      response: AuthOtpResponseDescriptor<{
        success: true;
        message: string;
      }>;
    };

export type AuthOtpVerificationResult =
  | {
      status: 'missing';
      response: AuthOtpResponseDescriptor<{ error: string }>;
    }
  | {
      status: 'expired';
      otpId: string;
      response: AuthOtpResponseDescriptor<{ error: string }>;
    }
  | {
      status: 'max_attempts';
      otpId: string;
      response: AuthOtpResponseDescriptor<{ error: string }>;
    }
  | {
      status: 'invalid_code';
      otpId: string;
      attemptsUpdate: { attempts: number };
      remainingAttempts: number;
      response: AuthOtpResponseDescriptor<{ error: string }>;
    }
  | {
      status: 'verified';
      otpId: string;
      verifiedUpdate: { verified: true };
    };

export type ResetPasswordVerifiedOtpResult =
  | {
      status: 'missing';
      response: AuthOtpResponseDescriptor<{ error: string }>;
    }
  | {
      status: 'expired';
      otpId: string;
      response: AuthOtpResponseDescriptor<{ error: string }>;
    }
  | {
      status: 'valid';
      otpId: string;
    };

export const AUTH_OTP_ROUTE_SUCCESS_EFFECTS = {
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
    verifiedOtpGraceMinutes: RESET_PASSWORD_VERIFIED_OTP_GRACE_MINUTES,
    authUser: 'update_password_by_id',
    cleanup: {
      table: 'otp_requests',
      deleteWhere: 'email',
    },
    session: 'sign_in_with_password_best_effort',
  },
} as const;

export function normalizeOtpEmail(email: string): string {
  return email.toLowerCase();
}

export function findAuthUserByNormalizedEmail<TUser extends AuthEmailUser>(
  users: readonly TUser[] | null | undefined,
  normalizedEmail: string,
): TUser | undefined {
  return users?.find((user) => user.email?.toLowerCase() === normalizedEmail);
}

export function resolveAuthOtpSendPolicy(
  flow: AuthOtpSendFlow,
  userExists: boolean,
): AuthOtpSendPolicy {
  if (flow === 'signup' && userExists) {
    return {
      action: 'reject_existing_signup',
      shouldSendOtp: false,
      response: {
        body: {
          error: 'このメールアドレスは既に登録されています',
          existing_user: true,
        },
        status: 409,
      },
    };
  }

  if (flow === 'reset-password' && !userExists) {
    return {
      action: 'conceal_missing_reset_user',
      shouldSendOtp: false,
      response: {
        body: {
          success: true,
          message: '登録されているメールアドレスの場合、認証コードを送信しました',
        },
      },
    };
  }

  return {
    action: 'send',
    shouldSendOtp: true,
  };
}

export function buildOtpInsertPayload(params: {
  normalizedEmail: string;
  otpCode: string;
}) {
  return {
    email: params.normalizedEmail,
    otp_code: params.otpCode,
    verified: false,
    attempts: 0,
  };
}

export function evaluateAuthOtpCode(params: {
  otpRecord: AuthOtpRecord | null | undefined;
  code: string;
  now?: Date;
  maxAttempts?: number;
}): AuthOtpVerificationResult {
  const maxAttempts = params.maxAttempts ?? AUTH_OTP_MAX_ATTEMPTS;
  const now = params.now ?? new Date();

  if (!params.otpRecord) {
    return {
      status: 'missing',
      response: {
        body: {
          error: '認証コードが見つかりません。再度コードを送信してください。',
        },
        status: 400,
      },
    };
  }

  const otpRecord = params.otpRecord;
  if (new Date(otpRecord.expires_at) < now) {
    return {
      status: 'expired',
      otpId: otpRecord.id,
      response: {
        body: {
          error: '認証コードの有効期限が切れました。再度コードを送信してください。',
        },
        status: 400,
      },
    };
  }

  if (otpRecord.attempts >= maxAttempts) {
    return {
      status: 'max_attempts',
      otpId: otpRecord.id,
      response: {
        body: {
          error: '試行回数の上限に達しました。再度コードを送信してください。',
        },
        status: 400,
      },
    };
  }

  if (otpRecord.otp_code !== params.code) {
    const remainingAttempts = maxAttempts - otpRecord.attempts - 1;
    return {
      status: 'invalid_code',
      otpId: otpRecord.id,
      attemptsUpdate: { attempts: otpRecord.attempts + 1 },
      remainingAttempts,
      response: {
        body: {
          error: `認証コードが正しくありません。残り${remainingAttempts}回`,
        },
        status: 400,
      },
    };
  }

  return {
    status: 'verified',
    otpId: otpRecord.id,
    verifiedUpdate: { verified: true },
  };
}

export function evaluateResetPasswordVerifiedOtp(params: {
  otpRecord: Pick<AuthOtpRecord, 'id' | 'expires_at'> | null | undefined;
  now?: Date;
  graceMinutes?: number;
}): ResetPasswordVerifiedOtpResult {
  const now = params.now ?? new Date();
  const graceMinutes = params.graceMinutes ?? RESET_PASSWORD_VERIFIED_OTP_GRACE_MINUTES;

  if (!params.otpRecord) {
    return {
      status: 'missing',
      response: {
        body: {
          error: '認証が完了していません。最初からやり直してください。',
        },
        status: 400,
      },
    };
  }

  const expiryTime = new Date(params.otpRecord.expires_at);
  expiryTime.setMinutes(expiryTime.getMinutes() + graceMinutes);

  if (expiryTime < now) {
    return {
      status: 'expired',
      otpId: params.otpRecord.id,
      response: {
        body: {
          error: 'セッションが期限切れです。最初からやり直してください。',
        },
        status: 400,
      },
    };
  }

  return {
    status: 'valid',
    otpId: params.otpRecord.id,
  };
}
