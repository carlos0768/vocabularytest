import type { SupabaseClient } from '@supabase/supabase-js';

export type SignupProfileEikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';

export type SignupProfileFields = {
  display_name?: string;
  user_handle?: string;
  eiken_level?: SignupProfileEikenLevel | null;
};

type SignupProfileError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export function buildDefaultAccountId(userId: string): string {
  const compact = userId.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  return `mk${compact.slice(0, 12)}`.slice(0, 24);
}

export function hasSignupProfileFields(fields: SignupProfileFields): boolean {
  return fields.display_name !== undefined
    || fields.user_handle !== undefined
    || fields.eiken_level !== undefined;
}

function isMissingAccountIdError(error: SignupProfileError | null): boolean {
  if (!error || error.code !== '23502') return false;
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  return text.includes('account_id');
}

export function isUniqueSignupProfileViolation(error: { code?: string | null } | null): boolean {
  return error?.code === '23505';
}

export function buildSignupProfilePayload(
  userId: string,
  fields: SignupProfileFields,
  includeAccountId: boolean,
) {
  const payload: {
    user_id: string;
    onboarding_step: 'signed_up';
    username?: string;
    display_name?: string;
    user_handle?: string;
    eiken_level?: SignupProfileEikenLevel | null;
    account_id?: string;
  } = {
    user_id: userId,
    onboarding_step: 'signed_up',
  };

  if (fields.display_name !== undefined) {
    const displayName = fields.display_name.trim();
    payload.display_name = displayName;
    if (displayName.length <= 20) {
      payload.username = displayName;
    }
  }
  if (fields.user_handle !== undefined) payload.user_handle = fields.user_handle;
  if (fields.eiken_level !== undefined) payload.eiken_level = fields.eiken_level;
  if (includeAccountId) payload.account_id = buildDefaultAccountId(userId);

  return payload;
}

export async function saveSignupProfileFields(
  adminClient: SupabaseClient,
  userId: string,
  fields: SignupProfileFields,
): Promise<SignupProfileError | null> {
  const upsertProfile = (includeAccountId: boolean) => adminClient
    .from('profiles')
    .upsert(
      buildSignupProfilePayload(userId, fields, includeAccountId),
      { onConflict: 'user_id' },
    )
    .select('user_id')
    .single();

  const { error } = await upsertProfile(false);
  if (!error) return null;

  if (isMissingAccountIdError(error)) {
    const retry = await upsertProfile(true);
    return retry.error ?? null;
  }

  return error;
}
