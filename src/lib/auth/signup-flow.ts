export const SIGNUP_STEPS = ['form', 'otp'] as const;
export type SignupStep = typeof SIGNUP_STEPS[number];

export const SIGNUP_OTP_LENGTH = 6;
export const SIGNUP_RESEND_COOLDOWN_SECONDS = 60;

export type SignupCredentialsValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateSignupCredentials(params: {
  password: string;
  confirmPassword: string;
}): SignupCredentialsValidation {
  if (params.password.length < 8) {
    return {
      ok: false,
      error: 'パスワードは8文字以上で入力してください',
    };
  }

  if (params.password !== params.confirmPassword) {
    return {
      ok: false,
      error: 'パスワードが一致しません',
    };
  }

  return { ok: true };
}

export function isSignupOtpComplete(code: string): boolean {
  return code.length === SIGNUP_OTP_LENGTH;
}

export function buildSignupOtpRequestBody(email: string) {
  return { email };
}

export function buildSignupVerifyRequestBody(params: {
  email: string;
  code: string;
  password: string;
}) {
  return {
    email: params.email,
    code: params.code,
    password: params.password,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function resolveSignupRouteError(
  data: unknown,
  fallback: string,
): string {
  if (isRecord(data) && typeof data.error === 'string' && data.error) {
    return data.error;
  }

  return fallback;
}
