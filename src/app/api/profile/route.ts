import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
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
};

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const supabase = await createRouteHandlerClient(request);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    const { data: { user }, error } = await supabase.auth.getUser(bearerToken);
    if (error || !user) return null;
    return user.id;
  }

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

    const supabase = await createRouteHandlerClient(request);
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', userId)
      .maybeSingle<ProfileRow>();

    if (error) {
      console.error('Failed to fetch profile:', error);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    return NextResponse.json({
      username: data?.username ?? null,
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

    const supabase = await createRouteHandlerClient(request);
    const { data, error } = await supabase
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

    if (error) {
      console.error('Failed to update profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({
      username: data.username,
    });
  } catch (error) {
    console.error('Profile PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
