import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ensureFriendProfile, getFriendSchemaIssue } from '@/lib/friends/server';
import { parseJsonWithSchema } from '@/lib/api/validation';

const updateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'ユーザー名は1文字以上で入力してください')
    .max(20, 'ユーザー名は20文字以内で入力してください'),
}).strict();

type ProfileRow = {
  username: string | null;
  display_name?: string | null;
  user_handle?: string | null;
  account_id?: string | null;
};

function profileDisplayName(row: ProfileRow | null | undefined): string | null {
  return row?.display_name?.trim() || row?.username?.trim() || row?.user_handle?.trim() || null;
}

function isMissingProfileColumn(error: unknown): boolean {
  const issue = getFriendSchemaIssue(error);
  return issue === 'profiles_account_id'
    || issue === 'profiles_display_name'
    || issue === 'profiles_user_handle'
    || issue === 'profiles_is_public';
}

async function fetchProfileRow(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<ProfileRow | null> {
  const full = await admin
    .from('profiles')
    .select('username,display_name,user_handle,account_id')
    .eq('user_id', userId)
    .maybeSingle<ProfileRow>();

  if (!full.error) return full.data ?? null;
  if (!isMissingProfileColumn(full.error)) {
    throw new Error(full.error.message || 'profile_lookup_failed');
  }

  const legacyWithAccount = await admin
    .from('profiles')
    .select('username,account_id')
    .eq('user_id', userId)
    .maybeSingle<ProfileRow>();

  if (!legacyWithAccount.error) return legacyWithAccount.data ?? null;
  if (!isMissingProfileColumn(legacyWithAccount.error)) {
    throw new Error(legacyWithAccount.error.message || 'profile_lookup_failed');
  }

  const legacy = await admin
    .from('profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle<ProfileRow>();

  if (legacy.error) {
    throw new Error(legacy.error.message || 'profile_lookup_failed');
  }

  return legacy.data ?? null;
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    const admin = getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(bearerToken);
    if (error || !user) return null;
    return user.id;
  }

  const supabase = await createRouteHandlerClient(request);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role after session verification so cookie/JWT → PostgREST auth
    // cannot block reads (avoids 500 when RLS or JWT claims do not attach in this route).
    const admin = getSupabaseAdmin();
    const ensuredProfile = await ensureFriendProfile(userId, admin);
    const data = await fetchProfileRow(admin, userId);

    return NextResponse.json({
      username: profileDisplayName(data),
      accountId: data?.account_id ?? data?.user_handle ?? ensuredProfile.accountId,
    });
  } catch (error) {
    console.error('Profile GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, updateSchema, {
      invalidMessage: 'ユーザー名が不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const admin = getSupabaseAdmin();
    const ensuredProfile = await ensureFriendProfile(userId, admin);
    let { data, error } = await admin
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          username: parsed.data.username,
          display_name: parsed.data.username,
          account_id: ensuredProfile.accountId,
        },
        { onConflict: 'user_id' }
      )
      .select('username,display_name,user_handle,account_id')
      .single<ProfileRow>();

    if (error && isMissingProfileColumn(error)) {
      const fallback = await admin
        .from('profiles')
        .upsert(
          {
            user_id: userId,
            username: parsed.data.username,
          },
          { onConflict: 'user_id' }
        )
        .select('username')
        .single<ProfileRow>();

      data = fallback.data;
      error = fallback.error;
    }

    if (error || !data) {
      console.error('Failed to update profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({
      username: profileDisplayName(data),
      accountId: data.account_id ?? data.user_handle ?? ensuredProfile.accountId,
    });
  } catch (error) {
    console.error('Profile PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
