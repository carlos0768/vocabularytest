import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const querySchema = z.object({
  handle: z.string().regex(/^[a-z0-9_]{3,20}$/),
});

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle') ?? '';
  const parsed = querySchema.safeParse({ handle });
  if (!parsed.success) {
    return NextResponse.json({ available: false, error: '不正なID形式です' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_handle', parsed.data.handle)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ available: false, error: '確認に失敗しました' }, { status: 500 });
  }

  return NextResponse.json({ available: data === null });
}
