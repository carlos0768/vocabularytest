export const SIGNUP_STEPS = ['profile', 'level', 'form', 'otp'] as const;
export type SignupStep = typeof SIGNUP_STEPS[number];

export const SIGNUP_OTP_LENGTH = 6;
export const SIGNUP_RESEND_COOLDOWN_SECONDS = 60;

export type EikenLevelOption = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

export interface OnboardingData {
  displayName: string;
  userHandle: string;
  eikenLevel: EikenLevelOption;
}

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

export function validateOnboardingData(data: OnboardingData): SignupCredentialsValidation {
  const trimmedName = data.displayName.trim();
  if (trimmedName.length < 1 || trimmedName.length > 30) {
    return { ok: false, error: 'ユーザー名は1〜30文字で入力してください' };
  }

  if (!/^[a-z0-9_]{3,20}$/.test(data.userHandle)) {
    return { ok: false, error: 'IDは半角英小文字・数字・アンダースコアで3〜20文字です' };
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
  onboarding?: OnboardingData;
}) {
  return {
    email: params.email,
    code: params.code,
    password: params.password,
    ...(params.onboarding ? {
      display_name: params.onboarding.displayName.trim(),
      user_handle: params.onboarding.userHandle,
      eiken_level: params.onboarding.eikenLevel,
    } : {}),
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
