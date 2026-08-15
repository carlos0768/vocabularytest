import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../shared';
import { listStudyGroupWords } from '../../shared';

/**
 * グループの共有単語帳を横断した単語一覧（/groups/[groupId]/words 用）。
 * 苦手判定（missCount / learnerCount）も同じ応答に載せるので、クライアントは
 * この1本だけ叩けばよい。
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const { groupId } = await context.params;
    const payload = await listStudyGroupWords(groupId, auth.user.id);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'グループにアクセスできません。' }, { status: 403 });
    }

    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error('study-group words error:', error);
    return NextResponse.json({ success: false, error: '単語一覧の取得に失敗しました。' }, { status: 500 });
  }
}
