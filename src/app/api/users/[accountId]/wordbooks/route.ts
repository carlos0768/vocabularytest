import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolvePublicProfile } from '@/lib/follows/server';
import { listProfileWordbooks } from '@/lib/profile/wordbooks-server';

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

// プロフィールに並べる単語帳の一覧。ログインしていれば誰のものでも見られるが、
// 返すのはタイトル・アイコン・種別・語数だけで、単語の中身は返さない。
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const { accountId: rawAccountId } = await context.params;
  const accountId = rawAccountId?.trim().replace(/^@/, '');
  if (!accountId) {
    return NextResponse.json({ success: false, error: 'missing_account_id' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const profile = await resolvePublicProfile(accountId, admin);
    if (!profile) {
      return NextResponse.json({ success: false, error: 'user_not_found' }, { status: 404 });
    }

    const wordbooks = await listProfileWordbooks(profile.userId, admin);
    return NextResponse.json({
      success: true,
      isSelf: profile.userId === auth.user.id,
      wordbooks,
    });
  } catch (error) {
    console.error('Profile wordbooks failed:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
