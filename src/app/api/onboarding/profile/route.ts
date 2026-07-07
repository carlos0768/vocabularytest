import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { seedDefaultOfficialWordbooksForUser } from '@/lib/official-wordbooks/import-default';

/**
 * Applies onboarding profile fields (display name / handle / eiken level)
 * collected on the signup screens for users who authenticated via OAuth —
 * the provider redirect happens before signup-verify can persist them.
 * Only fills fields the profile does not have yet, so an existing user who
 * signs in through the signup page never gets their profile overwritten.
 */
const requestSchema = z.object({
  display_name: z.string().trim().min(1).max(20).optional(),
  user_handle: z.string().regex(/^[a-z0-9_]{3,20}$/).optional(),
  eiken_level: z.enum(['5', '4', '3', 'pre2', '2', 'pre1', '1']).nullable().optional(),
}).refine(
  (data) => data.display_name !== undefined
    || data.user_handle !== undefined
    || data.eiken_level !== undefined,
  { message: 'プロフィール項目を1つ以上指定してください' },
);

type ProfileRow = {
  username: string | null;
  display_name: string | null;
  user_handle: string | null;
  eiken_level: string | null;
  account_id: string | null;
};

type OnboardingProfileRouteDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  getAdmin?: typeof getSupabaseAdmin;
  seedDefaultOfficialWordbooksForUser?: typeof seedDefaultOfficialWordbooksForUser;
};

const ACCOUNT_ID_FORMAT = /^[a-z0-9_]{4,24}$/;
// Matches ids minted by generate_profile_account_id() (SQL trigger) and
// buildDefaultAccountId() (signup-verify fallback): "mk" + 10-12 hex chars.
const AUTO_ACCOUNT_ID = /^mk[0-9a-f]{10,12}$/;

function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}

export async function handleOnboardingProfilePost(
  request: NextRequest,
  deps: OnboardingProfileRouteDeps = {},
) {
  try {
    const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'プロフィール情報が不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const admin = (deps.getAdmin ?? getSupabaseAdmin)();
    const { data: current, error: selectError } = await admin
      .from('profiles')
      .select('username,display_name,user_handle,eiken_level,account_id')
      .eq('user_id', user.id)
      .maybeSingle<ProfileRow>();

    if (selectError) {
      console.error('Failed to load profile for onboarding sync:', selectError);
      return NextResponse.json({ error: 'プロフィールの取得に失敗しました' }, { status: 500 });
    }

    const payload: Record<string, string> = {};
    const { display_name, user_handle, eiken_level } = parsed.data;

    if (display_name && !current?.display_name?.trim() && !current?.username?.trim()) {
      payload.display_name = display_name;
      payload.username = display_name;
    }
    if (user_handle && !current?.user_handle?.trim()) {
      payload.user_handle = user_handle;
      // Reflect the chosen handle as the searchable account id unless the
      // user already customised it (auto-minted ids are safe to replace).
      const accountId = current?.account_id?.trim() ?? '';
      if ((accountId === '' || AUTO_ACCOUNT_ID.test(accountId)) && ACCOUNT_ID_FORMAT.test(user_handle)) {
        payload.account_id = user_handle;
      }
    }
    if (eiken_level && !current?.eiken_level?.trim()) {
      payload.eiken_level = eiken_level;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ success: true, applied: false });
    }

    const upsertProfile = (fields: Record<string, string>) => admin
      .from('profiles')
      .upsert({ user_id: user.id, ...fields }, { onConflict: 'user_id' })
      .select('user_id')
      .single();

    let { error } = await upsertProfile(payload);

    // The chosen handle/account id was taken while the user completed OAuth —
    // drop it but still keep the rest of the onboarding data.
    if (error && isUniqueViolation(error) && (payload.user_handle || payload.account_id)) {
      const rest = Object.fromEntries(
        Object.entries(payload).filter(([key]) => key !== 'user_handle' && key !== 'account_id'),
      );
      if (Object.keys(rest).length === 0) {
        return NextResponse.json({ success: true, applied: false });
      }
      ({ error } = await upsertProfile(rest));
    }

    if (error) {
      console.error('Failed to apply onboarding profile:', error);
      return NextResponse.json({ error: 'プロフィール情報の保存に失敗しました' }, { status: 500 });
    }

    // OAuth users establish their EIKEN level here (the provider redirect happens
    // before signup-verify can seed anything), so seed their default wordbooks
    // now that the level is recorded for the first time. This backs up the
    // auth-callback cookie flow for contexts where sessionStorage is the only
    // channel that survived the redirect; persist de-dupes so double-seeding is
    // harmless. A seeding failure must never block onboarding.
    if (payload.eiken_level && eiken_level) {
      try {
        await (deps.seedDefaultOfficialWordbooksForUser ?? seedDefaultOfficialWordbooksForUser)(
          admin,
          user.id,
          eiken_level,
        );
      } catch (seedError) {
        console.error('Failed to seed default official wordbooks during onboarding:', seedError);
      }
    }

    return NextResponse.json({ success: true, applied: true });
  } catch (error) {
    console.error('Onboarding profile POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleOnboardingProfilePost(request);
}
