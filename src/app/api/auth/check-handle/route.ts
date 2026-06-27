import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getFriendSchemaIssue } from '@/lib/friends/server';

const querySchema = z.object({
  handle: z.string().regex(/^[a-z0-9_]{3,20}$/),
});

type CheckHandleDeps = {
  getAdmin?: typeof getSupabaseAdmin;
};

function isMissingHandleColumn(error: unknown): boolean {
  return getFriendSchemaIssue(error) === 'profiles_user_handle';
}

function isMissingAccountColumn(error: unknown): boolean {
  return getFriendSchemaIssue(error) === 'profiles_account_id';
}

export async function handleCheckHandleGet(
  request: NextRequest,
  deps: CheckHandleDeps = {},
) {
  const handle = request.nextUrl.searchParams.get('handle') ?? '';
  const parsed = querySchema.safeParse({ handle });
  if (!parsed.success) {
    return NextResponse.json({ available: false, error: '不正なID形式です' }, { status: 400 });
  }

  const admin = (deps.getAdmin ?? getSupabaseAdmin)();
  const handleResult = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_handle', parsed.data.handle)
    .maybeSingle();

  if (!handleResult.error) {
    return NextResponse.json({ available: handleResult.data === null });
  }

  if (!isMissingHandleColumn(handleResult.error)) {
    return NextResponse.json({ available: false, error: '確認に失敗しました' }, { status: 500 });
  }

  const accountResult = await admin
    .from('profiles')
    .select('user_id')
    .eq('account_id', parsed.data.handle)
    .maybeSingle();

  if (!accountResult.error) {
    return NextResponse.json({ available: accountResult.data === null });
  }

  if (isMissingAccountColumn(accountResult.error)) {
    return NextResponse.json({ available: true });
  }

  return NextResponse.json({ available: false, error: '確認に失敗しました' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  return handleCheckHandleGet(request);
}
