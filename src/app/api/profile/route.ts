import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ensureFriendProfile } from '@/lib/friends/server';
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
  account_id: string | null;
};

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
    const { data, error } = await admin
      .from('profiles')
      .select('username,account_id')
      .eq('user_id', userId)
      .maybeSingle<ProfileRow>();

    if (error) {
      console.error('Failed to fetch profile:', error);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    return NextResponse.json({
      username: data?.username ?? null,
      accountId: data?.account_id ?? ensuredProfile.accountId,
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
    const { data, error } = await admin
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          username: parsed.data.username,
          account_id: ensuredProfile.accountId,
        },
        { onConflict: 'user_id' }
      )
      .select('username,account_id')
      .single<ProfileRow>();

    if (error) {
      console.error('Failed to update profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({
      username: data.username,
      accountId: data.account_id,
    });
  } catch (error) {
    console.error('Profile PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
